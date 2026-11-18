import csv
import functools
import logging
import os
import re
import shutil
import subprocess
import shlex
import signal
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
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

logger = logging.getLogger(__name__)

PIPELINE_VERSION = os.getenv('PIPELINE_VERSION', '1.0.0')
PIPELINE_METHOD = os.getenv('PIPELINE_METHOD', 'sort | bgzip | tabix')
PIPELINE_NAME = os.getenv('PIPELINE_NAME', 'sort_bgzip_tabix')

PIPELINE_INFO = {
    'name': PIPELINE_NAME,
    'version': PIPELINE_VERSION,
    'method': PIPELINE_METHOD,
}

# (connect, read) seconds; the read timeout applies to each socket read, not the whole transfer.
REQUEST_TIMEOUT = (10, 120)
# Hard cap for one whole GFF download and for each shell stage (sort|bgzip, tabix).
DOWNLOAD_TIMEOUT = int(os.getenv('ANNOTATION_DOWNLOAD_TIMEOUT', 3 * 3600))
PROCESS_TIMEOUT = int(os.getenv('ANNOTATION_PROCESS_TIMEOUT', 6 * 3600))
# GNU sort sizes its in-memory buffer from the *host* RAM, ignoring container (cgroup) limits, so cap it
# explicitly; anything beyond spills to temp files in the per-annotation work dir.
def _valid_sort_size(value: str, default: str) -> str:
    return value if re.fullmatch(r"\d+[KMGTkmgt%]?", value or "") else default


SORT_BUFFER_SIZE = _valid_sort_size(os.getenv('ANNOTATION_SORT_BUFFER', '512M'), '512M')
SORT_THREADS = max(1, int(os.getenv('ANNOTATION_SORT_THREADS', 2)))
# `tee >(md5sum ...)` is not waited on by bash: allow the md5 file to appear after the pipeline ends.
MD5_WAIT_SECONDS = 30

SOURCE_URL_CHECK_TIMEOUT = 30
SOURCE_URL_NOT_FOUND_STATUSES = frozenset({404, 410})
SOURCE_URL_CHECK_USER_AGENT = "annotrieve-source-check/1.0"


class DuplicateAnnotationContentError(Exception):
    """
    Raised by process_annotation_file when the freshly downloaded+sorted content's
    md5 checksum already belongs to an existing GenomeAnnotation document.

    This is NOT necessarily a real error: it typically means the source moved to a
    new URL while the content itself is unchanged (e.g. an Ensembl release directory
    was renamed). Callers should NOT treat this like a generic processing failure —
    in particular they must not delete full_bgzipped_path/full_csi_path, since those
    paths are derived deterministically from (taxon_id, assembly_accession,
    source_database, md5_checksum) and are therefore the *same* files already backing
    the existing, still-valid document. See handle_duplicate_annotation_content.
    """

    def __init__(self, md5_checksum: str):
        self.md5_checksum = md5_checksum
        super().__init__(
            f"Annotation with md5 checksum {md5_checksum} already exists in the database"
        )

ERROR_KIND_CONFLICT = "conflict"            # data conflict that retrying right away cannot fix
ERROR_KIND_MD5_MISMATCH = "md5_mismatch"    # stored fine, but the tracker md5 did not match the download
CONFLICT_RETRY_DAYS = int(os.getenv("ANNOTATION_CONFLICT_RETRY_DAYS", "30") or 30)


def handle_annotation_error(annotation_to_process: AnnotationToProcess, error: str, kind: str | None = None):
    """Handle annotation processing errors.

    Never raises: a failure to persist the error document must not abort the
    import batch (e.g. incomplete dates on AnnotationError).
    """

    url_path = annotation_to_process.access_url
    source_md5 = annotation_to_process.md5_checksum
    
    # Check by url_path first (unique constraint), then by source_md5 as fallback
    try:
        annotation_error = AnnotationError.objects(url_path=url_path).first()
        if not annotation_error:
            annotation_error = AnnotationError.objects(source_md5=source_md5).first()
    except Exception as e:
        logger.warning(f"Failed to look up AnnotationError for {url_path}: {e}")
        return
    
    if isinstance(error, Exception):
        error = str(error)
    
    if isinstance(error, str):
        error = error.replace('\n', ';')

    try:
        if annotation_error:
            annotation_error.error_message = error
        else:
            annotation_error = annotation_to_process.to_annotation_error(error)
        # AnnotationError is a DynamicDocument: `error_kind` / `recorded_at` are plain extra fields
        annotation_error.error_kind = kind
        annotation_error.recorded_at = datetime.now(timezone.utc).replace(tzinfo=None)
        annotation_error.save()
    except Exception as e:
        logger.warning(f"Failed to save AnnotationError for {url_path}: {e}")


