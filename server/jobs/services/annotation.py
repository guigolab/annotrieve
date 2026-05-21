import csv
import os
import shutil
import subprocess
import shlex
from datetime import datetime
from typing import Union
import requests
from .utils import create_batches
from db.models import GenomeAnnotation, AnnotationError
from db.embedded_documents import PipelineInfo, IndexedFileInfo
from mongoengine import Q
from helpers import file as file_helper
from helpers import assembly_sequence_files as seq_files
from .classes import AnnotationToProcess
from helpers import pysam_helper

PIPELINE_VERSION = os.getenv('PIPELINE_VERSION', '1.0.0')
PIPELINE_METHOD = os.getenv('PIPELINE_METHOD', 'sort | bgzip | tabix')
PIPELINE_NAME = os.getenv('PIPELINE_NAME', 'sort_bgzip_tabix')

PIPELINE_INFO = {
    'name': PIPELINE_NAME,
    'version': PIPELINE_VERSION,
    'method': PIPELINE_METHOD,
}

SOURCE_URL_CHECK_TIMEOUT = 30
SOURCE_URL_NOT_FOUND_STATUSES = frozenset({404, 410})
SOURCE_URL_CHECK_USER_AGENT = "annotrieve-source-check/1.0"

def handle_annotation_error(annotation_to_process: AnnotationToProcess, error: str):
    """Handle annotation processing errors."""

    url_path = annotation_to_process.access_url
    source_md5 = annotation_to_process.md5_checksum
    
    # Check by url_path first (unique constraint), then by source_md5 as fallback
    annotation_error = AnnotationError.objects(url_path=url_path).first()
    if not annotation_error:
        annotation_error = AnnotationError.objects(source_md5=source_md5).first()
    
    if isinstance(error, Exception):
        error = str(error)
    
    if isinstance(error, str):
        error = error.replace('\n', ';')

    if annotation_error:
        annotation_error.error_message = error
        annotation_error.save()

    else:
        annotation_error = annotation_to_process.to_annotation_error(error)
        annotation_error.save()

def get_annotation(md5_checksum: str) -> GenomeAnnotation:
    """
    Get the annotation from the database by md5 checksum
    """
    return GenomeAnnotation.objects(annotation_id=md5_checksum).first()

def fetch_annotations(urls_to_fetch) -> list[AnnotationToProcess]:
    """
    Fetch the annotations from the urls and yield them
    """
    annotations: list[AnnotationToProcess] = []
    for url in urls_to_fetch:
        try:
            with requests.get(url, stream=True) as r:
                annotations_to_append = []
                r.raise_for_status()
                lines = (line.decode("utf-8") for line in r.iter_lines() if line)
                reader = csv.DictReader(lines, delimiter="\t")
                for row in reader:
                    annotations_to_append.append(AnnotationToProcess(**row))
            annotations.extend(filter_annotations_by_md5_checksum_and_url_path(annotations_to_append))
        except Exception as e:
            print(f"Unexpected error occurred while fetching TSV file: {e}")
            continue
    return annotations

def fetch_from_url(url: str) -> list[AnnotationToProcess]:
    """
    Fetch the annotations from the url and yield them
    """
    annotations: list[AnnotationToProcess] = []
    try:
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            lines = (line.decode("utf-8") for line in r.iter_lines() if line)
            reader = csv.DictReader(lines, delimiter="\t")
            for row in reader:
                annotations.append(AnnotationToProcess(**row))
    except Exception as e:
        print(f"Unexpected error occurred while fetching TSV file: {e}")
        return []
    return annotations
    

