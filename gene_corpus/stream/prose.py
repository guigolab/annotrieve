"""
Pick-one prose string per gene locus: gene-line description only (or NULL).

No product / Note prose. See description-only prose plan.
"""
from __future__ import annotations

import re
from urllib.parse import unquote

# RefSeq bare "uncharacterized LOC…" description — not useful prose.
_BARE_UNCHAR_LOC_RE = re.compile(
    r"^uncharacterized\s+LOC\d+\s*$",
    re.IGNORECASE,
)


def _unquote_description(description: str) -> str:
    """URL-unquote col9-encoded description text for readable storage."""
    return unquote(
        description.replace("%3B", ";").replace("%3A", ":").replace("%3D", "=")
    ).strip()


def is_bare_uncharacterized_loc(description: str | None) -> bool:
    if not description:
        return False
    text = unquote(description.strip())
    return bool(_BARE_UNCHAR_LOC_RE.fullmatch(text))


def finalize_prose(
    profile_id: str,
    *,
    gene_description: str | None,
) -> tuple[str | None, str | None]:
    """
    Return ``(prose, prose_kind)`` for one locus.

    ``prose_kind`` is ``'description'`` or None.
    """
    pid = (profile_id or "").casefold()

    if pid == "ensembl":
        # Keep description as-is (NN / Source trailers included); unquote only.
        if gene_description and gene_description.strip():
            text = _unquote_description(gene_description)
            if text:
                return text, "description"
        return None, None

    if pid == "refseq":
        desc = (gene_description or "").strip()
        if desc and not is_bare_uncharacterized_loc(desc):
            return _unquote_description(desc), "description"
        return None, None

    # GenBank (and unknown): description if present, else NULL.
    if gene_description and gene_description.strip():
        text = _unquote_description(gene_description)
        if text:
            return text, "description"
    return None, None
