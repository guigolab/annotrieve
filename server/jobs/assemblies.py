import os
import re
from celery import shared_task

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files

from .services import assembly as assembly_service


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
    print(f"Starting assembly sync for {len(accessions)} new assemblies...")
    stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=accessions,
        chunk_size=chunk_size,
    )
    print(f"New assembly sync finished: {stats}")
    return stats


def _accessions_missing_raw_report(statuses: tuple[str, ...] | None) -> list[str]:
    """Accessions without a stored report (file is the truth); optionally only given statuses."""
    qs = GenomeAssembly.objects()
    if statuses:
        qs = qs.filter(assembly_report__raw_report_status__in=list(statuses))
    return [
        a.assembly_accession
        for a in qs.only("assembly_accession", "taxid").no_cache()
        if not seq_files.assembly_report_file_exists(a.taxid, a.assembly_accession)
    ]


@shared_task(name="backfill_assembly_reports", ignore_result=False)
def backfill_assembly_reports(chunk_size: int = 500):
    """
    One-off: store the raw NCBI assembly_report.txt for every assembly lacking one.
    Resumable (existing files are skipped); also resolves FTP paths when missing.
    """
    accessions = _accessions_missing_raw_report(None)
    print(f"Backfilling assembly reports for {len(accessions)} assemblies...")
    if not accessions:
        return {"targets": 0}
    stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=accessions, chunk_size=chunk_size
    )
    print(f"Assembly report backfill finished: {stats}")
    return stats


@shared_task(name="retry_missing_assembly_reports", ignore_result=False)
def retry_missing_assembly_reports(chunk_size: int = 500):
    """Monthly: retry assemblies whose report is `missing` or `failed`."""
    accessions = _accessions_missing_raw_report(
        (assembly_service.RAW_STATUS_MISSING, assembly_service.RAW_STATUS_FAILED)
    )
    print(f"Retrying assembly reports for {len(accessions)} assemblies...")
    if not accessions:
        return {"targets": 0}
    stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=accessions, chunk_size=chunk_size
    )
    print(f"Assembly report retry finished: {stats}")
    return stats


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
    print(f"Orphan assembly file sweep: {stats}")
    return stats
