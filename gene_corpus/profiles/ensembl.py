"""
Ensembl corpus profile — owns Ensembl-specific parse decisions.

Grounded in GENE_ATTRIBUTE_SOURCE_MAP.md / GENE_CORPUS_SQL_ARCHITECTURE.md.
Profiles own the col-9 keep-maps (gene / transcript / CDS).

Keep-map roles:
  xref A   — gene_id, Name→symbol, description Source/Acc
  xref B   — transcript_id, protein_id
  display  — description (prose as-is), biotype, Name
  omit     — Alias (assembly), product, exon_id, rank, tag, constitutive, version

No Dbxref / Ontology_term / go_* — xrefs live in description.
"""
from __future__ import annotations

from gene_corpus.namespaces.tiers import include_in_local
from gene_corpus.stream.attrs import first_attr, strip_id_prefixes
from gene_corpus.stream.emit_util import emit_attr_accession, emit_ensembl_description
from gene_corpus.stream.symbol_gate import normalize_symbol, symbol_ok

SINGLE_VALUED_KEYS: frozenset[str] = frozenset(
    {"ID", "Parent", "gene_id", "transcript_id", "protein_id"}
)
# exon kept for harvest parent attach; landmarks unioned in gating.profile_skip_types
SKIP_TYPES: frozenset[str] = frozenset({"exon"})
ID_PREFIX_STRIPS: tuple[str, ...] = ("gene:", "transcript:", "CDS:", "cds:")

# Never parse even if the file lists them.
OMIT_ATTR_KEYS: frozenset[str] = frozenset(
    {
        "Alias",
        "alias",
        "exon_id",
        "rank",
        "tag",
        "constitutive",
        "version",
    }
)

_STRUCTURAL: frozenset[str] = frozenset({"ID", "Parent"})

# Gene-line keep (xref A + display + address).
KEEP_GENE: frozenset[str] = _STRUCTURAL | frozenset(
    {"gene_id", "Name", "description", "biotype"}
)
# Transcript-line keep (Tier B transcript id + optional Name).
KEEP_TRANSCRIPT: frozenset[str] = _STRUCTURAL | frozenset(
    {"transcript_id", "Name"}
)
# CDS-line keep (Tier B protein).
KEEP_CDS: frozenset[str] = _STRUCTURAL | frozenset({"protein_id"})

GO_ATTR_KEYS: frozenset[str] = frozenset()


class EnsemblProfile:
    """Ensembl GFF attribute → (namespace, accession, origin) emitter."""

    profile_id: str = "ensembl"

    def primary_name(self, attrs: dict[str, list[str]]) -> str | None:
        for key in ("Name", "gene_id"):
            val = first_attr(attrs, key)
            if val and val.strip():
                return val.strip()
        return None

    def biotype(self, attrs: dict[str, list[str]]) -> str | None:
        val = first_attr(attrs, "biotype")
        return val.strip() if val and val.strip() else None

    def parse_feature(
        self, feature_type: str, attrs: dict[str, list[str]]
    ) -> list[tuple[str, str, str]]:
        ft = feature_type.casefold()
        if ft in SKIP_TYPES:
            return []

        out: list[tuple[str, str, str]] = []
        feature_id = first_attr(attrs, "ID")
        gene_id = first_attr(attrs, "gene_id")
        if gene_id and include_in_local("ensembl"):
            cleaned = strip_id_prefixes(gene_id, ID_PREFIX_STRIPS)
            if cleaned:
                out.append(("ensembl", cleaned, "attr"))
        elif feature_id and ft == "gene" and include_in_local("ensembl"):
            cleaned = strip_id_prefixes(feature_id, ID_PREFIX_STRIPS)
            if cleaned.upper().startswith("ENS"):
                out.append(("ensembl", cleaned, "attr"))

        for val in attrs.get("Name") or []:
            if symbol_ok(val, feature_id=feature_id):
                if include_in_local("symbol"):
                    out.append(("symbol", normalize_symbol(val), "attr"))

        for desc in attrs.get("description") or []:
            for ns, acc in emit_ensembl_description(desc):
                out.append((ns, acc, "description"))

        pair = emit_attr_accession(
            "ensembl_transcript",
            first_attr(attrs, "transcript_id"),
            prefixes=ID_PREFIX_STRIPS,
        )
        if pair:
            out.append((*pair, "attr"))

        pair = emit_attr_accession(
            "ensembl_protein",
            first_attr(attrs, "protein_id"),
            prefixes=ID_PREFIX_STRIPS,
        )
        if pair:
            out.append((*pair, "attr"))

        return out
