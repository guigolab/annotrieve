"""
Backup/repair job for the "source URL changed but content unchanged" bug in
import_annotations.py (see process_annotations_pipeline / DuplicateAnnotationContentError):

Before that bug was fixed, when a source (e.g. Ensembl) moved a file to a new URL
while its content stayed the same, the pipeline would delete the on-disk
bgzipped/csi files backing the *existing* GenomeAnnotation document without ever
touching that document's row. This job finds any GenomeAnnotation whose files are
missing on disk and attempts to safely recreate them.

This job is intentionally conservative:
  - It never touches files for annotations that already look fine on disk.
  - It never overwrites/writes to the final on-disk path until the freshly
    recreated content's md5 has been verified to exactly match the annotation's
    existing `annotation_id`.
  - If a source URL truly cannot be recovered (dead, and no matching entry found in
    the current tracker TSVs), the annotation is reported as unrecoverable and left
    completely untouched.
  - Run with dry_run=True first (the default) to review what would be repaired
    before actually downloading/writing anything.
"""
import gzip
import os
import shlex
import shutil
import subprocess

import requests
from celery import shared_task

from db.models import GenomeAnnotation
from helpers import file as file_helper
from helpers import assembly_sequence_files as seq_files
from .services import annotation as annotation_service

TMP_DIR = "/tmp"
ANNOTATIONS_PATH = os.getenv("LOCAL_ANNOTATIONS_DIR")

# Intentionally a separate copy of the tracker TSV urls (rather than importing from
# import_annotations.py) to avoid any import coupling between the two jobs.
GH_PATH = "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/"
URLS_TO_FETCH = [
    GH_PATH + "community_annotations.tsv",
    GH_PATH + "ensembl_annotations.tsv",
    GH_PATH + "genbank_annotations.tsv",
    GH_PATH + "refseq_annotations.tsv",
]

DOWNLOAD_TIMEOUT = 60


class ContentMismatchError(Exception):
    """
    Raised when a recreated annotation file's recomputed content md5 does not match
    the expected annotation_id. This means the source at the given URL no longer
    serves the exact same content that produced this annotation_id; the repair job
    must never overwrite anything in that case.
    """
    pass


def _annotation_repair_key(annotation: GenomeAnnotation) -> tuple:
    """
    Identifying key used to find a replacement source for an annotation's content:
    (source_database, taxon_id, assembly_accession, original TSV-reported md5).
    """
    source_file_info = annotation.source_file_info
    return (
        source_file_info.database if source_file_info else None,
        str(annotation.taxid) if annotation.taxid is not None else None,
        annotation.assembly_accession,
        source_file_info.uncompressed_md5 if source_file_info else None,
    )


def _tracker_entry_key(annotation_to_process) -> tuple:
    return (
        annotation_to_process.source_database,
        str(annotation_to_process.taxon_id) if annotation_to_process.taxon_id is not None else None,
        annotation_to_process.assembly_accession,
        annotation_to_process.md5_checksum,
    )


def _build_tracker_lookup_by_content() -> dict:
    """
    Fetch the current tracker TSVs and index rows by
    (source_database, taxon_id, assembly_accession, md5_checksum) so we can find a
    replacement URL for content whose original URL has moved.
    """
    lookup: dict = {}
    for url in URLS_TO_FETCH:
        for annotation_to_process in annotation_service.fetch_from_url(url):
            key = _tracker_entry_key(annotation_to_process)
            # Keep the first occurrence; this is a best-effort lookup, not a strict
            # source of truth, so silently ignoring rare key collisions is fine.
            lookup.setdefault(key, annotation_to_process)
    return lookup


def find_annotations_with_missing_files() -> tuple:
    """
    Scan every GenomeAnnotation and return (missing, scanned_count, path_errors):
      - missing: documents whose expected bgzipped or csi file is missing/empty on disk.
      - scanned_count: total number of documents examined.
      - path_errors: list of {"annotation_id", "error"} for documents whose expected
        path could not even be resolved (e.g. malformed indexed_file_info).
    """
    missing = []
    path_errors = []
    scanned_count = 0
    for annotation in GenomeAnnotation.objects(indexed_file_info__exists=True):
        scanned_count += 1
        try:
            full_bgzipped_path = file_helper.get_annotation_file_path(annotation)
        except ValueError as e:
            path_errors.append({"annotation_id": annotation.annotation_id, "error": str(e)})
            continue
        full_csi_path = f"{full_bgzipped_path}.csi"
        if file_helper.file_is_empty_or_does_not_exist(
            full_bgzipped_path
        ) or file_helper.file_is_empty_or_does_not_exist(full_csi_path):
            missing.append(annotation)
    return missing, scanned_count, path_errors


