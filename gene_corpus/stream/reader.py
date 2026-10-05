"""GFF line streaming (gzip or plain) with early landmark skip."""
from __future__ import annotations

import gzip
from pathlib import Path
from typing import Iterator, NamedTuple

from gene_corpus.gating import DNA_LANDMARKS


class GffLine(NamedTuple):
    seqid: str
    feature_type: str
    start: int
    end: int
    strand: str
    attr_column: str


def open_text(path: Path):
    """Open GFF path as text (gzip if .gz)."""
    if str(path).endswith(".gz"):
        return gzip.open(path, "rt", encoding="utf-8", errors="replace")
    return path.open("rt", encoding="utf-8", errors="replace")


def iter_gff_lines(
    path: Path,
    *,
    skip_types: frozenset[str] | None = None,
) -> Iterator[GffLine]:
    """
    Yield parsed feature lines.

    Uses ``split("\\t", 3)`` so landmarks pay for at most four parts; kept
    lines split the remainder once. Skips comments, malformed rows, and
    ``DNA_LANDMARKS`` (plus optional ``skip_types``, casefolded). Profiles
    may still filter further in harvest.
    """
    early_skip = DNA_LANDMARKS
    if skip_types:
        early_skip = early_skip | frozenset(t.casefold() for t in skip_types)

    with open_text(path) as handle:
        for raw in handle:
            if not raw or raw.startswith("#"):
                continue
            head = raw.rstrip("\n").split("\t", 3)
            if len(head) < 4:
                continue
            seqid, _source, ftype, rest = head
            if ftype.casefold() in early_skip:
                continue

            tail = rest.split("\t")
            # start, end, score, strand, phase, attrs  → 6 fields
            if len(tail) < 6:
                continue
            try:
                start = int(tail[0])
                end = int(tail[1])
            except ValueError:
                continue
            yield GffLine(
                seqid=seqid,
                feature_type=ftype,
                start=start,
                end=end,
                strand=tail[3],
                attr_column=tail[5],
            )
