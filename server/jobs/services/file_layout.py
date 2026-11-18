"""
On-disk layout of one assembly: every file lives under ``{assembly.taxid}/{assembly_accession}/``.

  {taxid}/{acc}/{db}_{annotation_id}.gff.gz  (+ .csi, .contigs.txt)   <- annotations
  {taxid}/{acc}/chromosomes.json, chr_aliases.tsv, assembly_report.txt <- assembly level

When the taxid of an assembly changes (NCBI re-assigns the organism, or the tracker reported a
different taxon than NCBI) the whole folder must follow, and the ``indexed_file_info`` paths in the
database must point at the new location. Nothing did that before, so annotation files stayed under
the old taxid while the regenerated chromosomes/aliases/report went under the new one.

``relocate_assembly`` is the single entry point used by the live hooks (assembly taxid change,
stale annotation update) and by the ``relocate_misplaced_assembly_files`` backfill job. It is
idempotent and safe to re-run: files are moved first, the database is repointed only for files that
really exist at the new path, and nothing is ever overwritten.
"""
from __future__ import annotations

import errno
import logging
import os
import posixpath
import re
import shutil

from db.models import GenomeAnnotation
from helpers import assembly_sequence_files as seq_files

logger = logging.getLogger(__name__)

ASSEMBLY_DIR_RE = re.compile(r"^GC[AF]_\d+\.\d+$")
_TAXID_RE = re.compile(r"^\d+$")
SAMPLE_LIMIT = 50

# Regenerable assembly-level files: if both folders hold one, the file already in the target wins.
ASSEMBLY_LEVEL_FILES = frozenset({
    seq_files.ASSEMBLY_REPORT_FILENAME,
    f"{seq_files.ASSEMBLY_REPORT_FILENAME}.tmp",
    seq_files.CHROMOSOMES_FILENAME,
    seq_files.CHR_ALIASES_FILENAME,
})


def is_safe_location(taxid: str, assembly_accession: str) -> bool:
    """Values come from the database or the disk: never build a path from anything odd."""
    return bool(_TAXID_RE.match(str(taxid))) and bool(ASSEMBLY_DIR_RE.match(str(assembly_accession)))


def folder_taxid(relative_path: str | None, assembly_accession: str) -> str | None:
    """Taxid folder of ``/{taxid}/{acc}/{file}``, or None if the path does not have that shape."""
    parts = [p for p in (relative_path or "").split("/") if p]
    if len(parts) != 3 or parts[1] != assembly_accession or not _TAXID_RE.match(parts[0]):
        return None
    return parts[0]


def _move_file(src: str, dst: str) -> None:
    """Rename; across filesystems copy under a temporary name first so dst is never partial."""
    try:
        os.rename(src, dst)
        return
    except OSError as exc:
        if exc.errno != errno.EXDEV:
            raise
    part = f"{dst}.moving"
    shutil.copy2(src, part)
    os.replace(part, dst)
    os.remove(src)


def _rmdir_if_empty(path: str) -> None:
    try:
        os.rmdir(path)
    except OSError:
        pass


def move_assembly_files(old_taxid: str, new_taxid: str, assembly_accession: str, *, dry_run: bool = False) -> dict:
    """
    Move every file of ``{old_taxid}/{acc}/`` into ``{new_taxid}/{acc}/``.

    Existing destination files are never overwritten: an assembly-level file already in the target
    wins (the source copy is dropped); any other file with the same name and size is a duplicate and
    the source copy is dropped; same name with a different size is reported as a conflict and left
    where it is.
    """
    out = {"moved": 0, "deduped": 0, "conflicts": []}
    if old_taxid == new_taxid or not (is_safe_location(old_taxid, assembly_accession)
                                      and is_safe_location(new_taxid, assembly_accession)):
        return out
    root = seq_files._root()
    src_dir = os.path.join(root, old_taxid, assembly_accession)
    dst_dir = os.path.join(root, new_taxid, assembly_accession)
    if not os.path.isdir(src_dir):
        return out
    for name in sorted(os.listdir(src_dir)):
        src, dst = os.path.join(src_dir, name), os.path.join(dst_dir, name)
        if not os.path.isfile(src) or os.path.islink(src):
            out["conflicts"].append(f"{old_taxid}/{assembly_accession}/{name}: not a regular file")
            continue
        if os.path.lexists(dst):
            if name in ASSEMBLY_LEVEL_FILES or os.path.getsize(src) == os.path.getsize(dst):
                if not dry_run:
                    os.remove(src)
                out["deduped"] += 1
            else:
                out["conflicts"].append(
                    f"{old_taxid}/{assembly_accession}/{name}: differs from the copy under {new_taxid}")
            continue
        if not dry_run:
            os.makedirs(dst_dir, exist_ok=True)
            _move_file(src, dst)
        out["moved"] += 1
    if not dry_run:
        _rmdir_if_empty(src_dir)
        _rmdir_if_empty(os.path.join(root, old_taxid))
    return out


