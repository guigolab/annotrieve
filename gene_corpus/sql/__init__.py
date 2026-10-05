"""SQLite build helpers for gene_corpus."""

from gene_corpus.sql.merge import merge_shards_into_db
from gene_corpus.sql.per_gff import (
    build_tier_a_counts,
    connect_per_gff,
    create_indexes as create_per_gff_indexes,
    discover_shard_paths,
    finalize_shard,
    init_schema as init_per_gff_schema,
    insert_genes,
    insert_xrefs,
    meta_complete,
    read_shard_meta,
    shard_dir,
    shard_sqlite_path,
    shard_tmp_path,
    tier_a_counts_n,
    write_shard_meta,
)
from gene_corpus.sql.schema import (
    SCHEMA_VERSION,
    connect_for_build,
    create_indexes,
    init_schema,
    seed_annotations,
)

__all__ = [
    "SCHEMA_VERSION",
    "build_tier_a_counts",
    "connect_for_build",
    "connect_per_gff",
    "create_indexes",
    "create_per_gff_indexes",
    "discover_shard_paths",
    "finalize_shard",
    "init_per_gff_schema",
    "init_schema",
    "insert_genes",
    "insert_xrefs",
    "merge_shards_into_db",
    "meta_complete",
    "read_shard_meta",
    "seed_annotations",
    "shard_dir",
    "shard_sqlite_path",
    "shard_tmp_path",
    "tier_a_counts_n",
    "write_shard_meta",
]
