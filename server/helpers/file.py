import os
import requests
import hashlib
import zipfile
import zipstream
import tarfile
from db.models import GenomeAnnotation

ANNOTATIONS_PATH = os.getenv('LOCAL_ANNOTATIONS_DIR')

def compute_md5_checksum(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def file_is_empty_or_does_not_exist(file_path):
    """
    Check if a file is empty or does not exist.
    """
    if not os.path.exists(file_path):
        return True
    if os.path.getsize(file_path) == 0:
        return True
    return False

def get_annotation_file_path(annotation:GenomeAnnotation):
    """
    Common function to get the full file path for an annotation.
    Handles cleaning the bgzipped_path by removing leading slash if present.
    """
    if not ANNOTATIONS_PATH:
        raise ValueError("LOCAL_ANNOTATIONS_DIR environment variable is not set")
    if not annotation.indexed_file_info or not annotation.indexed_file_info.bgzipped_path:
        raise ValueError(
            f"Annotation {annotation.annotation_id} has no indexed_file_info.bgzipped_path"
        )

    rel_path = annotation.indexed_file_info.bgzipped_path
    bgzipped_path = rel_path.lstrip("/") if rel_path.startswith("/") else rel_path
    return os.path.join(ANNOTATIONS_PATH, bgzipped_path)

def remove_files(files, dir_path) -> list[str]:
    """
    Remove the files and any now-empty parent directories up to `dir_path`.
    return the paths of the files that were deleted
    """
    deleted_files = []
    for f in files:
        if not f or not os.path.exists(f):
            continue
        remove_file_and_empty_parents(f, dir_path)
        deleted_files.append(f)
    return deleted_files

def check_file_exists_and_not_empty(file_path):
    # Check if the file exists
    if os.path.exists(file_path):
        # Check if the file is not empty
        if os.path.getsize(file_path) > 0:
            return True
        else:
            print(f"The file '{file_path}' is empty.")
            return False
    else:
        print(f"The file '{file_path}' does not exist.")
        return False

def download_file_via_http_stream(url, file_name):
    downloaded_file_name=f"{file_name}.gz"

    # Stream the file content using requests
    with requests.get(url, stream=True) as r:
        r.raise_for_status()  # Check for any errors
        with open(downloaded_file_name, 'wb') as f:
        # Write the content to the temp file in chunks
            for chunk in r.iter_content(chunk_size=8192): 
                f.write(chunk)
    return downloaded_file_name  

def create_zip_file(files, zip_file_name):
    with zipfile.ZipFile(zip_file_name, 'w') as zipf:
        for file in files:
            zipf.write(file, os.path.basename(file))
    return zip_file_name

def create_zip_stream(files):
    z = zipstream.ZipFile(mode='w', compression=zipstream.ZIP_DEFLATED)
    for file in files:
        z.write(file, os.path.basename(file))
    for chunk in z:
        yield chunk

def create_tar_stream(files):
    t = tarfile.TarFile(mode='w', compression=tarfile.ZIP_DEFLATED)
    for file in files:
        t.add(file, os.path.basename(file))
    for chunk in t:
        yield chunk

def create_dir_path(root_path, sub_path):
    """
    Create a directory path for an annotation, with the annotation name as the last part of the path
    return the full path
    """
    # Define the full parent path
    parentpath = f"{root_path}/{sub_path}"
    
    
    # Use os.makedirs with exist_ok=True to create any missing directories
    if not os.path.exists(parentpath):
        os.makedirs(parentpath, exist_ok=True)
    
    return parentpath


def remove_file_and_empty_parents(file_path: str, stop_at: str = None) -> None:
    """
    Remove a file and any now-empty parent directories up to `stop_at`.
    
    Args:
        file_path: The path to the file to remove.
        stop_at: Optional. A directory path where cleanup should stop.
                 If None, cleanup goes up until the filesystem root.
    """
    # Remove the file itself if it exists
    if os.path.isfile(file_path):
        os.remove(file_path)

    # Walk up the directory tree removing empty folders
    dir_path = os.path.dirname(file_path)
    while dir_path and os.path.isdir(dir_path):
        # Stop if we've reached the stop_at boundary
        if stop_at and os.path.abspath(dir_path) == os.path.abspath(stop_at):
            break
        try:
            os.rmdir(dir_path)  # only removes if empty
        except OSError:
            break  # not empty → stop cleaning up
        dir_path = os.path.dirname(dir_path)
