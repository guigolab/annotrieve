"""Shared emit helpers for profile parse_feature (thin; profiles own policy)."""
from __future__ import annotations

import re
from urllib.parse import unquote

from gene_corpus.namespaces.labels import (
    _SOURCE_KEYS_BY_LEN,
    namespace_for_dbxref_db_local,
    namespace_for_ensembl_source_local,
    namespace_for_projected_from,
)
from gene_corpus.namespaces.tiers import include_in_local
from gene_corpus.stream.symbol_gate import normalize_symbol, symbol_ok

# GO: / GO_ / GO + 1–7 digits → pad to GO:#######; prose around it is ignored.
_GO_RE = re.compile(r"(?i)\bGO[:_]?(\d{1,7})(?!\d)")
# go_* pipe tokens: "|3824; label|" → bare id (pad to 7).
_GO_BARE_PIECE_RE = re.compile(r"^(\d{1,7})$")
_SOURCE_ACC_RE = re.compile(
    r"\[Source:(?P<label>[^\];]+);Acc:(?P<acc>[^\]]+)\]",
    re.IGNORECASE,
)
_PARENT_XREF_RE = re.compile(
    r"parent_gene_display_xref=(?P<sym>[^\s;\]]+)",
    re.IGNORECASE,
)
_EGGNOG_RE = re.compile(r"(?:EggNog|eggNOG):(ENOG\w+)", re.IGNORECASE)
_COG_RE = re.compile(r"COG:([A-Z0-9]+)", re.IGNORECASE)


def _go_accessions(raw: str, *, allow_bare: bool = False) -> list[str]:
    """Find GO:/GO_/GO + digits; pad to 7; skip everything else.

    When ``allow_bare`` (go_* attrs only), also take pipe/comma pieces that are
    bare 1–7 digit ids (strip ``; label`` tails).
    """
    text = unquote((raw or "").strip())
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()

    def _add(digits: str) -> None:
        go_id = f"GO:{digits.zfill(7)}"
        if go_id not in seen:
            seen.add(go_id)
            out.append(go_id)

    for digits in _GO_RE.findall(text):
        _add(digits)
    if allow_bare:
        for piece in re.split(r"[|,]", text):
            piece = piece.split(";", 1)[0].strip()
            m = _GO_BARE_PIECE_RE.fullmatch(piece)
            if m:
                _add(m.group(1))
    return out


def normalize_go_token(raw: str, *, allow_bare: bool = False) -> str | None:
    """Return the first valid GO accession in *raw*, or None."""
    found = _go_accessions(raw, allow_bare=allow_bare)
    return found[0] if found else None


def emit_go_values(
    values: list[str], *, allow_bare: bool = False
) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    if not include_in_local("go"):
        return out
    for raw in values:
        for go_id in _go_accessions(raw, allow_bare=allow_bare):
            if go_id not in seen:
                seen.add(go_id)
                out.append(("go", go_id))
    return out


def emit_dbxref_values(values: list[str]) -> list[tuple[str, str]]:
    """Emit Tier A+B Dbxref pairs (local mapper); Tier C / unknown skipped."""
    out: list[tuple[str, str]] = []
    for raw in values:
        token = (raw or "").strip()
        if not token or ":" not in token:
            continue
        db_raw, xref_id = token.split(":", 1)
        ns = namespace_for_dbxref_db_local(db_raw)
        xref_id = xref_id.strip()
        if not ns or not xref_id:
            continue
        if ns == "go":
            for go_id in _go_accessions(token):
                out.append(("go", go_id))
            continue
        out.append((ns, xref_id))
    return out


def emit_ensembl_description(description: str) -> list[tuple[str, str]]:
    """Emit Tier A+B Source/Acc + gated parent_gene_display_xref symbol."""
    if not description:
        return []
    text = unquote(
        description.replace("%3B", ";").replace("%3A", ":").replace("%3D", "=")
    )
    out: list[tuple[str, str]] = []
    for m in _SOURCE_ACC_RE.finditer(text):
        label = m.group("label").strip()
        acc = m.group("acc").strip()
        if not acc:
            continue
        if acc.upper().startswith("HGNC:"):
            acc = acc.split(":", 1)[1]
        label_cf = label.casefold()
        ns: str | None = None
        if "projected" in label_cf:
            ns = namespace_for_projected_from(label)
        else:
            ns = namespace_for_ensembl_source_local(label)
            if ns is None:
                # Longest-prefix match against declared Source labels.
                for key in _SOURCE_KEYS_BY_LEN:
                    if label_cf == key or label_cf.startswith(key):
                        ns = namespace_for_ensembl_source_local(key)
                        break
        if ns and include_in_local(ns):
            out.append((ns, acc))

    pm = _PARENT_XREF_RE.search(text)
    if pm:
        sym = pm.group("sym").strip()
        if sym and include_in_local("symbol") and symbol_ok(sym):
            out.append(("symbol", normalize_symbol(sym)))
    return out


def emit_note_eggnog_cog(note_values: list[str]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for note in note_values:
        if not note:
            continue
        for m in _EGGNOG_RE.finditer(note):
            if include_in_local("eggnog"):
                out.append(("eggnog", m.group(1)))
        for m in _COG_RE.finditer(note):
            if include_in_local("cog"):
                out.append(("cog", m.group(1)))
    return out


def emit_attr_accession(
    namespace: str, raw: str | None, *, prefixes: tuple[str, ...] = ()
) -> tuple[str, str] | None:
    """Emit one (ns, acc) from a single-valued attr when include_in_local."""
    from gene_corpus.stream.attrs import strip_id_prefixes

    if not raw or not include_in_local(namespace):
        return None
    acc = strip_id_prefixes(raw.strip(), prefixes) if prefixes else raw.strip()
    if not acc:
        return None
    return (namespace, acc)
