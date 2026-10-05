"""Namespace policy for gene_corpus dry-run (Tier A/B, aliases, labels)."""

from gene_corpus.namespaces.aliases import (
    NOISE_DBXREF_DBS,
    canonicalize_db,
    is_noise_db,
)
from gene_corpus.namespaces.labels import (
    namespace_for_dbxref_db_local,
    namespace_for_ensembl_source_local,
    namespace_for_projected_from,
)
from gene_corpus.namespaces.tiers import (
    TIER_A,
    TIER_B,
    include_in_local,
    include_in_v1,
)

__all__ = [
    "TIER_A",
    "TIER_B",
    "NOISE_DBXREF_DBS",
    "canonicalize_db",
    "include_in_local",
    "include_in_v1",
    "is_noise_db",
    "namespace_for_dbxref_db_local",
    "namespace_for_ensembl_source_local",
    "namespace_for_projected_from",
]
