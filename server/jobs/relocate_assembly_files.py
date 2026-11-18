"""
One-off backfill: put every file of every assembly under ``{assembly.taxid}/{assembly_accession}/``.

Before ``services/file_layout.py`` existed, a change of an assembly's taxid left its annotation files
(``*.gff.gz``, ``.csi``, ``.contigs.txt``) in the old taxid folder while the assembly-level files
(``chromosomes.json``, ``chr_aliases.tsv``, ``assembly_report.txt``) were regenerated under the new
one, and the database kept pointing at the old path.

For each assembly in the database this job
  1. finds the folders that still hold its files (the folders the annotations point at, plus any
     ``{taxid}/{accession}`` directory found on disk);
  2. moves everything into the folder of the assembly's current taxid (never overwriting a file);
  3. repoints ``indexed_file_info`` of the affected annotations once the file exists there.

It is idempotent and resumable. ``dry_run=True`` (the default) only reports. Annotation documents
whose own ``taxid`` differs from their assembly's are counted and sampled but not changed here:
``update_records`` owns those taxonomy fields. Directories of assemblies that no longer exist are
left to ``sweep_orphan_assembly_files``.
"""
import logging
import os

from celery import shared_task

from db.models import GenomeAnnotation, GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from .import_annotations import _exclusive_run
from .services import file_layout

logger = logging.getLogger(__name__)

SAMPLE_LIMIT = file_layout.SAMPLE_LIMIT


def scan_assembly_dirs(root: str) -> dict[str, set[str]]:
    """{assembly_accession: {taxid folders holding a directory for it}} from one pass over the disk."""
    found: dict[str, set[str]] = {}
    with os.scandir(root) as taxid_dirs:
        for taxid_entry in taxid_dirs:
            if not taxid_entry.is_dir() or not taxid_entry.name.isdigit():
                continue
            with os.scandir(taxid_entry.path) as children:
                for child in children:
                    if child.is_dir() and file_layout.ASSEMBLY_DIR_RE.match(child.name):
                        found.setdefault(child.name, set()).add(taxid_entry.name)
    return found


def _annotation_folders(assembly_taxid: dict[str, str], stats: dict) -> dict[str, set[str]]:
    """
    {accession: {taxid folders its annotations point at, other than the assembly's taxid}}, plus
    a count of annotations whose own ``taxid`` differs from the assembly's.
    """
    folders: dict[str, set[str]] = {}
    mismatch_sample: list[str] = []
    for annotation in (GenomeAnnotation.objects
                       .only("annotation_id", "assembly_accession", "taxid", "indexed_file_info")
                       .no_cache()):
        acc = annotation.assembly_accession
        target = assembly_taxid.get(acc)
        if target is None:
            continue
        if str(annotation.taxid) != target:
            stats["annotation_taxid_mismatch"] += 1
            if len(mismatch_sample) < SAMPLE_LIMIT:
                mismatch_sample.append(f"{annotation.annotation_id}: {annotation.taxid} (assembly {acc}: {target})")
        info = annotation.indexed_file_info
        found = file_layout.folder_taxid(info.bgzipped_path, acc) if info and info.bgzipped_path else None
        if found and found != target:
            folders.setdefault(acc, set()).add(found)
    stats["annotation_taxid_mismatch_sample"] = mismatch_sample
    return folders


def _add_sample(stats: dict, key: str, items: list[str]) -> None:
    room = SAMPLE_LIMIT - len(stats[key])
    if room > 0:
        stats[key].extend(items[:room])


def relocate_all(dry_run: bool = True) -> dict:
    root = seq_files.ANNOTATIONS_PATH
    if not root:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")
    stats: dict = {
        "dry_run": dry_run, "assemblies": 0, "misplaced_assemblies": 0, "files_moved": 0,
        "duplicates_dropped": 0, "annotations_repointed": 0, "annotation_taxid_mismatch": 0,
        "conflicts": [], "missing": [], "errors": [], "misplaced_sample": [],
    }
    assembly_taxid = {
        acc: str(taxid) for acc, taxid in GenomeAssembly.objects().scalar("assembly_accession", "taxid")
    }
    stats["assemblies"] = len(assembly_taxid)
    on_disk = scan_assembly_dirs(root)
    from_db = _annotation_folders(assembly_taxid, stats)

    for acc, target in sorted(assembly_taxid.items()):
        olds = (on_disk.get(acc, set()) | from_db.get(acc, set())) - {target}
        if not olds:
            continue
        stats["misplaced_assemblies"] += 1
        if len(stats["misplaced_sample"]) < SAMPLE_LIMIT:
            stats["misplaced_sample"].append(f"{acc}: {sorted(olds)} -> {target}")
        res = file_layout.relocate_assembly(acc, target, old_taxids=olds, dry_run=dry_run)
        stats["files_moved"] += res["moved"]
        stats["duplicates_dropped"] += res["deduped"]
        stats["annotations_repointed"] += res["repointed"]
        _add_sample(stats, "conflicts", res["conflicts"])
        _add_sample(stats, "missing", res["missing"])
        _add_sample(stats, "errors", res["errors"])
    return stats


@shared_task(name="relocate_misplaced_assembly_files", ignore_result=False)
def relocate_misplaced_assembly_files(dry_run: bool = True):
    """
    Move the files of assemblies whose taxid changed into the folder of their current taxid and
    repoint the database. Dry-run by default; a real run takes the import job's lock so the two never
    write the same folders at once.
    """
    if dry_run:
        stats = relocate_all(dry_run=True)
    else:
        with _exclusive_run() as acquired:
            if not acquired:
                stats = {"dry_run": False, "skipped": "the import job is running; try again later"}
                print(f"relocate_misplaced_assembly_files: {stats}")
                return stats
            stats = relocate_all(dry_run=False)
    print(f"relocate_misplaced_assembly_files: {stats}")
    return stats
