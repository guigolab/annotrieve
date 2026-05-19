"""
On-disk assembly sequence artifacts under LOCAL_ANNOTATIONS_DIR.

Layout per assembly:
  {taxid}/{assembly_accession}/chromosomes.json
  {taxid}/{assembly_accession}/chr_aliases.tsv
  {taxid}/{assembly_accession}/{db}_{annotation_id}.gff.gz
  {taxid}/{assembly_accession}/{db}_{annotation_id}.contigs.txt
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Any, Iterable, Iterator

from jobs.services.classes import (
    AssemblyReportSequence,
    genomic_sequence_canonical_id,
)

ANNOTATIONS_PATH = os.getenv("LOCAL_ANNOTATIONS_DIR")
CHROMOSOMES_FILENAME = "chromosomes.json"
CHR_ALIASES_FILENAME = "chr_aliases.tsv"
CONTIGS_SUFFIX = ".contigs.txt"
ASSEMBLED_MOLECULE_ROLE = "assembled-molecule"
CHROMOSOME_LEVELS = frozenset({"chromosome", "complete genome"})


def _root() -> str:
    if not ANNOTATIONS_PATH:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")
    return ANNOTATIONS_PATH


def is_chromosome_level_assembly(assembly_level: str | None) -> bool:
    if not assembly_level:
        return False
    return assembly_level.strip().lower() in CHROMOSOME_LEVELS


def assembly_dir(taxid: str, assembly_accession: str) -> str:
    return os.path.join(_root(), str(taxid), assembly_accession)


def chromosomes_path(taxid: str, assembly_accession: str) -> str:
    return os.path.join(assembly_dir(taxid, assembly_accession), CHROMOSOMES_FILENAME)


def chr_aliases_path(taxid: str, assembly_accession: str) -> str:
    return os.path.join(assembly_dir(taxid, assembly_accession), CHR_ALIASES_FILENAME)


def contigs_path_for_bgzipped(bgzipped_relative_path: str) -> str:
    rel = bgzipped_relative_path.lstrip("/")
    return os.path.join(_root(), f"{rel}{CONTIGS_SUFFIX}")


def contigs_path_for_annotation(bgzipped_relative_path: str) -> str:
    return contigs_path_for_bgzipped(bgzipped_relative_path)


def chromosomes_file_exists(taxid: str, assembly_accession: str) -> bool:
    path = chromosomes_path(taxid, assembly_accession)
    return os.path.isfile(path) and os.path.getsize(path) > 0


def chr_aliases_file_exists(taxid: str, assembly_accession: str) -> bool:
    path = chr_aliases_path(taxid, assembly_accession)
    return os.path.isfile(path) and os.path.getsize(path) > 0


def resolve_chromosomes_path(
    taxid: str,
    view_accession: str,
    paired_accession: str | None = None,
) -> str | None:
    """Return path to chromosomes.json for view accession, or paired if missing."""
    primary = chromosomes_path(taxid, view_accession)
    if os.path.isfile(primary) and os.path.getsize(primary) > 0:
        return primary
    if paired_accession:
        paired = chromosomes_path(taxid, paired_accession)
        if os.path.isfile(paired) and os.path.getsize(paired) > 0:
            return paired
    return None


def resolve_chr_aliases_path(
    taxid: str,
    view_accession: str,
    paired_accession: str | None = None,
) -> str | None:
    primary = chr_aliases_path(taxid, view_accession)
    if os.path.isfile(primary) and os.path.getsize(primary) > 0:
        return primary
    if paired_accession:
        paired = chr_aliases_path(taxid, paired_accession)
        if os.path.isfile(paired) and os.path.getsize(paired) > 0:
            return paired
    return None


def report_sequence_to_chromosome_dict(seq: AssemblyReportSequence) -> dict[str, Any]:
    return {
        "canonical_id": genomic_sequence_canonical_id(
            seq.genbank_accn, seq.refseq_accn
        ),
        "chr_name": seq.chr_name or "",
        "sequence_name": seq.sequence_name or "",
        "ucsc_style_name": seq.ucsc_style_name or "",
        "genbank_accession": seq.genbank_accn or "",
        "refseq_accession": seq.refseq_accn or "",
        "sequence_role": seq.sequence_role or "",
        "length": seq.sequence_length,
    }


def _ref_name_for_aliases(seq: AssemblyReportSequence) -> str:
    ref_name = (seq.chr_name or seq.sequence_name or "").strip()
    if not ref_name:
        ref_name = (seq.ucsc_style_name or seq.genbank_accn or seq.refseq_accn or "").strip()
    return ref_name


def _alias_sort_key(name: str) -> tuple:
    """Stable ordering for derived alias variants (numeric and chr-prefixed names)."""
    s = name.strip()
    if not s:
        return (99, 0, "")
    if s.isdigit():
        return (0, int(s), s)
    m = re.match(r"^chr_?(\d+)$", s, re.I)
    if m:
        return (1, int(m.group(1)), s.lower())
    return (2, 0, s.lower())


def ordered_report_alias_names(seq: AssemblyReportSequence) -> list[str]:
    """
    refName first, then NCBI report fields in a fixed order, then derived variants sorted.
    """
    ref_name = _ref_name_for_aliases(seq)
    all_names = set(seq.get_aliases())
    if ref_name:
        all_names.add(ref_name)

    ordered: list[str] = []
    seen: set[str] = set()

    def add(value: str | None) -> None:
        v = (value or "").strip()
        if not v or v in seen:
            return
        seen.add(v)
        ordered.append(v)

    def add_with_accession_base(value: str | None) -> None:
        add(value)
        v = (value or "").strip()
        if v and "." in v:
            add(v.split(".", 1)[0])

    add(ref_name)
    add(seq.ucsc_style_name)
    add(seq.sequence_name)
    add_with_accession_base(seq.genbank_accn)
    add_with_accession_base(seq.refseq_accn)
    if (seq.chr_name or "").strip() and seq.chr_name != ref_name:
        add(seq.chr_name)

    for name in sorted(all_names - seen, key=_alias_sort_key):
        add(name)

    return ordered


def build_alias_line(seq: AssemblyReportSequence) -> str:
    """JBrowse RefNameAliasAdapter: refName\\talias1\\talias2..."""
    names = ordered_report_alias_names(seq)
    if not names:
        return ""
    return "\t".join(names)


def write_chromosomes(
    taxid: str,
    assembly_accession: str,
    sequences: list[AssemblyReportSequence],
) -> str:
    path = chromosomes_path(taxid, assembly_accession)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = [report_sequence_to_chromosome_dict(s) for s in sequences]
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, path)
    return path


def write_chr_aliases(
    taxid: str,
    assembly_accession: str,
    sequences: list[AssemblyReportSequence],
) -> str:
    path = chr_aliases_path(taxid, assembly_accession)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        for seq in sequences:
            line = build_alias_line(seq)
            if line.strip():
                fh.write(line + "\n")
    os.replace(tmp, path)
    return path


def read_chromosomes(taxid: str, assembly_accession: str) -> list[dict[str, Any]]:
    path = chromosomes_path(taxid, assembly_accession)
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array in {path}")
    return data


def write_contigs_from_tabix(bgzipped_full_path: str) -> str:
    """Run tabix -l and write {gff}.contigs.txt next to the gz file."""
    if not os.path.isfile(bgzipped_full_path):
        raise FileNotFoundError(bgzipped_full_path)
    rel = os.path.relpath(bgzipped_full_path, _root())
    out_path = contigs_path_for_bgzipped(rel)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    proc = subprocess.run(
        ["tabix", "-l", bgzipped_full_path],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            proc.stderr.strip() or f"tabix -l failed for {bgzipped_full_path}"
        )
    tmp = f"{out_path}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(proc.stdout)
        if proc.stdout and not proc.stdout.endswith("\n"):
            fh.write("\n")
    os.replace(tmp, out_path)
    return out_path


def contigs_file_exists(bgzipped_relative_path: str) -> bool:
    path = contigs_path_for_bgzipped(bgzipped_relative_path)
    return os.path.isfile(path) and os.path.getsize(path) > 0


def load_contig_ids_set(bgzipped_relative_path: str) -> set[str]:
    """Load all seqids from contigs.txt into a set (single pass)."""
    return set(iter_contigs_lines(bgzipped_relative_path))


def iter_contigs_lines(bgzipped_relative_path: str) -> Iterator[str]:
    path = contigs_path_for_bgzipped(bgzipped_relative_path)
    if not os.path.isfile(path):
        return iter(())
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            name = line.rstrip("\n\r")
            if name:
                yield name


def load_chr_aliases_index(
    taxid: str,
    assembly_accession: str,
    paired_accession: str | None = None,
) -> dict[str, str]:
    """
    Map alias -> refName (chr_name) from chr_aliases.tsv for resolve_sequence_id.
    """
    path = resolve_chr_aliases_path(taxid, assembly_accession, paired_accession)
    if not path:
        return {}
    index: dict[str, str] = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if not parts:
                continue
            ref_name = parts[0].strip()
            if not ref_name:
                continue
            for alias in parts:
                alias = alias.strip()
                if alias:
                    index[alias] = ref_name
    return index


def filter_assembled_molecules(
    sequences: list[AssemblyReportSequence],
) -> list[AssemblyReportSequence]:
    return [
        s
        for s in sequences
        if (s.sequence_role or "").strip().lower() == ASSEMBLED_MOLECULE_ROLE
    ]


def regenerate_all_contigs_txt(*, overwrite_existing: bool = True) -> dict:
    """
    Regenerate *.contigs.txt for every indexed annotation via tabix -l.

    When overwrite_existing is True (default), existing contigs.txt files are replaced.
    When False, annotations that already have a non-empty contigs.txt are skipped.
    """
    from db.models import GenomeAnnotation

    stats = {"scanned": 0, "written": 0, "overwritten": 0, "skipped": 0, "errors": []}
    for annotation in GenomeAnnotation.objects.only("annotation_id", "indexed_file_info"):
        stats["scanned"] += 1
        if not annotation.indexed_file_info or not annotation.indexed_file_info.bgzipped_path:
            stats["skipped"] += 1
            continue
        rel = annotation.indexed_file_info.bgzipped_path.lstrip("/")
        full = os.path.join(_root(), rel)
        if not os.path.isfile(full):
            stats["skipped"] += 1
            stats["errors"].append(f"{annotation.annotation_id}: missing {full}")
            continue
        if not overwrite_existing and contigs_file_exists(rel):
            stats["skipped"] += 1
            continue
        had_existing = contigs_file_exists(rel)
        try:
            write_contigs_from_tabix(full)
            stats["written"] += 1
            if had_existing:
                stats["overwritten"] += 1
        except Exception as exc:
            stats["errors"].append(f"{annotation.annotation_id}: {exc}")
    return stats


def delete_partial_sequence_files(taxid: str, assembly_accession: str) -> None:
    for path in (
        chromosomes_path(taxid, assembly_accession),
        chr_aliases_path(taxid, assembly_accession),
    ):
        if os.path.isfile(path):
            os.remove(path)
