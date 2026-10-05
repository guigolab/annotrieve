"""
Dbxref / Source DB label canonicalization for gene_corpus.

Independent of server.helpers.gene_attributes — decisions restated here.
"""
from __future__ import annotations

# Lowercased raw DB → canonical namespace string.
DB_ALIAS_CANONICAL_MAP: dict[str, str] = {
    # GeneID family
    "geneid": "geneid",
    "ncbigene": "geneid",
    "ncbi_gene": "geneid",
    "ncbi-gene": "geneid",
    "entrezgene": "geneid",
    "entrez": "geneid",
    "gene_id": "geneid",
    "ncbi gene": "geneid",
    "ncbi gene (formerly entrezgene)": "geneid",
    # GenBank spelling
    "genbank": "genbank",
    # Ensembl / Ensembl Genomes — Gn only folds into ensemblgenomes
    "ensembl": "ensembl",
    "ensembl_gene": "ensembl",
    "ensemblgene": "ensembl",
    "ensemblgenomes": "ensemblgenomes",
    "ensemblgenomes-gn": "ensemblgenomes",
    # ensemblgenomes-tr intentionally NOT aliased — Tier B transcript path
    "ensemblgenomes-tr": "ensemblgenomes-tr",
    # UniProt
    "uniprotkb/swiss-prot": "uniprot/swiss-prot",
    "uniprot/swiss-prot": "uniprot/swiss-prot",
    "swiss-prot": "uniprot/swiss-prot",
    "uniprotkb/trembl": "uniprot/trembl",
    "uniprot/trembl": "uniprot/trembl",
    "trembl": "uniprot/trembl",
    "uniprotkb": "uniprotkb",
    # Common spelling / case folds already lowercased at lookup
    "mirbase": "mirbase",
    "phytozme": "phytozome",
    "phytozome": "phytozome",
    "ncbi_gp": "ncbi_gp",
    "ncbiortholog": "ncbiortholog",
    "rap-db": "rap-db",
    "imgt/gene-db": "imgt/gene-db",
    "apidb_toxodb": "apidb_toxodb",
    "apidb_cryptodb": "apidb_cryptodb",
    "apidb_plasmodb": "apidb_plasmodb",
}

# Specimen / taxonomy noise — skip after canonicalize (doc §5 / Tier C).
NOISE_DBXREF_DBS: frozenset[str] = frozenset(
    {
        "taxon",
        "taxonomy",
        "atcc",
        "dsmz",
        "jcm",
        "nbrc",
        "ccug",
        "cip",
        "nctc",
    }
)


def canonicalize_db(db: str) -> str:
    """Lowercase + alias map; unknown labels pass through lowercased."""
    lower = db.strip().lower()
    return DB_ALIAS_CANONICAL_MAP.get(lower, lower)


def is_noise_db(db: str) -> bool:
    """True if *db* (raw or canonical) is Tier C noise."""
    return canonicalize_db(db) in NOISE_DBXREF_DBS
