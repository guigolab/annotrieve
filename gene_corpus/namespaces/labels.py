"""
Declared Dbxref / Ensembl Source label → namespace.

Unmapped and noise labels resolve to None (skip). Local emit uses
``include_in_local``; projected-from uses ``include_in_v1``.
"""
from __future__ import annotations

from gene_corpus.namespaces.aliases import canonicalize_db, is_noise_db
from gene_corpus.namespaces.tiers import TIER_A, TIER_B, include_in_local, include_in_v1

# Exact (lowercased) Ensembl description Source labels → namespace (doc §6.1).
ENSEMBL_SOURCE_LABEL_MAP: dict[str, str] = {
    "hgnc symbol": "hgnc",
    "mgi symbol": "mgi",
    "rgd symbol": "rgd",
    "vgnc symbol": "vgnc",
    "ncbi gene": "geneid",
    "ncbi gene (formerly entrezgene)": "geneid",
    "entrezgene": "geneid",
    "rfam": "rfam",
    "zfin": "zfin",
    "xenbase": "xenbase",
    "sgd": "sgd",
    "tair": "tair",
    "mirbase": "mirbase",
    "uniprotkb/swiss-prot": "uniprot/swiss-prot",
    "uniprotkb/trembl": "uniprot/trembl",
    "uniprotkb gene name": "uniprotkb",
    # Tool / accession families → skip (map to Tier B marker namespaces)
    "insdc protein id": "insdc_protein",
    "refseq mrna": "refseq_mrna",
    "european nucleotide archive": "genbank",
    # Map to skip sentinel ``product`` (not a Tier A/B namespace; never xref).
    "trnascan_se": "product",
    "trnascan-se": "product",
    "rnammer": "product",
    "pgsc_gene": "product",
    "pgd": "product",
    "lncc": "product",
    "gfbgp": "product",
}

# Longest-first keys for prefix fallback in emit_ensembl_description.
_SOURCE_KEYS_BY_LEN: tuple[str, ...] = tuple(
    sorted(ENSEMBL_SOURCE_LABEL_MAP, key=len, reverse=True)
)

# Projected-from DB suffix (contains / endswith match, lowercased) → namespace.
# Stored longest-first so callers need not re-sort.
PROJECTED_FROM_SUFFIX_MAP: tuple[tuple[str, str], ...] = tuple(
    sorted(
        (
            ("uniprotkb/swiss-prot", "uniprot/swiss-prot"),
            ("uniprotkb/trembl", "uniprot/trembl"),
            ("uniprotkb gene name", "uniprotkb"),
            ("vb community annotation", "vectorbase"),
            ("tair", "tair"),
            ("flybase", "flybase"),
        ),
        key=lambda x: -len(x[0]),
    )
)

# Common Dbxref raw labels (after lower) that should resolve even before
# canonicalize_db aliases — mirrors audit labels → Tier A namespaces.
DBXREF_LABEL_MAP: dict[str, str] = {
    "geneid": "geneid",
    "interpro": "interpro",
    "pfam": "pfam",
    "go": "go",
    "goa": "goa",
    "rfam": "rfam",
    "cdd": "cdd",
    "tigrfam": "tigrfam",
    "ncbiortholog": "ncbiortholog",
    "jgidb": "jgidb",
    "phytozome": "phytozome",
    "mirbase": "mirbase",
    "hgnc": "hgnc",
    "mgi": "mgi",
    "rgd": "rgd",
    "zfin": "zfin",
    "vgnc": "vgnc",
    "flybase": "flybase",
    "wormbase": "wormbase",
    "sgd": "sgd",
    "tair": "tair",
    "xenbase": "xenbase",
    "dictybase": "dictybase",
    "vectorbase": "vectorbase",
    "pombase": "pombase",
    "rap-db": "rap-db",
    "araport": "araport",
    "beebase": "beebase",
    "beetlebase": "beetlebase",
    "bgd": "bgd",
    "aphidbase": "aphidbase",
    "cgd": "cgd",
    "genedb": "genedb",
    "mim": "mim",
    "marpolbase": "marpolbase",
    "apidb_toxodb": "apidb_toxodb",
    "apidb_cryptodb": "apidb_cryptodb",
    "apidb_plasmodb": "apidb_plasmodb",
    "imgt/gene-db": "imgt/gene-db",
    "ensembl": "ensembl",
    "ensemblgenomes": "ensemblgenomes",
    "ensemblgenomes-gn": "ensemblgenomes",
    "uniprotkb/swiss-prot": "uniprot/swiss-prot",
    "uniprot/swiss-prot": "uniprot/swiss-prot",
    "uniprotkb/trembl": "uniprot/trembl",
    "cgnc": "cgnc",
    "fungidb": "fungidb",
    "i5knal": "i5knal",
    "nasoniabase": "nasoniabase",
    "cog": "cog",
    # Tier B sentinels (resolve then filtered by include_in_v1)
    "ensemblgenomes-tr": "ensemblgenomes-tr",
    "ncbi_gp": "ncbi_gp",
    "genbank": "genbank",
    "ccds": "ccds",
    "vista": "vista",
    "pseudo": "pseudo",
    "dbsnp": "dbsnp",
    "pdb": "pdb",
    "pir": "pir",
    "hssp": "hssp",
    "hmp": "hmp",
    "pathema": "pathema",
}


def _resolve_dbxref_namespace(raw_db: str) -> str | None:
    """Map Dbxref DB → Tier A/B namespace, or None (noise / unknown / prose sentinel)."""
    if is_noise_db(raw_db):
        return None
    canon = canonicalize_db(raw_db)
    ns = (
        DBXREF_LABEL_MAP.get(raw_db.strip().lower())
        or DBXREF_LABEL_MAP.get(canon)
        or canon
    )
    # Skip sentinels and unknown labels (product/gff_id are never xrefs).
    if ns in ("product", "gff_id"):
        return None
    if ns in TIER_A or ns in TIER_B:
        return ns
    return None


def namespace_for_dbxref_db_local(raw_db: str) -> str | None:
    """Map Dbxref DB → Tier A or deferred Tier B namespace for per-GFF gene_xref."""
    ns = _resolve_dbxref_namespace(raw_db)
    return ns if ns and include_in_local(ns) else None


def _resolve_ensembl_source_namespace(source_label: str) -> str | None:
    """Map Ensembl Source label → A/B namespace; skip-sentinel ``product`` → None."""
    key = source_label.strip().lower()
    ns = ENSEMBL_SOURCE_LABEL_MAP.get(key)
    if ns is None or ns == "product":
        return None
    return ns


def namespace_for_ensembl_source_local(source_label: str) -> str | None:
    """Map Ensembl Source label → Tier A or deferred Tier B for local emit."""
    ns = _resolve_ensembl_source_namespace(source_label)
    return ns if ns and include_in_local(ns) else None


def namespace_for_projected_from(source_label: str) -> str | None:
    """
    Map Projected-from Source via DB suffix / contains (doc §6.2).

    No-DB-suffix labels return None here.
    """
    key = source_label.strip().lower()
    for suffix, ns in PROJECTED_FROM_SUFFIX_MAP:
        if key.endswith(suffix) or f" {suffix}" in key or key == suffix:
            return ns if include_in_v1(ns) else None
    return None