def update_annotation_source_metadata(existing: GenomeAnnotation, annotation_to_process: AnnotationToProcess) -> bool:
    """
    Refresh an existing GenomeAnnotation's source_file_info so it reflects the source as the
    tracker lists it now: url_path, source md5 and the source dates. Used when a re-processed
    annotation's content md5 matches `existing` exactly, but the source metadata differs
    (moved url, new source md5, new dates).

    Returns True if anything was updated, False otherwise (no-op or conflict).
    Never raises: any problem is logged and treated as a no-op so callers can safely
    continue processing other annotations.
    """
    if not existing or not existing.source_file_info:
        return False

    old_url = existing.source_file_info.url_path
    old_md5 = existing.source_file_info.uncompressed_md5
    new_url = annotation_to_process.access_url
    new_md5 = annotation_to_process.md5_checksum

    update_fields = {}

    # url_path and uncompressed_md5 are unique=True: guard against colliding with a
    # *different* annotation before attempting the update, so we never raise a
    # NotUniqueError here.
    if new_url and new_url != old_url:
        conflicting = GenomeAnnotation.objects(
            source_file_info__url_path=new_url, annotation_id__ne=existing.annotation_id
        ).first()
        if conflicting:
            message = (
                f"Cannot update url_path for annotation {existing.annotation_id}: "
                f"{new_url} is already used by a different annotation ({conflicting.annotation_id})"
            )
            logger.warning(message)
            handle_annotation_error(annotation_to_process, message, kind=ERROR_KIND_CONFLICT)
            return False
        update_fields["source_file_info__url_path"] = new_url

    if new_md5 and new_md5 != old_md5:
        conflicting = GenomeAnnotation.objects(
            source_file_info__uncompressed_md5=new_md5, annotation_id__ne=existing.annotation_id
        ).first()
        if conflicting:
            message = (
                f"Cannot update source md5 for annotation {existing.annotation_id}: "
                f"{new_md5} is already used by a different annotation ({conflicting.annotation_id})"
            )
            logger.warning(message)
            handle_annotation_error(annotation_to_process, message, kind=ERROR_KIND_CONFLICT)
            return False
        update_fields["source_file_info__uncompressed_md5"] = new_md5

    for field, incoming, current in (
        ("source_file_info__last_modified", annotation_to_process.last_modified, existing.source_file_info.last_modified),
        ("source_file_info__release_date", annotation_to_process.release_date, existing.source_file_info.release_date),
    ):
        if not incoming:
            continue
        try:
            parsed = GenomeAnnotation.parse_iso_date(incoming)
        except Exception as e:
            logger.warning(f"Could not parse {field.rsplit('__', 1)[1]} '{incoming}' for {existing.annotation_id}: {e}")
            continue
        if parsed != current:
            update_fields[field] = parsed

    if not update_fields:
        return False

    try:
        existing.modify(**update_fields)
    except Exception as e:
        logger.warning(f"Failed to update source metadata for annotation {existing.annotation_id}: {e}")
        return False

    logger.info(f"Updated source metadata for annotation {existing.annotation_id}: {sorted(update_fields)} ({old_url} -> {new_url})")

    # Clean up any lingering AnnotationError entries tied to either url or this md5,
    # they no longer represent a real problem.
    try:
        AnnotationError.objects(
            Q(url_path=old_url) | Q(url_path=new_url) | Q(source_md5=existing.annotation_id)
            | Q(source_md5=old_md5) | Q(source_md5=new_md5)
        ).delete()
    except Exception as e:
        logger.warning(f"Failed to clean up AnnotationError entries for {existing.annotation_id}: {e}")

    return True


def handle_duplicate_annotation_content(annotation_to_process: AnnotationToProcess, content_md5: str) -> None:
    """
    Called when process_annotation_file raised DuplicateAnnotationContentError: the
    freshly downloaded+sorted content for `annotation_to_process` hashes to a value
    that already belongs to an existing GenomeAnnotation. This typically means the
    source moved to a new URL while the content is unchanged (e.g. an Ensembl release
    directory was renamed).

    IMPORTANT: this function must never delete files. process_annotation_file never
    publishes files at the final path for duplicate content (it works on ``.part``
    files that it removes itself), so nothing on disk needs reconciling here.
    """
    existing = GenomeAnnotation.objects(annotation_id=content_md5).first()
    if not existing:
        # Extremely unlikely: existing_annotation_md5s (captured at job start) said this
        # md5 exists, but the document is gone now (e.g. deleted concurrently by another
        # process). We can't safely assume ownership of the on-disk path here, so just
        # record it as an error without touching any files.
        handle_annotation_error(
            annotation_to_process,
            f"Duplicate content md5 {content_md5} detected but no matching annotation "
            f"found in the database",
        )
        return

    if existing.assembly_accession != annotation_to_process.assembly_accession:
        # Same bytes published for another assembly: do not hijack this record's source.
        handle_annotation_error(
            annotation_to_process,
            f"Content identical to annotation {content_md5}, which belongs to a different assembly "
            f"({existing.assembly_accession})",
            kind=ERROR_KIND_CONFLICT,
        )
        return

    updated = update_annotation_source_metadata(existing, annotation_to_process)
    if not updated:
        logger.info(
            f"Duplicate content md5 {content_md5} for {annotation_to_process.access_url}: "
            f"no source metadata change needed/possible"
        )


