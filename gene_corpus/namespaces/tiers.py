"""
Tier A / B namespace sets for gene_corpus dry-run v1.

Restates decisions from GENE_SEARCH_V1_NAMESPACES.md (gene discovery focus).
Independent of server.helpers.gene_search — do not import from server.
Specimen / taxonomy noise is filtered via ``NOISE_DBXREF_DBS`` / ``is_noise_db``.
"""
from __future__ import annotations

# Gene-discovery namespaces stored in global SQL (doc §3 + §8 adds).
TIER_A: frozenset[str] = frozenset(
    {
        # §3.1 identity (ensembl_gene folded into ensembl for dry-run)
        "symbol",
        "alias",
        "geneid",
        # §3.2 cross-db / family
        "interpro",
        "pfam",
        "go",
        "goa",
        "rfam",
        "cdd",
        "tigrfam",
        "ncbiortholog",
        "jgidb",
        "phytozome",
        "mirbase",
        # §3.3 model / community
        "hgnc",
        "mgi",
        "rgd",
        "zfin",
        "vgnc",
        "flybase",
        "wormbase",
        "sgd",
        "tair",
        "xenbase",
        "dictybase",
        "vectorbase",
        "pombase",
        "rap-db",
        "araport",
        "beebase",
        "beetlebase",
        "bgd",
        "aphidbase",
        "cgd",
        "genedb",
        "mim",
        "marpolbase",
        "apidb_toxodb",
        "apidb_cryptodb",
        "apidb_plasmodb",
        "imgt/gene-db",
        "ensembl",
        "ensemblgenomes",
        # §3.4 UniProt
        "uniprot/swiss-prot",
        "uniprot/trembl",
        "uniprotkb",
        # §3.5 eggNOG / COG
        "eggnog",
        "cog",
        # §8 registry gaps treated as Tier A for dry-run emit
        "cgnc",
        "fungidb",
        "i5knal",
        "nasoniabase",
    }
)

# Deferred from global SQL (doc §4) — isoforms, proteins, file-local, niche.
TIER_B: frozenset[str] = frozenset(
    {
        "locus_tag",
        "ncbi_gp",
        "refseq_protein",
        "protein_id",
        "ensembl_protein",
        "genbank",
        "ensembl_transcript",
        "ensemblgenomes-tr",  # keep distinct from ensemblgenomes (Gn)
        "refseq_transcript",
        "submitter_transcript",
        "submitter_protein",
        "gff_id",
        "ccds",
        "vista",
        "pseudo",
        "dbsnp",
        "pdb",
        "pir",
        "hssp",
        "hmp",
        "insdc_protein",
        "refseq_mrna",
        "pathema",  # §8 defer / accept-if-seen later
    }
)

# Label-map / legacy sentinels — never emitted as gene_xref (not Tier A/B).
_NEVER_XREF: frozenset[str] = frozenset({"product", "gff_id"})


def include_in_v1(namespace: str) -> bool:
    """True when *namespace* belongs in the lean global SQL dry-run index."""
    return namespace in TIER_A


def include_in_local(namespace: str) -> bool:
    """
    True when *namespace* belongs in a per-GFF ``gene_xref`` row.

    Tier A ∪ Tier B, minus sentinels in ``_NEVER_XREF`` (``product`` is not
    harvested as prose or xref; ``gff_id`` is the gene-row file address only).
    """
    if namespace in _NEVER_XREF:
        return False
    return namespace in TIER_A or namespace in TIER_B