def save_annotations(annotations: list[GenomeAnnotation], annotations_path: str) -> list[str]:
    """
    Save the annotations to the database, delete the annotation errors and return the ids of the saved annotations
    if the url path is the same but the md5 checksum is different, the annotation is deleted and the new one is saved
    return the ids of the saved annotations
    """
    saved_annotations_ids = []
    #fetch potential existing url paths
    url_paths = [annotation.source_file_info.url_path for annotation in annotations]

    # delete existing annotations where md5 changed and url path is the same
    # we delete the metadata as the files are already updated
    old_annotations = GenomeAnnotation.objects(source_file_info__url_path__in=url_paths)

    if old_annotations.count() > 0:
        #delete files from the local directory
        remove_files_from_annotations(old_annotations, annotations_path)
        #delete the annotations from the database
        old_annotations.delete()
    try:
        #here we are sure that the annotations are not already in the database
        GenomeAnnotation.objects.insert(annotations)

        #those where the md5 checksum of the original file is the same as the one in the errors or the url path
        source_md5s = [annotation.source_file_info.uncompressed_md5 for annotation in annotations]
        AnnotationError.objects(Q(source_md5__in=source_md5s) | Q(url_path__in=url_paths)).delete()
        saved_annotations_ids = [annotation.annotation_id for annotation in annotations]
        print(f"Saved {len(saved_annotations_ids)} annotations")
    except Exception as e:
        print(f"Batch insert failed, saving annotations individually: {e}")
        for annotation in annotations:
            def record_saved():
                source_md5 = annotation.source_file_info.uncompressed_md5
                url_path = annotation.source_file_info.url_path
                AnnotationError.objects(Q(source_md5=source_md5) | Q(url_path=url_path)).delete()
                saved_annotations_ids.append(annotation.annotation_id)

            try:
                if not GenomeAnnotation.objects(annotation_id=annotation.annotation_id).first():
                    GenomeAnnotation.objects.insert([annotation])
                record_saved()
            except Exception as single_e:
                if GenomeAnnotation.objects(annotation_id=annotation.annotation_id).first():
                    record_saved()
                    continue
                bgzipped_path = file_helper.get_annotation_file_path(annotation)
                csi_path = f"{bgzipped_path}.csi"
                file_helper.remove_files([bgzipped_path, csi_path], annotations_path)
                print(f"Error saving annotation {annotation.annotation_id}: {single_e}")
        if saved_annotations_ids:
            print(f"Saved {len(saved_annotations_ids)} annotations individually")
    return saved_annotations_ids

def filter_annotations_dict_by_field(annotations: list[AnnotationToProcess], field: str, list_of_values: list[str]) -> list[AnnotationToProcess]:
    """
    Filter the annotations by a field and a list of values, return the filtered annotations
    """
    return [annotation for annotation in annotations if getattr(annotation, field) in list_of_values]

def filter_annotations_by_md5_checksum_and_url_path(annotations: list[AnnotationToProcess]) -> list[AnnotationToProcess]:
    """
    Filter out the annotations that already exist (perfect match by source url and md5 checksum) in the database
    """
    urls_to_fetch = [annotation.access_url for annotation in annotations]
    md5s_to_check = [annotation.md5_checksum for annotation in annotations]
    md5s_to_skip = GenomeAnnotation.objects(
        Q(source_file_info__url_path__in=urls_to_fetch) 
        & Q(source_file_info__uncompressed_md5__in=md5s_to_check)
        ).scalar('source_file_info__uncompressed_md5')
    return [annotation for annotation in annotations if annotation.md5_checksum not in md5s_to_skip]

def remove_files_from_annotations(annotations, annotations_path) -> int:
    """
    Remove GFF.gz, tabix .csi, and .contigs.txt for each annotation.
    Returns the number of files that were deleted.
    """
    #collect the paths to delete
    paths = []
    for annotation in annotations:
        path = file_helper.get_annotation_file_path(annotation)
        paths.append(path)
        paths.append(f"{path}{seq_files.CONTIGS_SUFFIX}")
        paths.append(f"{path}.csi")
    deleted_files = file_helper.remove_files(paths, annotations_path)
    return len(deleted_files)

def init_annotation_file_paths(annotations_dir: str, annotation_to_process: AnnotationToProcess) -> tuple[str, str, str]:
    """
    Initialize the file paths for the annotation
    returns:
        full_path: the path to the bgzipped file mapped to the container dir
        relative_path: the relative path to the annotation file, mapped to serve via nginx under /files endpoint
    """
    sub_path = f"{annotation_to_process.taxon_id}/{annotation_to_process.assembly_accession}"
    output_dir = file_helper.create_dir_path(annotations_dir, sub_path)
    file_to_store = f"{annotation_to_process.source_database}_{annotation_to_process.md5_checksum}.gff.gz"
    full_path = f"{output_dir}/{file_to_store}"
    relative_path = f"/{sub_path}/{file_to_store}"
    return full_path, relative_path