def safe_remove_annotation_file(full_path: str, annotations_path: str, relative_path: str) -> None:
    """
    Remove a file created/touched during a FAILED processing attempt, unless it is
    still referenced by an existing GenomeAnnotation document's indexed_file_info.
    This guards against a processing failure destroying a file that a live database
    record still depends on, regardless of which code path led to the failure.
    """
    if not full_path or not os.path.exists(full_path):
        return

    if relative_path:
        still_referenced = GenomeAnnotation.objects(
            Q(indexed_file_info__bgzipped_path=relative_path)
            | Q(indexed_file_info__csi_path=relative_path)
        ).first()
        if still_referenced:
            logger.warning(
                f"Not removing {full_path}: still referenced by annotation "
                f"{still_referenced.annotation_id}"
            )
            return

    file_helper.remove_file_and_empty_parents(full_path, annotations_path)


def get_annotation(md5_checksum: str) -> GenomeAnnotation:
    """
    Get the annotation from the database by md5 checksum
    """
    return GenomeAnnotation.objects(annotation_id=md5_checksum).first()

def fetch_from_url(url: str) -> list[AnnotationToProcess]:
    """
    Fetch the annotations from the url and yield them
    """
    annotations: list[AnnotationToProcess] = []
    try:
        with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT) as r:
            r.raise_for_status()
            lines = (line.decode("utf-8") for line in r.iter_lines() if line)
            reader = csv.DictReader(lines, delimiter="\t")
            for row in reader:
                annotations.append(AnnotationToProcess(**row))
    except Exception as e:
        logger.warning(f"Unexpected error occurred while fetching TSV file: {e}")
        return []
    return annotations
    

def _remove_new_annotation_files(annotation: GenomeAnnotation, annotations_path: str, keep_paths: set) -> None:
    """Remove the bgzip/csi/contigs files of a freshly processed annotation that could not be saved."""
    bgzipped_path = file_helper.get_annotation_file_path(annotation)
    if bgzipped_path in keep_paths:
        return  # same path as a document we are about to restore: never delete its files
    file_helper.remove_files(
        [bgzipped_path, f"{bgzipped_path}.csi", f"{bgzipped_path}{seq_files.CONTIGS_SUFFIX}"],
        annotations_path,
    )


def _record_save_failure(annotation: GenomeAnnotation, error: Exception) -> None:
    """Record an AnnotationError for a processed annotation that could not be stored. Never raises."""
    try:
        info = annotation.source_file_info
        message = f"Could not save annotation {annotation.annotation_id}: {error}".replace('\n', ';')
        existing = AnnotationError.objects(url_path=info.url_path).first()
        if existing:
            existing.error_message = message
            existing.save()
            return
        AnnotationError(
            assembly_accession=annotation.assembly_accession,
            taxid=annotation.taxid,
            organism_name=annotation.organism_name,
            error_message=message,
            url_path=info.url_path,
            source_md5=info.uncompressed_md5,
            release_date=info.release_date,
            last_modified=info.last_modified,
            source_database=info.database,
        ).save()
    except Exception as record_error:
        logger.warning(f"Failed to record save error for {annotation.annotation_id}: {record_error}")


