import os
import shutil
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from fastapi import BackgroundTasks
from helpers import file as file_helper
from fastapi.responses import StreamingResponse
from fastapi import HTTPException, BackgroundTasks
from typing import Optional
import os
import subprocess
import tempfile
import shutil
from helpers import constants as constants_helper
from helpers import tsv_fields as tsv_fields_helper
import asyncio
from mongoengine import QuerySet
from db.models import GenomeAnnotation

def _cleanup_temp_dir(dir_path: str):
    """Background task to clean up temporary directory."""
    try:
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
    except OSError:
        pass  # Ignore errors if directory was already deleted or doesn't exist

def download_tar_package(annotations: QuerySet[GenomeAnnotation], background_tasks: Optional[BackgroundTasks] = None):
    """
    Download annotations as a tar package.
    
    Args:
        annotations: MongoDB QuerySet of GenomeAnnotation objects (not a list)
        background_tasks: Optional BackgroundTasks for cleanup
    
    Returns:
        StreamingResponse with tar file
    
    Note: This function uses symlinks to organize files, which is efficient and avoids
    command line length limits. Since this runs on Linux servers, symlinks are always supported.
    """
    # Get file paths for tar - iterate once to collect paths
    # Note: annotations is a queryset, not a list
    gff_paths = []
    for annotation in annotations:
        gff_paths.append(file_helper.get_annotation_file_path(annotation))

    if not gff_paths:
        raise HTTPException(status_code=400, detail="No annotations matching the filters were found")
    
    # Create temporary directory for organizing files
    temp_dir = tempfile.mkdtemp(prefix='annotrieve_tar_')
    metadata_dir = os.path.join(temp_dir, 'metadata')
    annotations_dir = os.path.join(temp_dir, 'annotations')
    os.makedirs(metadata_dir, exist_ok=True)
    os.makedirs(annotations_dir, exist_ok=True)
    
    # Create temporary TSV file in metadata directory
    tsv_path = os.path.join(metadata_dir, 'annotations.tsv')
    tsv_file = open(tsv_path, 'w')
    
    try:
        field_map = tsv_fields_helper.resolve_tsv_field_map(None)
        mongo_paths = list(field_map.values())
        column_keys = list(field_map.keys())

        # Write TSV header
        header = "\t".join(column_keys) + "\n"
        tsv_file.write(header)
        tsv_file.flush()  # Ensure header is written to disk
        
        # Write TSV rows incrementally (streaming, not loading into RAM)
        # Re-iterate over annotations for TSV data
        row_count = 0
        for values in tsv_fields_helper.iter_tsv_rows(annotations, mongo_paths):
            row = "\t".join(
                tsv_fields_helper.format_tsv_cell(value) for value in values
            ) + "\n"
            tsv_file.write(row)
            row_count += 1
            # Flush periodically to avoid buffering too much in memory
            if row_count % 1000 == 0:
                tsv_file.flush()
        
        # Final flush and close
        tsv_file.flush()
        tsv_file.close()
        
        # Create symlinks in annotations directory for GFF files
        # This allows us to organize the TAR structure without copying files
        # Since we're on Linux, symlinks are always supported
        for gff_path in gff_paths:
            if os.path.exists(gff_path):
                # Create symlink in annotations directory with just the filename
                link_name = os.path.join(annotations_dir, os.path.basename(gff_path))
                # Use absolute path for symlink target to ensure it works correctly
                abs_gff_path = os.path.abspath(gff_path)
                os.symlink(abs_gff_path, link_name)
        
        # Build tar command using symlinks
        # Use -C to change to temp_dir and use relative paths
        # -h flag follows symlinks so the actual file content is stored, not the symlink
        # This ensures clean folder structure: metadata/annotations.tsv and annotations/*.gff
        # This approach is most efficient and doesn't have command line length issues
        cmd = ["tar", "-chf", "-", "-C", temp_dir, "metadata", "annotations"]
        
        # Start tar process with error handling
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        # Add cleanup task to background tasks - this ensures cleanup even if client disconnects
        # BackgroundTasks will execute after the response is sent, ensuring cleanup happens
        if background_tasks:
            background_tasks.add_task(_cleanup_temp_dir, temp_dir)
        # Note: If background_tasks is None, we still have cleanup in the exception handler above
        # but it's better to always use BackgroundTasks for reliability
        
        async def stream():
            try:
                while True:
                    chunk = await asyncio.to_thread(proc.stdout.read, 8*1024*1024)
                    if not chunk:
                        break
                    yield chunk
            except Exception as e:
                # Check if tar process failed
                proc.poll()
                if proc.returncode and proc.returncode != 0:
                    # Read stderr for error details
                    stderr_output = proc.stderr.read().decode('utf-8', errors='ignore') if proc.stderr else ""
                    raise HTTPException(
                        status_code=500,
                        detail=f"Error creating tar archive: {stderr_output or str(e)}"
                    )
                raise
            finally:
                # Clean up: close process
                # Directory cleanup is handled by BackgroundTasks, but we ensure process is closed
                proc.wait()
                # Check for tar process errors
                if proc.returncode and proc.returncode != 0:
                    stderr_output = proc.stderr.read().decode('utf-8', errors='ignore') if proc.stderr else ""
                    raise HTTPException(
                        status_code=500,
                        detail=f"Tar process failed with return code {proc.returncode}: {stderr_output}"
                    )
                # Also add cleanup here as a backup (runs after streaming completes)
                # This is a safety net in case BackgroundTasks somehow doesn't execute
                if not background_tasks:
                    _cleanup_temp_dir(temp_dir)
        
        return StreamingResponse(
            stream(),
            media_type="application/x-tar",
            headers={"Content-Disposition": "attachment; filename=files.tar"},
            background=background_tasks
        )
    except Exception as e:
        # Clean up on error immediately
        tsv_file.close()
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except OSError:
                pass
        raise e

