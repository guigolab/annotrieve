"""
GenBank corpus profile — owns GenBank-specific parse decisions.

Grounded in GENE_ATTRIBUTE_SOURCE_MAP.md / GENE_CORPUS_SQL_ARCHITECTURE.md.
Profiles own the col-9 keep-maps (gene / transcript / CDS).

Keep-map roles:
  xref A   — gated Name/gene/standard_name→symbol; synonyms→alias; Dbxref;
             Ontology_term/go_*→go (CDS); Note EggNOG/COG (xref only)
  xref B   — locus_tag, protein_id→ncbi_gp, orig_*
  display  — description (prose, rare); gene_biotype
  omit     — product (not used for prose); transcript_id (~0%);
             gbkey/mol_type, specimen/geo

Primary GO path: Ontology_term + go_* on CDS (not gene).
"""
from __future__ import annotations

from gene_corpus.namespaces.tiers import include_in_local
from gene_corpus.stream.attrs import first_attr
from gene_corpus.stream.emit_util import (
    emit_attr_accession,
    emit_dbxref_values,
    emit_go_values,
    emit_note_eggnog_cog,
)
from gene_corpus.stream.symbol_gate import alias_ok, normalize_symbol, symbol_ok

SINGLE_VALUED_KEYS: frozenset[str] = frozenset(
    {"ID", "Parent", "protein_id", "locus_tag"}
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
        "transcript_id",  # ~0% GenBank; use ID / orig_transcript_id
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
        "Note",
        "note",
        "gene_biotype",
    }
) | _SYNONYM_KEYS

KEEP_TRANSCRIPT: frozenset[str] = _STRUCTURAL | frozenset(
    {
        "orig_transcript_id",
        "orig_protein_id",
        "Dbxref",
        "db_xref",
    }
)

KEEP_CDS: frozenset[str] = _STRUCTURAL | frozenset(
    {
        "protein_id",
        "orig_protein_id",
        "Dbxref",
        "db_xref",
        "Note",
        "note",
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


class GenBankProfile:
    """GenBank GFF attribute → (namespace, accession, origin) emitter."""

    profile_id: str = "genbank"

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

    def _parse_note_eggnog_cog(
        self, note_values: list[str]
    ) -> list[tuple[str, str]]:
        return emit_note_eggnog_cog(note_values)

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
        for ns, acc in self._parse_note_eggnog_cog(
            (attrs.get("Note") or []) + (attrs.get("note") or [])
        ):
            out.append((ns, acc, "note"))

        pair = emit_attr_accession("locus_tag", locus_tag)
        if pair:
            out.append((*pair, "attr"))
        pair = emit_attr_accession(
            "ncbi_gp", first_attr(attrs, "protein_id")
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
