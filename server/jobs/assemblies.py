import fcntl
import logging
import os
import re
import time
from collections import Counter
from contextlib import contextmanager
from celery import shared_task

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from helpers.constants import PLACEHOLDER_DOWNLOAD_URL_PREFIX
from mongoengine import Q

from .services import assembly as assembly_service

logger = logging.getLogger(__name__)
LOG_JOB = "[assembly-job]"  # job lifecycle: what was selected, lock, start/finish


LOCK_PATH = os.path.join(
    os.getenv("IMPORT_TMP_DIR", "/tmp"), "annotrieve_assembly_reports.lock"
)


@contextmanager
def _exclusive_run():
    """Host-local non-blocking lock so two bulk report jobs never run together (OS releases it on death)."""
    os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    handle = open(LOCK_PATH, "w")
    try:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
    finally:
        handle.close()


def _run_locked_sync(label: str, accessions: list[str], chunk_size: int) -> dict:
    with _exclusive_run() as acquired:
        if not acquired:
            logger.warning(
                f"{LOG_JOB} {label}: SKIPPED, another assembly report job holds the lock ({LOCK_PATH}); "
                f"nothing was changed"
            )
            return {"skipped": "locked"}
        logger.info(f"{LOG_JOB} {label}: START for {len(accessions)} assemblies (lock acquired)")
        started = time.monotonic()
        try:
            stats = assembly_service.sync_assemblies_ftp_and_sequences(
                accessions=accessions, chunk_size=chunk_size
            )
        except Exception:
            logger.exception(f"{LOG_JOB} {label}: FAILED after {assembly_service._fmt_duration(time.monotonic() - started)}")
            raise
        logger.info(f"{LOG_JOB} {label}: FINISHED in {assembly_service._fmt_duration(time.monotonic() - started)}")
        return stats


@shared_task(name="sync_new_assemblies_from_summary", ignore_result=False)
def sync_new_assemblies_from_summary(
    accessions: list[str],
    chunk_size: int = 500,
):
    """
    Sync FTP paths and sequences for newly inserted assemblies only.
    """
    if not accessions:
        return {"targets": 0}
    logger.info(f"{LOG_JOB} sync_new_assemblies_from_summary: START for {len(accessions)} assemblies just added by the import")
    stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=accessions,
        chunk_size=chunk_size,
    )
    logger.info(f"{LOG_JOB} sync_new_assemblies_from_summary: FINISHED")
    return stats


def _accessions_missing_raw_report(statuses: tuple[str, ...] | None) -> list[str]:
    """Accessions without a stored report (file is the truth); optionally only given statuses."""
    qs = GenomeAssembly.objects()
    if statuses:
        qs = qs.filter(assembly_report__raw_report_status__in=list(statuses))
    selected: list[str] = []
    by_status: Counter = Counter()
    scanned = 0
    for a in qs.only("assembly_accession", "taxid", "assembly_report").no_cache():
        scanned += 1
        if not seq_files.assembly_report_file_exists(a.taxid, a.assembly_accession):
            selected.append(a.assembly_accession)
            by_status[(a.assembly_report.raw_report_status if a.assembly_report else None) or "pending"] += 1
    logger.info(
        f"{LOG_JOB} selection: {scanned} assemblies checked"
        f"{' (raw_report_status in ' + '/'.join(statuses) + ')' if statuses else ''}, "
        f"{len(selected)} have no assembly_report.txt on disk"
        + (f" (by raw_report_status: {dict(by_status)})" if selected else "")
    )
    return selected


@shared_task(name="backfill_assembly_reports", ignore_result=False)
def backfill_assembly_reports(chunk_size: int = 500):
    """
    One-off: store the raw NCBI assembly_report.txt for every assembly lacking one.
    Resumable (existing files are skipped); also resolves FTP paths when missing.
    """
    accessions = _accessions_missing_raw_report(None)
    if not accessions:
        logger.info(f"{LOG_JOB} backfill_assembly_reports: nothing to do, every assembly has its report")
        return {"targets": 0}
    return _run_locked_sync("Assembly report backfill", accessions, chunk_size)