def save_annotations(annotations: list[GenomeAnnotation], annotations_path: str) -> list[str]:
    """
    Save the annotations to the database, delete the matching annotation errors and return the
    ids of the saved annotations.

    If the url path is already stored with a different md5, the old document is replaced. The old
    document and its files are only discarded once the replacement is stored; if the replacement
    cannot be saved the old document is restored (and its files were never touched), so a failed
    update never loses the annotation that was already live. Failures are recorded as AnnotationError.
    """
    saved_annotations_ids: list[str] = []
    url_paths = [annotation.source_file_info.url_path for annotation in annotations]
    new_paths = {file_helper.get_annotation_file_path(annotation) for annotation in annotations}

    # Documents whose md5 changed under the same url path. Unique indexes force us to remove them
    # from the collection before inserting the replacement, but their files stay until the end.
    old_annotations = list(GenomeAnnotation.objects(source_file_info__url_path__in=url_paths).no_cache())
    if old_annotations:
        GenomeAnnotation.objects(annotation_id__in=[old.annotation_id for old in old_annotations]).delete()
    old_paths = {file_helper.get_annotation_file_path(old) for old in old_annotations}

    try:
        #here we are sure that the annotations are not already in the database
        GenomeAnnotation.objects.insert(annotations)

        #those where the md5 checksum of the original file is the same as the one in the errors or the url path
        source_md5s = [annotation.source_file_info.uncompressed_md5 for annotation in annotations]
        AnnotationError.objects(Q(source_md5__in=source_md5s) | Q(url_path__in=url_paths)).delete()
        saved_annotations_ids = [annotation.annotation_id for annotation in annotations]
        logger.info(f"Saved {len(saved_annotations_ids)} annotations")
    except Exception as e:
        logger.warning(f"Batch insert failed, saving annotations individually: {e}")
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
                logger.warning(f"Error saving annotation {annotation.annotation_id}: {single_e}")
                _record_save_failure(annotation, single_e)
                _remove_new_annotation_files(annotation, annotations_path, keep_paths=old_paths)
        if saved_annotations_ids:
            logger.info(f"Saved {len(saved_annotations_ids)} annotations individually")

    # Settle the replaced documents now that we know what was stored.
    saved_urls = {
        annotation.source_file_info.url_path
        for annotation in annotations
        if annotation.annotation_id in set(saved_annotations_ids)
    }
    replaced = [old for old in old_annotations if old.source_file_info.url_path in saved_urls]
    restore = [old for old in old_annotations if old.source_file_info.url_path not in saved_urls]
    for old in restore:
        try:
            old.save(force_insert=True)  # loaded documents carry an _id, which insert() refuses
            logger.warning(f"Restored annotation {old.annotation_id}: its replacement could not be saved")
        except Exception as restore_error:
            logger.warning(f"Could not restore annotation {old.annotation_id}: {restore_error}")
    if replaced:
        stale_paths = []
        for old in replaced:
            bgzipped_path = file_helper.get_annotation_file_path(old)
            if bgzipped_path in new_paths:
                continue  # the replacement publishes to the very same path
            stale_paths += [bgzipped_path, f"{bgzipped_path}.csi", f"{bgzipped_path}{seq_files.CONTIGS_SUFFIX}"]
        file_helper.remove_files(stale_paths, annotations_path)
    return saved_annotations_ids

def filter_annotations_dict_by_field(annotations: list[AnnotationToProcess], field: str, list_of_values) -> list[AnnotationToProcess]:
    """
    Filter the annotations by a field and a collection of values, return the filtered annotations
    """
    allowed = set(list_of_values)
    return [annotation for annotation in annotations if getattr(annotation, field) in allowed]

def filter_annotations_by_md5_checksum_and_url_path(annotations: list[AnnotationToProcess], chunk_size: int = 2000) -> list[AnnotationToProcess]:
    """
    Filter out the annotations that already exist in the database: only an exact match of the
    (source url, source md5) pair of the same stored document is skipped. The url list is queried
    in chunks so it stays far below MongoDB's 16 MB command limit.
    """
    stored_pairs = set()
    for chunk in create_batches(annotations, chunk_size):
        urls = [annotation.access_url for annotation in chunk]
        stored_pairs.update(
            GenomeAnnotation.objects(source_file_info__url_path__in=urls)
            .no_cache()
            .scalar('source_file_info__url_path', 'source_file_info__uncompressed_md5')
        )
    return [a for a in annotations if (a.access_url, a.md5_checksum) not in stored_pairs]

def skip_known_conflicts(annotations: list[AnnotationToProcess], retry_days: int | None = None) -> list[AnnotationToProcess]:
    """
    Drop rows whose exact (url, source md5) hit a data conflict recently. Retrying immediately
    would download the file again only to be refused again; they are retried once the recorded
    error is older than `retry_days` (default 30). Never raises: on any problem nothing is skipped.
    """
    retry_days = CONFLICT_RETRY_DAYS if retry_days is None else retry_days
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=retry_days)
    try:
        recent = set()
        for chunk in create_batches(annotations, 2000):
            recent.update(
                AnnotationError.objects(
                    url_path__in=[a.access_url for a in chunk],
                    error_kind=ERROR_KIND_CONFLICT,
                    recorded_at__gte=cutoff,
                ).no_cache().scalar('url_path', 'source_md5')
            )
        skipped = [a for a in annotations if (a.access_url, a.md5_checksum) in recent]
        if skipped:
            logger.info(f"Skipping {len(skipped)} rows with a recent data conflict (retried after {retry_days} days)")
        return [a for a in annotations if (a.access_url, a.md5_checksum) not in recent]
    except Exception as e:
        logger.warning(f"Could not check recorded conflicts, processing every row: {e}")
        return annotations