def recreate_annotation_file(annotation: GenomeAnnotation, tmp_dir: str, download_url: str) -> tuple:
    """
    Re-download `download_url`, sort | bgzip | tabix into a temp location, verify the
    recomputed content md5 exactly matches `annotation.annotation_id`, and only then
    move the result into the annotation's expected on-disk path.

    Raises ContentMismatchError (without touching any existing files) if the
    recreated content's md5 does not match. Raises a plain Exception for any other
    failure (download error, empty file, tabix failure, etc).

    Returns (uncompressed_md5, file_size) on success.
    """
    full_bgzipped_path = file_helper.get_annotation_file_path(annotation)
    full_csi_path = f"{full_bgzipped_path}.csi"

    tmp_subdir_path = file_helper.create_dir_path(tmp_dir, f"repair_{annotation.annotation_id}")
    try:
        # Must end in .gz so _gff_decompress_cmd selects zcat (not cat). All tracker
        # source URLs are gzip-compressed, matching the main import job's assumption.
        gzipped_downloaded_path = os.path.join(tmp_subdir_path, "source_download.gz")
        with requests.get(download_url, stream=True, timeout=DOWNLOAD_TIMEOUT) as r:
            r.raise_for_status()
            with open(gzipped_downloaded_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

        if file_helper.file_is_empty_or_does_not_exist(gzipped_downloaded_path):
            raise Exception(f"Downloaded content from {download_url} is empty")

        # Reject truncated/non-gzip payloads before the shell pipeline; otherwise a
        # silent empty stream can look like a ContentMismatchError.
        try:
            with gzip.open(gzipped_downloaded_path, "rb") as gz_f:
                if not gz_f.read(1):
                    raise Exception(f"Downloaded gzip from {download_url} decompresses to empty content")
        except OSError as e:
            raise Exception(f"Downloaded content from {download_url} is not valid gzip: {e}") from e

        tmp_bgzipped_path = os.path.join(tmp_subdir_path, "output.gff.gz")
        md5_path = os.path.join(tmp_subdir_path, "md5.txt")

        # Reuse the exact same sort/tee/bgzip shell pipeline as the main import job
        # (jobs/services/annotation.py::process_annotation_file) so the recreated
        # content is produced identically. pipefail so a failed zcat/grep/sort stage
        # cannot be masked by bgzip succeeding on empty stdin.
        stream_cmd = (
            "set -o pipefail; "
            f"{annotation_service._sorted_gff_stream_cmd(gzipped_downloaded_path)} "
            f"| tee >(md5sum | awk '{{print $1}}' > {shlex.quote(md5_path)}) "
            f"| bgzip > {shlex.quote(tmp_bgzipped_path)}"
        )
        stream_proc = subprocess.Popen(
            ["bash", "-lc", stream_cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        _, stream_err = stream_proc.communicate()
        if stream_proc.returncode != 0:
            raise Exception(stream_err.decode("utf-8") if stream_err else "Streaming pipeline failed")

        if not os.path.exists(md5_path):
            raise Exception("MD5 file not created by streaming pipeline")
        with open(md5_path, "r") as f:
            recomputed_md5 = f.read().strip()
        if not recomputed_md5:
            raise Exception("Empty MD5 computed from streaming pipeline")

        if recomputed_md5 != annotation.annotation_id:
            raise ContentMismatchError(
                f"Recreated content md5 {recomputed_md5} does not match expected "
                f"annotation_id {annotation.annotation_id} for {download_url}; refusing to overwrite"
            )

        file_size = os.path.getsize(tmp_bgzipped_path)
        if file_size == 0:
            raise Exception("Recreated bgzipped annotation is empty")

        tmp_csi_path = f"{tmp_bgzipped_path}.csi"
        tabix_cmd = f"tabix -p gff --csi {shlex.quote(tmp_bgzipped_path)}"
        tabix_proc = subprocess.Popen(
            ["bash", "-lc", tabix_cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        _, tabix_err = tabix_proc.communicate()
        if tabix_proc.returncode != 0:
            raise Exception(tabix_err.decode("utf-8") if tabix_err else "Tabix failed")
        if not os.path.exists(tmp_csi_path) or os.path.getsize(tmp_csi_path) == 0:
            raise Exception("Tabixing the recreated annotation failed")

        # Only now, after full verification, touch the final on-disk path.
        output_dir = os.path.dirname(full_bgzipped_path)
        os.makedirs(output_dir, exist_ok=True)
        shutil.move(tmp_bgzipped_path, full_bgzipped_path)
        shutil.move(tmp_csi_path, full_csi_path)

        seq_files.write_contigs_from_tabix(full_bgzipped_path)

        return recomputed_md5, file_size
    finally:
        shutil.rmtree(tmp_subdir_path, ignore_errors=True)


@shared_task(name="repair_missing_annotation_files", ignore_result=False)
def repair_missing_annotation_files(dry_run: bool = True) -> dict:
    """
    Find GenomeAnnotation documents whose bgzipped/csi files are missing on disk and
    attempt to recreate them.

    Recovery order per annotation:
      1. Try the recorded source_file_info.url_path.
      2. If that's confirmed dead (404/410) or the download/verification fails, look
         up a replacement URL for the exact same content (matched by
         source_database + taxon_id + assembly_accession + the original TSV-reported
         md5) in the current tracker TSVs, and try that instead. If a replacement
         URL is used, the annotation's source_file_info is updated to match (reusing
         the same reconciliation helper as the main import job).
      3. If neither yields a working, content-matching source, the annotation is
         reported as unrecoverable and left completely untouched.

    In all cases, the recreated content's md5 MUST exactly match the annotation's
    existing annotation_id before anything is written to the final path; a mismatch
    is reported under content_mismatch for manual review and nothing is overwritten.

    dry_run=True (default) only reports what would be repaired, without downloading
    or writing anything.
    """
    stats: dict = {
        "dry_run": dry_run,
        "scanned": 0,
        "missing_files": 0,
        "recreated_from_original_url": 0,
        "recreated_from_new_url": 0,
        "content_mismatch": [],
        "unrecoverable": [],
        "errors": [],
    }

    missing, scanned_count, path_errors = find_annotations_with_missing_files()
    stats["scanned"] = scanned_count
    stats["errors"].extend(path_errors)
    stats["missing_files"] = len(missing)
    print(f"repair_missing_annotation_files: scanned {stats['scanned']} annotations, {len(missing)} missing files")

    if dry_run:
        stats["would_repair"] = [a.annotation_id for a in missing]
        print(f"repair_missing_annotation_files dry run: {stats}")
        return stats

    if not missing:
        return stats

    tracked_by_key = _build_tracker_lookup_by_content()

    for annotation in missing:
        original_url = annotation.source_file_info.url_path if annotation.source_file_info else None
        recreated = False

        if original_url:
            not_found = annotation_service.source_url_is_not_found(original_url)
            if not_found is not True:  # False (reachable) or None (inconclusive): worth trying
                try:
                    recreate_annotation_file(annotation, TMP_DIR, original_url)
                    stats["recreated_from_original_url"] += 1
                    recreated = True
                except ContentMismatchError as e:
                    # The original URL is alive but no longer serves the same
                    # content: do NOT fall back to a tracker-matched URL, this needs
                    # manual review.
                    stats["content_mismatch"].append(
                        {"annotation_id": annotation.annotation_id, "error": str(e)}
                    )
                    continue
                except Exception as e:
                    print(
                        f"repair_missing_annotation_files: failed to recreate "
                        f"{annotation.annotation_id} from original url {original_url}: {e}"
                    )

        if recreated:
            continue

        match = tracked_by_key.get(_annotation_repair_key(annotation))
        if not match:
            stats["unrecoverable"].append(
                {"annotation_id": annotation.annotation_id, "original_url": original_url}
            )
            continue

        try:
            recreate_annotation_file(annotation, TMP_DIR, match.access_url)
            stats["recreated_from_new_url"] += 1
            annotation_service.update_annotation_source_metadata(annotation, match)
        except ContentMismatchError as e:
            stats["content_mismatch"].append({"annotation_id": annotation.annotation_id, "error": str(e)})
        except Exception as e:
            stats["errors"].append({"annotation_id": annotation.annotation_id, "error": str(e)})

    print(f"repair_missing_annotation_files finished: {stats}")
    return stats
