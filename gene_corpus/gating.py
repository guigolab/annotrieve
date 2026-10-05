"""
Per-file parse gates from report metadata (attribute_keys / types / roots).

Independent of server.helpers.gene_search.gating — uses gene_corpus profiles.
"""
from __future__ import annotations

from gene_corpus.catalog.models import ParseGate
from gene_corpus.profiles import ensembl, genbank, refseq

# Sequence landmarks are not gene loci (same idea as parquet/window.py).
DNA_LANDMARKS: frozenset[str] = frozenset(
    {
        "chromosome",
        "contig",
        "scaffold",
        "plasmid",
        "mitochondrion",
        "chloroplast",
        "mitogenome",
        "region",
        "biological_region",
        "telomere",
        "supercontig",
        "scaffold_region",
    }
)

_PROFILE_MODULES = {
    "ensembl": ensembl,
    "genbank": genbank,
    "refseq": refseq,
}


def _intersect_keep(
    level_map: frozenset[str],
    *,
    file_set: frozenset[str] | None,
    omit: frozenset[str],
) -> frozenset[str]:
    """Level keep-map minus omit; ∩ file keys when known."""
    base = frozenset(k for k in level_map if k not in omit)
    if file_set is None:
        return base
    return frozenset(k for k in base if k in file_set)


def profile_skip_types(profile_id: str) -> frozenset[str]:
    """Profile skips ∪ DNA landmarks (exon kept for harvest parent attach)."""
    return frozenset(_PROFILE_MODULES[profile_id].SKIP_TYPES) | DNA_LANDMARKS


def profile_cds_keys(profile_id: str) -> frozenset[str]:
    mod = _PROFILE_MODULES[profile_id]
    omit = mod.OMIT_ATTR_KEYS
    return frozenset(k for k in mod.KEEP_CDS if k not in omit and k not in ("ID", "Parent"))


def profile_go_keys(profile_id: str) -> frozenset[str]:
    return frozenset(_PROFILE_MODULES[profile_id].GO_ATTR_KEYS)


def build_parse_gate(
    profile_id: str,
    *,
    attribute_keys: list[str] | frozenset[str] | None,
    feature_types: list[str] | frozenset[str] | None = None,
    root_type_counts: dict[str, int] | None = None,
    has_cds: bool | None = None,
) -> ParseGate:
    """
    keep_* = profile level map ∩ file attribute_keys (− omit)
    (or full level map when file keys empty/missing = unknown).

    effective_attr_keys = union of the three keep sets.
    """
    mod = _PROFILE_MODULES[profile_id]
    omit = mod.OMIT_ATTR_KEYS
    skip = profile_skip_types(profile_id)
    cds_keys = profile_cds_keys(profile_id)
    go_keys = profile_go_keys(profile_id)

    file_keys_unknown = not attribute_keys
    file_set: frozenset[str] | None
    if file_keys_unknown:
        file_set = None
    else:
        file_set = frozenset(attribute_keys)

    keep_gene = _intersect_keep(mod.KEEP_GENE, file_set=file_set, omit=omit)
    keep_transcript = _intersect_keep(
        mod.KEEP_TRANSCRIPT, file_set=file_set, omit=omit
    )
    keep_cds = _intersect_keep(mod.KEEP_CDS, file_set=file_set, omit=omit)
    # Structural keys must always be parseable when present on the line.
    if file_set is not None:
        structural = frozenset({"ID", "Parent"}) & file_set
    else:
        structural = frozenset({"ID", "Parent"})
    keep_gene = keep_gene | structural
    keep_transcript = keep_transcript | structural
    keep_cds = keep_cds | structural

    effective = keep_gene | keep_transcript | keep_cds

    roots_unknown = root_type_counts is None
    if roots_unknown:
        gene_roots: frozenset[str] = frozenset()
    else:
        # Casefold so report "Region" cannot become a gene root.
        gene_roots = frozenset(
            t.casefold()
            for t in root_type_counts
            if t.casefold() not in DNA_LANDMARKS
        )

    ft_raw = frozenset(feature_types) if feature_types else frozenset()
    ft = frozenset(t.casefold() for t in ft_raw)
    child_types_unknown = not ft
    if child_types_unknown:
        child_feature_types: frozenset[str] = frozenset()
    else:
        child_feature_types = frozenset(
            t for t in ft if t not in gene_roots and t not in DNA_LANDMARKS
        )

    want_cds = bool(cds_keys) and has_cds is not False and (
        file_keys_unknown or any(k in effective for k in cds_keys)
    )
    # GenBank GO lives on CDS — force CDS walk when GO keys are in play.
    if go_keys and (file_keys_unknown or any(k in effective for k in go_keys)):
        want_cds = True

    return ParseGate(
        effective_attr_keys=effective,
        keep_gene=keep_gene,
        keep_transcript=keep_transcript,
        keep_cds=keep_cds,
        gene_root_types=gene_roots,
        feature_types=ft,
        child_feature_types=child_feature_types,
        skip_types=skip,
        want_cds=want_cds,
        file_keys_unknown=file_keys_unknown,
        roots_unknown=roots_unknown,
        child_types_unknown=child_types_unknown,
    )