def reconcile_moved_sources(annotations: list[AnnotationToProcess], chunk_size: int = 2000, listed_urls=None) -> tuple[list[AnnotationToProcess], list[AnnotationToProcess]]:
    """
    A row whose source md5 (md5 of the published, uncompressed file) is already stored under a
    different url is the same file at a new location: reconcile the stored record directly instead
    of downloading and sorting it just to discover the same thing from the content md5.

    If the stored url is still listed by the tracker (`listed_urls`), the row is a second listing of
    the same file, not a move: moving the record would make the two rows flip it back and forth on
    every run, so it is left alone and the row is not processed.

    Rows whose stored record belongs to another assembly, or whose new url is owned by another
    annotation, are refused and recorded as a conflict. Either way the row is not processed.
    Returns (rows still to process, rows handled here). Never raises.
    """
    remaining, handled = [], []
    by_md5 = {}
    try:
        for chunk in create_batches(annotations, chunk_size):
            for stored in GenomeAnnotation.objects(
                source_file_info__uncompressed_md5__in=[a.md5_checksum for a in chunk]
            ).no_cache():
                by_md5[stored.source_file_info.uncompressed_md5] = stored
    except Exception as e:
        logger.warning(f"Could not look up moved sources, processing every row: {e}")
        return list(annotations), []

    for annotation in annotations:
        stored = by_md5.get(annotation.md5_checksum)
        if stored is None or stored.source_file_info.url_path == annotation.access_url:
            remaining.append(annotation)
            continue
        try:
            if listed_urls is not None and stored.source_file_info.url_path in listed_urls:
                logger.info(
                    f"{annotation.access_url} lists the same file as {stored.source_file_info.url_path}, "
                    f"which is still listed: keeping annotation {stored.annotation_id} as it is"
                )
            elif stored.assembly_accession != annotation.assembly_accession:
                handle_annotation_error(
                    annotation,
                    f"Source file identical to annotation {stored.annotation_id}, which belongs to a different "
                    f"assembly ({stored.assembly_accession})",
                    kind=ERROR_KIND_CONFLICT,
                )
            else:
                update_annotation_source_metadata(stored, annotation)
            handled.append(annotation)
        except Exception as e:
            logger.warning(f"Could not reconcile moved source {annotation.access_url}: {e}")
            remaining.append(annotation)
    if handled:
        logger.info(f"Reconciled {len(handled)} moved sources without downloading them")
    return remaining, handled


def compute_source_md5(gz_path: str) -> str | None:
    """md5 of the uncompressed content of the downloaded file (what the tracker publishes). Never raises."""
    try:
        cmd = f"set -o pipefail; {_gff_decompress_cmd(gz_path)} | md5sum | awk '{{print $1}}'"
        proc = subprocess.run(["bash", "-lc", cmd], capture_output=True, timeout=PROCESS_TIMEOUT or None)
        value = proc.stdout.decode().strip()
        return value if proc.returncode == 0 and len(value) == 32 else None
    except Exception as e:
        logger.warning(f"Could not compute the source md5 of {gz_path}: {e}")
        return None


def dedupe_annotations(annotations: list[AnnotationToProcess]) -> tuple[list[AnnotationToProcess], list[AnnotationToProcess]]:
    """
    Drop repeats within one run: rows sharing an access_url or a source md5 with an earlier row
    (first one wins). The same file listed twice (e.g. in two TSVs) would otherwise be downloaded
    and saved twice, and the second save would delete the files the first one just published.
    Returns (kept, dropped).
    """
    seen_urls, seen_md5s = set(), set()
    kept, dropped = [], []
    for annotation in annotations:
        if annotation.access_url in seen_urls or annotation.md5_checksum in seen_md5s:
            dropped.append(annotation)
            continue
        seen_urls.add(annotation.access_url)
        seen_md5s.add(annotation.md5_checksum)
        kept.append(annotation)
    return kept, dropped

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

