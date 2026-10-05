"""
RefSeq corpus profile — owns RefSeq-specific parse decisions.

Grounded in GENE_ATTRIBUTE_SOURCE_MAP.md / GENE_CORPUS_SQL_ARCHITECTURE.md.
Profiles own the col-9 keep-maps (gene / transcript / CDS).

Keep-map roles:
  xref A   — gated Name/gene/standard_name→symbol; synonyms→alias; Dbxref
             (incl. rare GO); Ontology_term/go_* only on CDS (≈1 file)
  xref B   — locus_tag, transcript_id, protein_id, orig_*
  display  — description (prose); gene_biotype
  omit     — product (not used for prose); Note/note (model-edit);
             Target/pct_*/alignment

GO primarily via Dbxref; structured Ontology_term is ~0% (kept on CDS only).
"""
from __future__ import annotations

from gene_corpus.namespaces.tiers import include_in_local
from gene_corpus.stream.attrs import first_attr
from gene_corpus.stream.emit_util import (
    emit_attr_accession,
    emit_dbxref_values,
    emit_go_values,
)
from gene_corpus.stream.symbol_gate import alias_ok, normalize_symbol, symbol_ok

SINGLE_VALUED_KEYS: frozenset[str] = frozenset(
    {"ID", "Parent", "transcript_id", "protein_id", "locus_tag"}
)
# exon kept out of early-skip in harvest; landmarks unioned in gating.profile_skip_types
SKIP_TYPES: frozenset[str] = frozenset({"exon"})
ID_PREFIX_STRIPS: tuple[str, ...] = ("gene-", "rna-", "cds-")

GO_ATTR_KEYS: frozenset[str] = frozenset(
    {
        "Ontology_term",
        "go_function",
        "go_process",
        "go_component",
    }
)
# Pipe-bare numeric ids (e.g. "|3824; label|") — only these keys.
GO_STAR_KEYS: frozenset[str] = frozenset(
    {"go_function", "go_process", "go_component"}
)

# Never parse even if the file lists them.
OMIT_ATTR_KEYS: frozenset[str] = frozenset(
    {
        "Note",
        "note",
        "Target",
        "gbkey",
        "mol_type",
    }
)

_STRUCTURAL: frozenset[str] = frozenset({"ID", "Parent"})
_SYNONYM_KEYS: frozenset[str] = frozenset(
    {
        "gene_synonym",
        "gb-synonym",
        "synonym",
        "old-name",
        "old_locus_tag",
    }
)

KEEP_GENE: frozenset[str] = _STRUCTURAL | frozenset(
    {
        "Name",
        "gene",
        "standard_name",
        "locus_tag",
        "Dbxref",
        "db_xref",
        "description",
        "gene_biotype",
    }
) | _SYNONYM_KEYS

KEEP_TRANSCRIPT: frozenset[str] = _STRUCTURAL | frozenset(
    {
        "transcript_id",
        "orig_transcript_id",
        "Dbxref",
        "db_xref",
    }
)

# Ontology_term/go_* on CDS only — ∩ file keys drops them for normal RefSeq.
KEEP_CDS: frozenset[str] = _STRUCTURAL | frozenset(
    {
        "protein_id",
        "orig_protein_id",
        "Dbxref",
        "db_xref",
    }
) | GO_ATTR_KEYS

_ALIAS_KEYS = (
    "gene_synonym",
    "gb-synonym",
    "synonym",
    "old-name",
    "old_locus_tag",
)
_SYMBOL_KEYS = ("Name", "gene", "standard_name")


class RefSeqProfile:
    """RefSeq GFF attribute → (namespace, accession, origin) emitter."""

    profile_id: str = "refseq"

    def primary_name(self, attrs: dict[str, list[str]]) -> str | None:
        for key in ("Name", "gene", "standard_name", "locus_tag"):
            val = first_attr(attrs, key)
            if val and val.strip():
                return val.strip()
        return None

    def biotype(self, attrs: dict[str, list[str]]) -> str | None:
        val = first_attr(attrs, "gene_biotype")
        return val.strip() if val and val.strip() else None

    def _parse_go_attrs(
        self, attrs: dict[str, list[str]]
    ) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        for key in GO_ATTR_KEYS:
            out.extend(
                emit_go_values(
                    attrs.get(key) or [],
                    allow_bare=key in GO_STAR_KEYS,
                )
            )
        return out

    def parse_feature(
        self, feature_type: str, attrs: dict[str, list[str]]
    ) -> list[tuple[str, str, str]]:
        ft = feature_type.casefold()
        if ft in SKIP_TYPES:
            return []

        out: list[tuple[str, str, str]] = []
        locus_tag = first_attr(attrs, "locus_tag")
        feature_id = first_attr(attrs, "ID")

        for key in _SYMBOL_KEYS:
            for val in attrs.get(key) or []:
                if symbol_ok(val, locus_tag=locus_tag, feature_id=feature_id):
                    if include_in_local("symbol"):
                        out.append(("symbol", normalize_symbol(val), "attr"))

        for key in _ALIAS_KEYS:
            for val in attrs.get(key) or []:
                text = (val or "").strip()
                if not text or not alias_ok(
                    text, locus_tag=locus_tag, feature_id=feature_id
                ):
                    continue
                if include_in_local("alias"):
                    out.append(("alias", normalize_symbol(text), "attr"))

        for ns, acc in emit_dbxref_values(attrs.get("Dbxref") or []):
            out.append((ns, acc, "dbxref"))
        for ns, acc in emit_dbxref_values(attrs.get("db_xref") or []):
            out.append((ns, acc, "dbxref"))
        for ns, acc in self._parse_go_attrs(attrs):
            out.append((ns, acc, "attr"))

        pair = emit_attr_accession("locus_tag", locus_tag)
        if pair:
            out.append((*pair, "attr"))
        pair = emit_attr_accession(
            "refseq_transcript", first_attr(attrs, "transcript_id")
        )
        if pair:
            out.append((*pair, "attr"))
        pair = emit_attr_accession(
            "refseq_protein", first_attr(attrs, "protein_id")
        )
        if pair:
            out.append((*pair, "attr"))
        pair = emit_attr_accession(
            "submitter_transcript", first_attr(attrs, "orig_transcript_id")
        )
        if pair:
            out.append((*pair, "attr"))
        pair = emit_attr_accession(
            "submitter_protein", first_attr(attrs, "orig_protein_id")
        )
        if pair:
            out.append((*pair, "attr"))

        return out
