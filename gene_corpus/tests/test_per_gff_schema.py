"""Per-annotation SQLite schema (gene / gene_xref / tier_a_counts)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from gene_corpus.namespaces.tiers import TIER_A
from gene_corpus.sql.per_gff import (
    build_tier_a_counts,
    connect_per_gff,
    create_indexes,
    init_schema,
    insert_genes,
    insert_xrefs,
    meta_complete,
    read_shard_meta,
    shard_dir,
    write_shard_meta,
)


def test_init_schema_creates_tables() -> None:
    conn = connect_per_gff(":memory:")
    init_schema(conn)
    names = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }
    assert names == {"gene", "gene_xref", "tier_a_counts", "meta"}
    conn.close()


def test_shard_meta_roundtrip() -> None:
    conn = connect_per_gff(":memory:")
    init_schema(conn)
    meta = {
        "annotation_id": "ann1",
        "taxid": "9606",
        "assembly_accession": "GCA_1",
        "organism_name": "Homo sapiens",
        "source_database": "GenBank",
        "source_provider": "",
        "profile_id": "genbank",
        "gff_path": "/tmp/x.gff",
    }
    write_shard_meta(conn, meta)
    conn.commit()
    loaded = read_shard_meta(conn)
    assert loaded == meta
    assert meta_complete(loaded)
    conn.close()


def test_unique_locus_and_xref() -> None:
    conn = connect_per_gff(":memory:")
    init_schema(conn)
    conn.execute(
        """
        INSERT INTO gene (
            local_id, source_gene_id, feature_type, seqid, start, end, strand
        ) VALUES (0, 'g1', 'gene', 'chr1', 1, 100, 1)
        """
    )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """
            INSERT INTO gene (
                local_id, source_gene_id, feature_type, seqid, start, end, strand
            ) VALUES (1, 'g1', 'gene', 'chr1', 1, 100, 1)
            """
        )
    conn.execute(
        """
        INSERT INTO gene_xref (
            local_id, namespace, accession, display, origin, via_level
        ) VALUES (0, 'symbol', 'tp53', NULL, 'attr', 0)
        """
    )
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """
            INSERT INTO gene_xref (
                local_id, namespace, accession, display, origin, via_level
            ) VALUES (0, 'symbol', 'tp53', NULL, 'attr', 0)
            """
        )
    # Same source_gene_id at different coords is allowed.
    conn.execute(
        """
        INSERT INTO gene (
            local_id, source_gene_id, feature_type, seqid, start, end, strand
        ) VALUES (1, 'g1', 'gene', 'chr1', 200, 300, 1)
        """
    )
    conn.close()


def test_create_indexes_registers_four_names() -> None:
    conn = connect_per_gff(":memory:")
    init_schema(conn)
    create_indexes(conn)
    idx = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
        )
    }
    assert {
        "gene_by_source_id",
        "gene_by_coord",
        "xref_resolve",
        "xref_by_gene",
    } <= idx
    conn.close()


def test_package_exports() -> None:
    from gene_corpus.sql import (
        connect_per_gff as c,
        create_per_gff_indexes,
        init_per_gff_schema,
    )

    conn = c(":memory:")
    init_per_gff_schema(conn)
    create_per_gff_indexes(conn)
    conn.close()


def test_insert_and_build_tier_a_counts() -> None:
    conn = connect_per_gff(":memory:")
    init_schema(conn)
    insert_genes(
        conn,
        [
            (0, "g1", "gene", "chr1", 1, 100, 1, None, "foo", None, None, 0),
            (1, "g2", "gene", "chr1", 200, 300, 1, None, "bar", None, None, 0),
        ],
    )
    insert_xrefs(
        conn,
        [
            (0, "go", "GO:0008150", None, "attr", 2),
            (0, "ncbi_gp", "ABC.1", None, "attr", 2),
            (1, "go", "GO:0008150", None, "attr", 2),
        ],
    )
    conn.commit()
    n = build_tier_a_counts(conn, TIER_A)
    assert n == 1
    row = conn.execute(
        "SELECT gene_count FROM tier_a_counts "
        "WHERE namespace='go' AND accession='GO:0008150'"
    ).fetchone()
    assert row[0] == 2
    # Tier B never lands in tier_a_counts.
    assert (
        conn.execute(
            "SELECT COUNT(*) FROM tier_a_counts WHERE namespace='ncbi_gp'"
        ).fetchone()[0]
        == 0
    )
    conn.close()


def test_shard_dir_sanitizes() -> None:
    assert shard_dir(Path("/tmp"), "abc/def").name == "abc_def"