def validate_path_fields(annotation_to_process: AnnotationToProcess) -> None:
    """
    The tracker TSV supplies taxon id, assembly accession, source database and source md5, all of
    which end up in file-system paths (output files, the work directory that is later rmtree'd).
    Reject anything that could escape its directory. Raises ValueError.
    """
    for name in ("taxon_id", "assembly_accession", "source_database", "md5_checksum"):
        value = getattr(annotation_to_process, name, None)
        if value is None or (isinstance(value, str) and not value.strip()):
            if name == "source_database":
                continue  # historically accepted (it only prefixes the file name); not a path-safety issue
            raise ValueError(f"Missing {name} in the annotation record")
        if not isinstance(value, str):
            raise ValueError(f"Unsafe {name} for use in a file path: {value!r}")
        if "/" in value or "\\" in value or "\x00" in value or value.strip() in (".", ".."):
            raise ValueError(f"Unsafe {name} for use in a file path: {value!r}")


def init_annotation_file_paths(annotations_dir: str, annotation_to_process: AnnotationToProcess) -> tuple[str, str]:
    """
    Initialize the file paths for the annotation
    returns:
        full_path: the path to the bgzipped file mapped to the container dir
        relative_path: the relative path to the annotation file, mapped to serve via nginx under /files endpoint
    Raises ValueError if a path component coming from the tracker is missing or unsafe.
    """
    validate_path_fields(annotation_to_process)
    sub_path = f"{annotation_to_process.taxon_id}/{annotation_to_process.assembly_accession}"
    output_dir = file_helper.create_dir_path(annotations_dir, sub_path)
    file_to_store = f"{annotation_to_process.source_database}_{annotation_to_process.md5_checksum}.gff.gz"
    full_path = f"{output_dir}/{file_to_store}"
    relative_path = f"/{sub_path}/{file_to_store}"
    return full_path, relative_path

PART_SUFFIX = ".part"


def build_stream_cmd(gzipped_gff_path: str, md5_path: str, output_path: str, compressor: str = "bgzip") -> str:
    """
    Shell pipeline: sorted GFF stream | tee (md5 of the sorted stream) | compressor > output.

    `pipefail` is essential: without it the exit status is the compressor's, so a
    failing zcat (truncated/corrupt .gz) or sort (disk full) would silently yield a
    truncated annotation with a valid-looking md5.
    """
    return (
        "set -o pipefail; "
        f"{_sorted_gff_stream_cmd(gzipped_gff_path, sort_tmp_dir=os.path.dirname(gzipped_gff_path) or None)} "
        f"| tee >(md5sum | awk '{{print $1}}' > {shlex.quote(md5_path)}) "
        f"| {compressor} > {shlex.quote(output_path)}"
    )