def repoint_annotation_paths(assembly_accession: str, new_taxid: str, *, dry_run: bool = False) -> dict:
    """
    Point ``indexed_file_info`` of the assembly's annotations at ``/{new_taxid}/{acc}/{file}`` once
    the file really exists there. Annotations already there, or whose file is nowhere, are left
    alone (the latter is reported).
    """
    out = {"repointed": 0, "already": 0, "missing": []}
    root = seq_files._root()
    for annotation in (GenomeAnnotation.objects(assembly_accession=assembly_accession)
                       .only("annotation_id", "indexed_file_info").no_cache()):
        info = annotation.indexed_file_info
        if not info or not info.bgzipped_path:
            continue
        current = folder_taxid(info.bgzipped_path, assembly_accession)
        if current == new_taxid:
            out["already"] += 1
            continue
        if current is None:
            out["missing"].append(f"{annotation.annotation_id}: unexpected path {info.bgzipped_path!r}")
            continue
        new_gff = f"/{new_taxid}/{assembly_accession}/{posixpath.basename(info.bgzipped_path)}"
        csi_name = posixpath.basename(info.csi_path or f"{info.bgzipped_path}.csi")
        new_csi = f"/{new_taxid}/{assembly_accession}/{csi_name}"
        def present(new_rel: str, old_rel: str) -> bool:
            # A dry run has not moved anything yet: the file counts if it is still at its old path.
            return (os.path.isfile(os.path.join(root, new_rel.lstrip("/")))
                    or (dry_run and os.path.isfile(os.path.join(root, old_rel.lstrip("/")))))

        old_csi = info.csi_path or f"{info.bgzipped_path}.csi"
        if not (present(new_gff, info.bgzipped_path) and present(new_csi, old_csi)):
            out["missing"].append(f"{annotation.annotation_id}: no file at {new_gff}")
            continue
        if not dry_run:
            GenomeAnnotation.objects(annotation_id=annotation.annotation_id).update_one(
                set__indexed_file_info__bgzipped_path=new_gff,
                set__indexed_file_info__csi_path=new_csi,
            )
        out["repointed"] += 1
    return out


def folders_of_assembly(assembly_accession: str) -> set[str]:
    """Taxid folders the database currently points this assembly's annotation files at."""
    folders: set[str] = set()
    for annotation in (GenomeAnnotation.objects(assembly_accession=assembly_accession)
                       .only("indexed_file_info").no_cache()):
        info = annotation.indexed_file_info
        found = folder_taxid(info.bgzipped_path, assembly_accession) if info else None
        if found:
            folders.add(found)
    return folders


def relocate_assembly(
    assembly_accession: str,
    target_taxid: str,
    *,
    old_taxids: set[str] | None = None,
    dry_run: bool = False,
) -> dict:
    """
    Make ``{target_taxid}/{acc}/`` hold everything of the assembly and repoint the database.

    ``old_taxids`` are extra folders to empty (for example a taxid that is known to have just
    changed); the folders the annotations point at are always included.
    """
    target_taxid = str(target_taxid)
    stats = {"assembly": assembly_accession, "target": target_taxid, "moved": 0, "deduped": 0,
             "repointed": 0, "conflicts": [], "missing": [], "errors": []}
    if not is_safe_location(target_taxid, assembly_accession):
        stats["errors"].append(f"unsafe location {target_taxid}/{assembly_accession}")
        return stats
    olds = (set(old_taxids or ()) | folders_of_assembly(assembly_accession)) - {target_taxid}
    for old in sorted(olds):
        try:
            res = move_assembly_files(old, target_taxid, assembly_accession, dry_run=dry_run)
        except OSError as exc:
            stats["errors"].append(f"{old}/{assembly_accession}: {exc}")
            continue
        stats["moved"] += res["moved"]
        stats["deduped"] += res["deduped"]
        stats["conflicts"] += res["conflicts"]
    try:
        res = repoint_annotation_paths(assembly_accession, target_taxid, dry_run=dry_run)
    except Exception as exc:  # database trouble must not hide what was moved
        stats["errors"].append(f"repoint {assembly_accession}: {exc}")
        return stats
    stats["repointed"] = res["repointed"]
    stats["missing"] = res["missing"]
    return stats
