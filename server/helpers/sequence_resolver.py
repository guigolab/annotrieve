"""
Resolve sequence aliases (names, accessions, UCSC names...) against a stored raw NCBI
assembly_report.txt. The file is scanned line by line and only rows matching a requested alias
are kept, so memory is bounded by the number of aliases, not by the report size.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Iterator

MATCH_EXACT = "exact"
MATCH_NORMALIZED = "normalized"  # case-insensitive, accession version and 'chr' prefix ignored

STATUS_RESOLVED = "resolved"
STATUS_UNRESOLVED = "unresolved"
STATUS_AMBIGUOUS = "ambiguous"

_IDENTIFIER_COLUMNS = (
    "sequence_name",
    "assigned_molecule",
    "genbank_accn",
    "refseq_accn",
    "ucsc_style_name",
)
_VERSIONED_ACCESSION = re.compile(r"^([A-Za-z]{1,6}_?\d+)\.\d+$")
_CHR_PREFIX = re.compile(r"^chr_?", re.I)


@dataclass
class ResolvedSequence:
    alias: str
    status: str = STATUS_UNRESOLVED
    match: str | None = None
    accession: str | None = None
    db: str | None = None  # genbank | refseq
    sequence_name: str | None = None
    sequence_role: str | None = None
    length: int | None = None
    identifiers: list[str] = field(default_factory=list)  # every identifier of the matched row
    candidates: int = 0  # number of rows matching at the winning level


def normalize(value: str) -> str:
    v = value.strip()
    m = _VERSIONED_ACCESSION.match(v)
    if m:
        v = m.group(1)
    return _CHR_PREFIX.sub("", v).lower()


def _clean(value: str) -> str:
    v = value.strip()
    return "" if v.lower() in ("", "na", "n/a") else v


def iter_report_rows(path: str) -> Iterator[dict[str, str]]:
    """Yield every data row of an assembly report as {normalized_column: value}."""
    header: list[str] | None = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\r\n")
            if not line:
                continue
            if line.startswith("#"):
                cols = (
                    line.lstrip("#").strip().lower()
                    .replace(" ", "_").replace("-", "_").replace("/", "_")
                    .split("\t")
                )
                if "sequence_name" in cols and "sequence_role" in cols:
                    header = cols
                continue
            if not header:
                continue
            yield {h: _clean(v) for h, v in zip(header, line.split("\t"))}


def preferred_db(assembly_accession: str) -> str:
    """GCF_ assemblies are RefSeq, everything else GenBank."""
    return "refseq" if assembly_accession.upper().startswith("GCF_") else "genbank"


def _row_identifiers(row: dict[str, str]) -> list[str]:
    # Assigned-Molecule names the sequence itself only for assembled molecules. For unlocalized
    # scaffolds it is the *parent chromosome* ("1", "X"...), which would make every chromosome
    # alias ambiguous with all the scaffolds placed on it.
    own_molecule = (row.get("sequence_role", "") or "").strip().lower() == "assembled-molecule"
    out: list[str] = []
    for col in _IDENTIFIER_COLUMNS:
        if col == "assigned_molecule" and not own_molecule:
            continue
        v = row.get(col, "")
        if v and v not in out:
            out.append(v)
    return out


def _pick_accession(row: dict[str, str], prefer: str) -> tuple[str | None, str | None]:
    gb, rs = row.get("genbank_accn", ""), row.get("refseq_accn", "")
    order = [("refseq", rs), ("genbank", gb)] if prefer == "refseq" else [("genbank", gb), ("refseq", rs)]
    for db, acc in order:
        if acc:
            return acc, db
    return None, None


def resolve_aliases_in_report(
    report_path: str,
    aliases: Iterable[str],
    assembly_accession: str,
) -> list[ResolvedSequence]:
    """Resolve each alias (results are returned in request order, duplicates included)."""
    requested = [a for a in aliases]
    prefer = preferred_db(assembly_accession)
    exact_req: dict[str, set[str]] = {}
    norm_req: dict[str, set[str]] = {}
    for alias in requested:
        a = alias.strip()
        if not a:
            continue
        exact_req.setdefault(a, set()).add(alias)
        norm_req.setdefault(normalize(a), set()).add(alias)

    # alias -> level -> {row_index: row}
    found: dict[str, dict[str, dict[int, dict[str, str]]]] = {}
    for idx, row in enumerate(iter_report_rows(report_path)):
        for ident in _row_identifiers(row):
            for alias in exact_req.get(ident, ()):
                found.setdefault(alias, {}).setdefault(MATCH_EXACT, {})[idx] = row
            for alias in norm_req.get(normalize(ident), ()):
                found.setdefault(alias, {}).setdefault(MATCH_NORMALIZED, {})[idx] = row

    results: list[ResolvedSequence] = []
    for alias in requested:
        levels = found.get(alias, {})
        level = MATCH_EXACT if MATCH_EXACT in levels else MATCH_NORMALIZED if MATCH_NORMALIZED in levels else None
        if level is None:
            results.append(ResolvedSequence(alias=alias))
            continue
        rows = levels[level]
        if len(rows) > 1:
            results.append(ResolvedSequence(alias=alias, status=STATUS_AMBIGUOUS, match=level, candidates=len(rows)))
            continue
        row = next(iter(rows.values()))
        accession, db = _pick_accession(row, prefer)
        length = row.get("sequence_length", "").replace(",", "")
        results.append(
            ResolvedSequence(
                alias=alias,
                status=STATUS_RESOLVED if accession else STATUS_UNRESOLVED,
                match=level,
                accession=accession,
                db=db,
                sequence_name=row.get("sequence_name") or None,
                sequence_role=row.get("sequence_role") or None,
                length=int(length) if length.isdigit() else None,
                identifiers=_row_identifiers(row)
                + [v.split(".")[0] for v in _row_identifiers(row) if _VERSIONED_ACCESSION.match(v)],
                candidates=1,
            )
        )
    return results
