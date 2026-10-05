"""
gene_corpus — standalone dry-run gene discovery index layout.

Independent of server/ jobs and helpers. Encodes GENE_SEARCH_V1_NAMESPACES
decisions and per-source profiles.

    python -m gene_corpus.harvest   # report → per-GFF shards
    python -m gene_corpus.merge     # shards → global xref_hit + xref_meta
"""

from gene_corpus.namespaces import canonicalize_db, include_in_local, include_in_v1
from gene_corpus.profiles import PROFILES

__all__ = [
    "PROFILES",
    "canonicalize_db",
    "include_in_local",
    "include_in_v1",
]