def process_annotation_file(annotation_to_process: AnnotationToProcess, tmp_subdir_path: str, bgzipped_path: str, existing_md5_checksum: list[str]) -> tuple[str, int]:
    """
    Process the annotation file and return the md5 checksum and the bgzipped path.
    Steps: download → sort → compute md5 → bgzip → tabix.
    returns:
        uncompressed_md5_checksum: the md5 checksum of the uncompressed file
        file_size: the size of the bgzipped file
    """
    gzipped_downloaded_gff_path = f"{tmp_subdir_path}/{annotation_to_process.md5_checksum}.gff.gz"
    download_gff_file(annotation_to_process, gzipped_downloaded_gff_path)
    if file_helper.file_is_empty_or_does_not_exist(gzipped_downloaded_gff_path):
        raise Exception("Downloaded annotation is empty, skipping...")

    md5_path = f"{tmp_subdir_path}/md5.txt"

    stream_cmd = (
        f"{_sorted_gff_stream_cmd(gzipped_downloaded_gff_path)} "
        f"| tee >(md5sum | awk '{{print $1}}' > {shlex.quote(md5_path)}) "
        f"| bgzip > {shlex.quote(bgzipped_path)}"
    )

    try:
        stream_proc = subprocess.Popen(["bash", "-lc", stream_cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, stream_err = stream_proc.communicate()
        if stream_proc.returncode != 0:
            raise Exception(stream_err.decode('utf-8') if stream_err else 'Streaming pipeline failed')
    except subprocess.CalledProcessError as e:
        raise Exception(f"Streaming pipeline error: {e}")

    tabix_cmd = f"tabix -p gff --csi {shlex.quote(bgzipped_path)}"
    try:
        tabix_proc = subprocess.Popen(["bash", "-lc", tabix_cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, tabix_err = tabix_proc.communicate()
        if tabix_proc.returncode != 0:
            raise Exception(tabix_err.decode('utf-8') if tabix_err else 'Tabix failed')
    except subprocess.CalledProcessError as e:
        raise Exception(f"Tabix error: {e}")

    # Read uncompressed MD5 computed from the sorted stream
    if not os.path.exists(md5_path):
        raise Exception("MD5 file not created by streaming pipeline")
    with open(md5_path, 'r') as f:
        uncompressed_md5_checksum = f.read().strip()
    if not uncompressed_md5_checksum:
        raise Exception("Empty MD5 computed from streaming pipeline")

    if uncompressed_md5_checksum in existing_md5_checksum:
        raise Exception(f"Annotation with md5 checksum {uncompressed_md5_checksum} already exists in the database, skipping...")

    file_size = os.path.getsize(bgzipped_path)
    if file_size == 0:
        raise Exception("Bgzipped sorted annotation is empty, skipping...")
    csi_path = f"{bgzipped_path}.csi"

    if os.path.getsize(csi_path) == 0:
        raise Exception("Tabixing the bgzipped annotation failed, skipping...")

    return uncompressed_md5_checksum, file_size

def init_indexed_file_info(uncompressed_md5_checksum: str, file_size: int, relative_bgzipped_path: str, relative_csi_path: str) -> IndexedFileInfo:
    """
    Initialize the indexed file info
    """
    return IndexedFileInfo(**{
        'uncompressed_md5': uncompressed_md5_checksum,
        'bgzipped_path': relative_bgzipped_path,
        'csi_path': relative_csi_path,
        'file_size': file_size,
        'pipeline': PipelineInfo(**PIPELINE_INFO),
    })

def download_gff_file(annotation_to_process: AnnotationToProcess, downloaded_gff: str):
    """
    Download the gff file from the original url.
    Require both server and TSV to have last_modified; raise otherwise so the tracker in GH can handle it.
    Raise on date mismatch when they differ.
    """
    url = annotation_to_process.access_url
    try:
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            last_modified = get_last_modified_date(r.headers)
            tsv_last_modified = annotation_to_process.last_modified
            if last_modified is None or tsv_last_modified is None:
                raise Exception(
                    f"Missing last_modified: server Last-Modified={last_modified}, tsv last_modified={tsv_last_modified}, url={url}"
                )
            if last_modified != tsv_last_modified:
                raise Exception(
                    f"Date mismatch: server Last-Modified={last_modified}, tsv last_modified={tsv_last_modified}, url={url}"
                )
            with open(downloaded_gff, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
    except Exception as e:
        raise e

def get_sources_and_types(gff_file: str) -> tuple[list[str], list[str]]:
    """
    Get the set of second and third column values from the sorted gff file. return a list of unique values for each column.
    """
    sources = set()
    feature_types = set()
    for line in pysam_helper.stream_gff_file(gff_file):
        fields = line.strip().split('\t')
        if len(fields) < 3:
            continue
        sources.add(fields[1])
        feature_types.add(fields[2])
    return list(sources), list(feature_types)

def get_last_modified_date(headers: dict) -> str:
    """
    This function fetches the last modified date of the annotation file from ncbi ftp server.
    """
    try:
        dt = datetime.strptime(headers.get("Last-Modified"), "%a, %d %b %Y %H:%M:%S %Z")
        return dt.date().isoformat()
    except Exception:
        return None
    
def tabix_gff_file(gff_file):
    """
    Tabix a GFF file, using tabix -p gff -C (create csi index).
    """
    tabix_cmd = ['tabix', '-p', 'gff','-C', gff_file]
    try:
        combined_process = subprocess.Popen(
            tabix_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        _, combined_err = combined_process.communicate()
        if combined_process.returncode != 0 and combined_err:
            print(f"An error occurred: {combined_err.decode('utf-8')}")
            raise Exception(combined_err.decode('utf-8'))
    except subprocess.CalledProcessError as e:
        print(f"An error occurred: {e}")
        raise Exception(f"An error occurred: {e}")

def bgzip_gff_file(gff_file, output_file):
    """
    Bgzip a GFF file, using bgzip -c.
    """
    #check if bgzip is installed
    if not shutil.which('bgzip'):
        print("bgzip is not installed")

    bgzip_cmd = ['bgzip', '-c', gff_file, '>', output_file]
    try:
        with open(output_file, 'wb') as out_f:
            combined_process = subprocess.Popen(
                bgzip_cmd,
                stdout=out_f,
                stderr=subprocess.PIPE
            )
            _, combined_err = combined_process.communicate()
            if combined_process.returncode != 0 and combined_err:
                raise Exception(combined_err.decode('utf-8'))
    except subprocess.CalledProcessError as e:
        raise Exception(f"An error occurred: {e}")

def _gff_decompress_cmd(gff_file: str) -> str:
    """Shell fragment to stream a GFF path (plain or .gz)."""
    path = shlex.quote(gff_file)
    return f"zcat {path}" if gff_file.endswith(".gz") else f"cat {path}"


def _sorted_gff_stream_cmd(gff_file: str) -> str:
    """
    Shell pipeline: comment/header lines first, then data sorted by seqid and start.
    Matches the import pipeline (sort | bgzip | tabix).
    """
    cat = _gff_decompress_cmd(gff_file)
    return (
        f"({cat} | grep '^#'; "
        f"{cat} | grep -v '^#' | sort -t\"$(printf '\\t')\" -k1,1 -k4,4n)"
    )


def sort_gff_file(gff_file, output_file):
    """
    Unzip and sort a GFF file (plain or .gz).
    Streams data without loading into memory.
    """
    sort_cmd = _sorted_gff_stream_cmd(gff_file)

    try:
        with open(output_file, "wb") as out_f:
            combined_process = subprocess.Popen(
                ["bash", "-lc", sort_cmd],
                stdout=out_f,
                stderr=subprocess.PIPE,
            )
            _, combined_err = combined_process.communicate()
            if combined_process.returncode != 0:
                raise Exception(combined_err.decode("utf-8") if combined_err else "Sort failed")
    except subprocess.CalledProcessError as e:
        raise Exception(f"An error occurred: {e}")


def delete_annotations(query: Union[dict, Q], annotations_path: str):
    """
    Delete annotations matching the query and their on-disk GFF, CSI, and contigs.txt files.

    Args:
        query: Either a dict (for keyword arguments) or a Q object (for complex queries)
        annotations_path: Path to the annotations directory
    """
    # Handle both dict and Q object queries
    if isinstance(query, dict):
        annotations_to_delete = GenomeAnnotation.objects(**query)
    else:
        # Q object - pass directly to objects()
        annotations_to_delete = GenomeAnnotation.objects(query)
    
    count = annotations_to_delete.count()
    if count == 0:
        return
    print(f"Deleting {count} annotations")
    remove_files_from_annotations(annotations_to_delete, annotations_path)
    annotations_to_delete.delete()
    print(f"Deleted {count} annotations")


def source_url_is_not_found(url: str, timeout: int = SOURCE_URL_CHECK_TIMEOUT) -> bool | None:
    """
    Return True when the remote source is definitively missing (404/410),
    False when it appears reachable, None when the check is inconclusive.
    """
    headers = {"User-Agent": SOURCE_URL_CHECK_USER_AGENT}
    try:
        resp = requests.head(
            url, timeout=timeout, allow_redirects=True, headers=headers
        )
        if resp.status_code in SOURCE_URL_NOT_FOUND_STATUSES:
            return True
        if resp.status_code < 400:
            return False
        if resp.status_code not in (405,):
            return None
    except requests.RequestException:
        pass

    try:
        with requests.get(
            url,
            timeout=timeout,
            stream=True,
            allow_redirects=True,
            headers=headers,
        ) as resp:
            if resp.status_code in SOURCE_URL_NOT_FOUND_STATUSES:
                return True
            if resp.status_code < 400:
                next(resp.iter_content(chunk_size=1), None)
                return False
            return None
    except requests.RequestException:
        return None


def delete_annotations_with_missing_source_urls(
    *,
    dry_run: bool = False,
    batch_size: int = 500,
) -> dict:
    """
    Remove annotations whose source_file_info.url_path returns HTTP 404 or 410.
    """
    annotations_path = os.getenv("LOCAL_ANNOTATIONS_DIR")
    stats: dict = {
        "dry_run": dry_run,
        "scanned": 0,
        "missing": 0,
        "deleted": 0,
        "skipped_no_url": 0,
        "skipped_inconclusive": 0,
    }

    to_delete_ids: list[str] = []
    for ann in GenomeAnnotation.objects(source_file_info__exists=True).only(
        "annotation_id", "source_file_info"
    ):
        stats["scanned"] += 1
        url = (
            ann.source_file_info.url_path
            if ann.source_file_info and ann.source_file_info.url_path
            else None
        )
        if not url:
            stats["skipped_no_url"] += 1
            continue

        if (stats["scanned"] % 100) == 0:
            print(f"Checked {stats['scanned']} annotation source URLs...")

        not_found = source_url_is_not_found(url)
        if not_found is True:
            stats["missing"] += 1
            to_delete_ids.append(ann.annotation_id)
        elif not_found is None:
            stats["skipped_inconclusive"] += 1

    if dry_run:
        stats["would_delete"] = len(to_delete_ids)
        print(f"Source URL prune dry run: {stats}")
        return stats

    for batch in create_batches(to_delete_ids, batch_size):
        delete_annotations(
            query=dict(annotation_id__in=batch),
            annotations_path=annotations_path,
        )

    stats["deleted"] = len(to_delete_ids)
    print(f"Source URL prune finished: {stats}")
    return stats


def update_stale_annotations(assembly_taxids: list[str]) -> None:
    """
    Update taxonomy fields on annotations whose taxid is not in assembly_taxids.
    Deletes annotations whose assembly no longer exists.
    """
    from . import assembly as assembly_service

    annotations_with_stale_taxids = GenomeAnnotation.objects(taxid__nin=assembly_taxids)
    if annotations_with_stale_taxids.count() == 0:
        return

    pipeline = [
        {
            "$group": {
                "_id": "$assembly_accession",
                "annotation_ids": {"$push": "$annotation_id"},
            }
        }
    ]

    assemblies_not_found = set()
    annotations_by_assembly = {}

    for row in annotations_with_stale_taxids.aggregate(*pipeline):
        acc = row["_id"]
        annotation_ids = row["annotation_ids"]
        annotations_by_assembly[acc] = annotation_ids

    if not annotations_by_assembly:
        return

    related_assembly_accessions = list(annotations_by_assembly.keys())
    assembly_map = assembly_service.build_assembly_lookup(related_assembly_accessions)

    for acc, ann_ids in annotations_by_assembly.items():
        assembly = assembly_map.get(acc)
        if not assembly:
            assemblies_not_found.add(acc)
            continue
        update_payload = dict(
            taxid=assembly.taxid,
            organism_name=assembly.organism_name,
            taxon_lineage=assembly.taxon_lineage,
        )
        GenomeAnnotation.objects(annotation_id__in=ann_ids).update(**update_payload)

    if assemblies_not_found:
        annotations_path = os.getenv("LOCAL_ANNOTATIONS_DIR")
        delete_annotations(
            query=dict(assembly_accession__in=list(assemblies_not_found)),
            annotations_path=annotations_path,
        )


def clean_up_annotations_with_errors():
    """
    Clean up the annotations with errors which url paths are the same as the ones in the valid annotations
    """
    annotations_with_errors_urls = AnnotationError.objects().scalar('url_path')
    existing_annotations = GenomeAnnotation.objects(source_file_info__url_path__in=annotations_with_errors_urls)
    for annotation in existing_annotations:
        AnnotationError.objects(url_path=annotation.source_file_info.url_path).delete()



