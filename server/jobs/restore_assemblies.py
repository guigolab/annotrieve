"""
Bring back assemblies that annotations still belong to.

An annotation whose ``assembly_accession`` has no ``GenomeAssembly`` row cannot be shown with its
assembly (the assembly pages 404, no chromosome/alias files). It happens when an assembly row is
pruned while the import that saved it is still storing its annotations. This job finds those
accessions, fetches them from NCBI again and saves them; the usual sync job then resolves their FTP
paths and sequence files. Nothing is deleted: accessions NCBI no longer returns are only reported.

Dry-run by default. A real run takes the import lock so it never overlaps an import.
"""
import logging
import shutil
import tempfile

from celery import shared_task

from db.models import GenomeAnnotation, GenomeAssembly
from .import_annotations import _exclusive_run
from .services import assembly as assembly_service
from .services.utils import create_batches

logger = logging.getLogger(__name__)
LOG_JOB = "[restore-assemblies]"
SAMPLE_LIMIT = 50
LOOKUP_BATCH = 1000


def find_missing_assemblies() -> list[str]:
    """Accessions referenced by annotations that have no assembly row, sorted."""
    referenced = {acc for acc in GenomeAnnotation.objects.distinct("assembly_accession") if acc}
    known: set[str] = set()
    for batch in create_batches(sorted(referenced), LOOKUP_BATCH):
        known.update(GenomeAssembly.objects(assembly_accession__in=batch).scalar("assembly_accession"))
    return sorted(referenced - known)


def lineages_for(accessions: list[str]) -> dict[str, list[str]]:
    """{taxid: lineage} taken from the annotations of the accessions (first non-empty one wins)."""
    lineages: dict[str, list[str]] = {}
    for batch in create_batches(accessions, LOOKUP_BATCH):
        for annotation in (GenomeAnnotation.objects(assembly_accession__in=batch)
                           .only("taxid", "taxon_lineage").no_cache()):
            if annotation.taxid and annotation.taxon_lineage and annotation.taxid not in lineages:
                lineages[annotation.taxid] = list(annotation.taxon_lineage)
    return lineages


def restore_all(dry_run: bool = True, batch_size: int = 500) -> dict:
    missing = find_missing_assemblies()
    stats: dict = {"dry_run": dry_run, "missing": len(missing), "missing_sample": missing[:SAMPLE_LIMIT],
                   "restored": 0, "not_restored": 0, "not_restored_sample": []}
    logger.info(f"{LOG_JOB} {len(missing)} accessions have annotations but no assembly"
                f"{' (dry run, nothing is changed)' if dry_run else ''}")
    if dry_run or not missing:
        return stats
    tmp_dir = tempfile.mkdtemp(prefix="restore_assemblies_")
    try:
        saved = assembly_service.fetch_new_assemblies_and_bioprojects(
            missing, tmp_dir, lineages_for(missing), batch_size
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    saved_set = set(saved)
    not_restored = [acc for acc in missing if acc not in saved_set]
    stats.update(restored=len(saved_set), not_restored=len(not_restored),
                 not_restored_sample=not_restored[:SAMPLE_LIMIT])
    if saved_set:
        from .assemblies import sync_new_assemblies_from_summary
        sync_new_assemblies_from_summary.delay(accessions=sorted(saved_set))
    if not_restored:
        logger.warning(f"{LOG_JOB} {len(not_restored)} accessions were not returned by NCBI or could not be saved "
                       f"(their annotations are untouched): {not_restored[:10]}")
    return stats


@shared_task(name="restore_missing_assemblies", ignore_result=False)
def restore_missing_assemblies(dry_run: bool = True, batch_size: int = 500):
    """Re-create the assembly rows annotations still need. Dry-run by default; never deletes anything."""
    if dry_run:
        stats = restore_all(dry_run=True, batch_size=batch_size)
    else:
        with _exclusive_run() as acquired:
            if not acquired:
                stats = {"dry_run": False, "skipped": "the import job is running; try again later"}
                logger.warning(f"{LOG_JOB} {stats['skipped']}")
                return stats
            stats = restore_all(dry_run=False, batch_size=batch_size)
    logger.info(f"{LOG_JOB} finished: {stats}")
    return stats