def _kill_process_group(proc) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _run_shell(cmd: str, timeout: int | None = None) -> tuple[int, bytes]:
    """
    Run `cmd` with bash in its own process group; kill the whole group on timeout.
    Returns (returncode, stderr). Only the tail of stderr is kept.
    """
    timeout = PROCESS_TIMEOUT if timeout is None else timeout
    proc = subprocess.Popen(
        ["bash", "-lc", cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True
    )
    try:
        _, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _kill_process_group(proc)
        try:
            proc.communicate(timeout=30)
        except Exception:
            pass
        raise Exception(f"Command timed out after {timeout}s")
    return proc.returncode, (err or b"")[-4000:]


def _read_md5_file(path: str, wait: float | None = None) -> str | None:
    """Read the md5 written by `tee >(md5sum ...)`, waiting for the (unawaited) subprocess to flush it."""
    wait = MD5_WAIT_SECONDS if wait is None else wait
    deadline = time.monotonic() + wait
    while True:
        if os.path.exists(path):
            with open(path, 'r') as f:
                value = f.read().strip()
            if value:
                return value
        if time.monotonic() >= deadline:
            return None
        time.sleep(0.05)


def _remove_quietly(path: str) -> None:
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError as e:
        logger.warning(f"Could not remove {path}: {e}")


def process_annotation_file(annotation_to_process: AnnotationToProcess, tmp_subdir_path: str, bgzipped_path: str, existing_md5_checksum: list[str]) -> tuple[str, int]:
    """
    Process the annotation file and return the md5 checksum and the bgzipped path.
    Steps: download → sort → compute md5 → bgzip → tabix → publish.

    Output is written to ``<bgzipped_path>.part`` (+ ``.csi``) next to the final path and only
    moved (atomic rename) onto the final path once everything succeeded and the content is
    known not to be a duplicate. Consequently:
      * duplicate content never leaves files behind (no orphans at a new path) and never
        rewrites a file that a live document may be serving;
      * a failed run never truncates an existing final file.
    returns:
        uncompressed_md5_checksum: the md5 checksum of the uncompressed file
        file_size: the size of the bgzipped file
    """
    gzipped_downloaded_gff_path = f"{tmp_subdir_path}/{annotation_to_process.md5_checksum}.gff.gz"
    download_gff_file(annotation_to_process, gzipped_downloaded_gff_path)
    if file_helper.file_is_empty_or_does_not_exist(gzipped_downloaded_gff_path):
        raise Exception("Downloaded annotation is empty, skipping...")

    md5_path = f"{tmp_subdir_path}/md5.txt"
    part_path = f"{bgzipped_path}{PART_SUFFIX}"
    part_csi_path = f"{part_path}.csi"
    final_csi_path = f"{bgzipped_path}.csi"

    try:
        stream_cmd = build_stream_cmd(gzipped_downloaded_gff_path, md5_path, part_path)
        returncode, stream_err = _run_shell(stream_cmd)
        if returncode != 0:
            raise Exception(stream_err.decode('utf-8', errors='replace') if stream_err else 'Streaming pipeline failed')

        returncode, tabix_err = _run_shell(f"tabix -p gff --csi {shlex.quote(part_path)}")
        if returncode != 0:
            raise Exception(tabix_err.decode('utf-8', errors='replace') if tabix_err else 'Tabix failed')

        # Read uncompressed MD5 computed from the sorted stream
        uncompressed_md5_checksum = _read_md5_file(md5_path)
        if not uncompressed_md5_checksum:
            raise Exception("MD5 was not produced by the streaming pipeline")

        if uncompressed_md5_checksum in existing_md5_checksum:
            raise DuplicateAnnotationContentError(uncompressed_md5_checksum)

        if not os.path.exists(part_path) or os.path.getsize(part_path) == 0:
            raise Exception("Bgzipped sorted annotation is empty, skipping...")
        if not os.path.exists(part_csi_path) or os.path.getsize(part_csi_path) == 0:
            raise Exception("Tabixing the bgzipped annotation failed, skipping...")

        file_size = os.path.getsize(part_path)
        os.replace(part_path, bgzipped_path)
        os.replace(part_csi_path, final_csi_path)
    finally:
        # No-ops after a successful publish; cleans partial output on every failure/duplicate.
        _remove_quietly(part_path)
        _remove_quietly(part_csi_path)

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
    Raise on date mismatch when they differ, and on an incomplete download
    (fewer bytes than the advertised Content-Length).
    """
    url = annotation_to_process.access_url
    with requests.get(url, stream=True, timeout=REQUEST_TIMEOUT) as r:
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
        written = 0
        started = time.monotonic()
        with open(downloaded_gff, 'wb') as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                written += len(chunk)
                if time.monotonic() - started > DOWNLOAD_TIMEOUT:
                    raise Exception(f"Download exceeded {DOWNLOAD_TIMEOUT}s, url={url}")

        # With Content-Encoding the decoded byte count legitimately differs from Content-Length.
        expected = r.headers.get("Content-Length")
        if expected and not r.headers.get("Content-Encoding") and str(expected).isdigit():
            if written != int(expected):
                raise Exception(
                    f"Incomplete download: got {written} bytes, expected {expected}, url={url}"
                )

def get_last_modified_date(headers: dict) -> str | None:
    """
    Date (UTC, ISO) of the Last-Modified header of the annotation file, None when missing/invalid.
    Accepts any RFC 7231 date, including numeric offsets (converted to UTC).
    """
    try:
        dt = parsedate_to_datetime(headers.get("Last-Modified"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc)
        return dt.date().isoformat()
    except Exception:
        return None


def _gff_decompress_cmd(gff_file: str) -> str:
    """
    Shell fragment to stream a GFF path (plain or .gz).

    gzip exits 2 for *warnings* (e.g. "decompression OK, trailing garbage ignored"): the output is
    complete and valid, and such files were imported before `pipefail` was introduced, so 2 stays
    non-fatal. Exit 1 (truncated / not gzip / corrupt) is a real error.
    """
    path = shlex.quote(gff_file)
    return f"{{ zcat {path} || [ $? -eq 2 ]; }}" if gff_file.endswith(".gz") else f"cat {path}"


@functools.lru_cache(maxsize=1)
def _sort_supports_gnu_options() -> bool:
    """-S / --parallel / -T are GNU extensions; only use them where `sort` is GNU (it is in the image)."""
    try:
        result = subprocess.run(["sort", "--version"], capture_output=True, text=True, timeout=10)
        return result.returncode == 0 and "GNU" in result.stdout
    except Exception:
        return False


def _sorted_gff_stream_cmd(gff_file: str, sort_tmp_dir: str | None = None) -> str:
    """
    Shell pipeline: comment/header lines first, then data sorted by seqid and start.
    Matches the import pipeline (sort | bgzip | tabix).

    grep exits 1 when nothing matches (e.g. a GFF without '#' lines); that is not an
    error, but any other non-zero status (and a failing zcat/sort) must still fail the
    pipeline when the caller sets `pipefail`.
    """
    cat = _gff_decompress_cmd(gff_file)
    no_match_ok = "|| [ $? -eq 1 ]"
    # Bounded memory: the buffer cap and (optionally) the spill directory never change the output.
    sort_opts = ""
    if _sort_supports_gnu_options():
        sort_opts = f"-S {SORT_BUFFER_SIZE} --parallel={SORT_THREADS} "
        if sort_tmp_dir:
            sort_opts += f"-T {shlex.quote(sort_tmp_dir)} "
    # LC_ALL=C is part of the identity: annotation_id is the md5 of this sorted stream, and the
    # sort order (and grep's text/binary decision) depend on the locale. Production ids were
    # produced under the container's default C locale, so pin it explicitly.
    return (
        f"export LC_ALL=C; ({cat} | {{ grep '^#' {no_match_ok}; }}; "
        f"{cat} | {{ grep -v '^#' {no_match_ok}; }} | sort {sort_opts}-t\"$(printf '\\t')\" -k1,1 -k4,4n)"
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
    logger.info(f"Deleting {count} annotations")
    # Only the fields needed for the file paths, streamed (mongoengine would otherwise keep every
    # full document, statistics included, in memory).
    remove_files_from_annotations(
        annotations_to_delete.only('annotation_id', 'indexed_file_info').no_cache(), annotations_path
    )
    annotations_to_delete.delete()
    logger.info(f"Deleted {count} annotations")


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
    ).no_cache():
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
            logger.info(f"Checked {stats['scanned']} annotation source URLs...")

        not_found = source_url_is_not_found(url)
        if not_found is True:
            stats["missing"] += 1
            to_delete_ids.append(ann.annotation_id)
        elif not_found is None:
            stats["skipped_inconclusive"] += 1

    if dry_run:
        stats["would_delete"] = len(to_delete_ids)
        logger.info(f"Source URL prune dry run: {stats}")
        return stats

    for batch in create_batches(to_delete_ids, batch_size):
        delete_annotations(
            query=dict(annotation_id__in=batch),
            annotations_path=annotations_path,
        )

    stats["deleted"] = len(to_delete_ids)
    logger.info(f"Source URL prune finished: {stats}")
    return stats


def _relocate_assembly_files(assembly_accession: str, taxid: str) -> None:
    """Annotation files follow their assembly's taxid (see services/file_layout.py)."""
    from . import file_layout
    try:
        stats = file_layout.relocate_assembly(assembly_accession, taxid)
        if stats["moved"] or stats["repointed"] or stats["conflicts"] or stats["errors"]:
            logger.info(f"Relocated files of {assembly_accession} to taxid {taxid}: {stats}")
    except Exception as e:  # never fail the taxonomy update; the backfill job repairs it
        logger.warning(f"Could not relocate files of {assembly_accession}: {e}")


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
        _relocate_assembly_files(acc, assembly.taxid)

    if assemblies_not_found:
        annotations_path = os.getenv("LOCAL_ANNOTATIONS_DIR")
        delete_annotations(
            query=dict(assembly_accession__in=list(assemblies_not_found)),
            annotations_path=annotations_path,
        )


def clean_up_annotations_with_errors(batch_size: int = 1000) -> int:
    """
    Remove the AnnotationError rows that are stale: the same source url is now stored with the
    same source md5 (it succeeded since). An error recorded for a *newer* version of a stored url
    (different md5) is kept, because that update did fail. Batched and streamed. Returns the
    number of deleted errors.
    """
    deleted = 0

    def flush(errors: list) -> int:
        stored = dict(
            GenomeAnnotation.objects(source_file_info__url_path__in=[url for url, _ in errors])
            .no_cache()
            .scalar('source_file_info__url_path', 'source_file_info__uncompressed_md5')
        )
        stale = [url for url, md5 in errors if url in stored and stored[url] == md5]
        if not stale:
            return 0
        return AnnotationError.objects(url_path__in=stale).delete()

    batch: list = []
    # md5_mismatch rows describe a stored annotation on purpose: they are resolved when the tracker
    # catches up (the pair changes and save_annotations clears them), not by this cleanup.
    for error in AnnotationError.objects(error_kind__ne=ERROR_KIND_MD5_MISMATCH).no_cache().scalar('url_path', 'source_md5'):
        batch.append(error)
        if len(batch) >= batch_size:
            deleted += flush(batch)
            batch = []
    if batch:
        deleted += flush(batch)
    return deleted