@shared_task(name="retry_missing_assembly_reports", ignore_result=False)
def retry_missing_assembly_reports(chunk_size: int = 500):
    """Monthly: retry assemblies whose report is `missing` or `failed`."""
    accessions = _accessions_missing_raw_report(
        (assembly_service.RAW_STATUS_MISSING, assembly_service.RAW_STATUS_FAILED)
    )
    if not accessions:
        logger.info(f"{LOG_JOB} retry_missing_assembly_reports: nothing to retry")
        return {"targets": 0}
    return _run_locked_sync("Assembly report retry", accessions, chunk_size)


_ASSEMBLY_DIR_RE = re.compile(r"^GC[AF]_\d+\.\d+$")


@shared_task(name="sweep_orphan_assembly_files", ignore_result=False)
def sweep_orphan_assembly_files(dry_run: bool = True):
    """
    One-off: remove assembly files (report, chromosomes.json, chr_aliases.tsv) of assemblies
    that no longer exist in the DB. Annotation files are never touched. Dry-run by default.
    """
    root = seq_files.ANNOTATIONS_PATH
    if not root:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")
    known = set(GenomeAssembly.objects().scalar("assembly_accession"))
    if not known:
        # an empty collection (wrong DB, outage) would make every directory look orphaned
        raise RuntimeError("No assemblies in the database; refusing to sweep")
    logger.info(f"{LOG_JOB} sweep_orphan_assembly_files: START ({'DRY RUN, nothing is deleted' if dry_run else 'DELETING files'}), {len(known)} assemblies in the DB")
    stats = {"scanned": 0, "orphans": 0, "files_removed": 0, "dry_run": dry_run, "orphan_dirs": []}
    for taxid in os.listdir(root):
        taxid_dir = os.path.join(root, taxid)
        if not os.path.isdir(taxid_dir):
            continue
        for name in os.listdir(taxid_dir):
            if not _ASSEMBLY_DIR_RE.match(name) or not os.path.isdir(os.path.join(taxid_dir, name)):
                continue
            stats["scanned"] += 1
            if name in known:
                continue
            stats["orphans"] += 1
            if len(stats["orphan_dirs"]) < 200:
                stats["orphan_dirs"].append(f"{taxid}/{name}")
            if not dry_run:
                stats["files_removed"] += len(seq_files.delete_assembly_files(taxid, name))
    logger.info(
        f"{LOG_JOB} sweep_orphan_assembly_files: scanned {stats['scanned']} assembly directories, "
        f"{stats['orphans']} belong to no assembly in the DB, "
        f"{'files removed=' + str(stats['files_removed']) if not dry_run else 'would be cleaned by a real run'}"
    )
    if stats["orphan_dirs"]:
        logger.info(f"{LOG_JOB} sweep_orphan_assembly_files: orphan directories: {assembly_service._listed(stats['orphan_dirs'])}")
    return stats


def placeholder_assembly_accessions() -> list[str]:
    """Assemblies still on the placeholder download_url or without an NCBI FTP directory."""
    q = Q(download_url__startswith=PLACEHOLDER_DOWNLOAD_URL_PREFIX) | Q(ncbi_ftp_directory_url=None)
    return list(GenomeAssembly.objects(q).scalar("assembly_accession"))


@shared_task(name="backfill_placeholder_assembly_paths", ignore_result=False)
def backfill_placeholder_assembly_paths(chunk_size: int = 500):
    """
    Hotfix backfill: for assemblies whose FTP path was never resolved (placeholder download_url),
    resolve the path (summaries, then FTP directory scrape), store assembly_report.txt and, for
    chromosome-level assemblies, chromosomes.json + chr_aliases.tsv.
    """
    accessions = placeholder_assembly_accessions()
    logger.info(
        f"{LOG_JOB} backfill_placeholder_assembly_paths: {len(accessions)} assemblies still have the placeholder "
        f"download_url or no FTP directory"
    )
    if not accessions:
        return {"targets": 0}
    return _run_locked_sync("Placeholder path backfill", accessions, chunk_size)
