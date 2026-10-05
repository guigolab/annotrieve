"""
Lean SQLite schema for gene_corpus dry-run (normalized xref_hit).

Independent of server.db.gene_search.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1

# Negative cache_size is KiB.
_DEFAULT_BUILD_CACHE_SIZE = -131072  # 128 MiB

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotation (
    annotation_key INTEGER PRIMARY KEY,
    annotation_id TEXT UNIQUE NOT NULL,
    taxid INTEGER NOT NULL,
    assembly_accession TEXT NOT NULL,
    organism_name TEXT,
    source_database TEXT NOT NULL,
    source_provider TEXT,
    profile_id TEXT NOT NULL,
    gff_path TEXT
);

CREATE TABLE IF NOT EXISTS xref_hit (
    namespace TEXT NOT NULL,
    accession TEXT NOT NULL,
    annotation_key INTEGER NOT NULL REFERENCES annotation(annotation_key),
    gene_count INTEGER NOT NULL,
    PRIMARY KEY (namespace, accession, annotation_key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS xref_meta (
    namespace TEXT NOT NULL,
    accession TEXT NOT NULL,
    n_annotations INTEGER NOT NULL,
    PRIMARY KEY (namespace, accession)
) WITHOUT ROWID;
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS annotation_taxid_idx
    ON annotation (taxid);
"""


def connect_for_build(path: str | Path) -> sqlite3.Connection:
    """Open SQLite for build (WAL, modest cache)."""
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(f"PRAGMA cache_size={_DEFAULT_BUILD_CACHE_SIZE}")
    conn.execute("PRAGMA temp_store=FILE")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_TABLES_SQL)
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        ("schema_version", str(SCHEMA_VERSION)),
    )
    conn.commit()


def create_indexes(conn: sqlite3.Connection) -> None:
    conn.executescript(_INDEXES_SQL)
    conn.execute("ANALYZE")
    conn.commit()


def seed_annotations(
    conn: sqlite3.Connection,
    rows: list[dict],
) -> None:
    """
    Insert annotation dimension rows.

    Each dict: annotation_key, annotation_id, taxid, assembly_accession,
    organism_name, source_database, source_provider, profile_id, gff_path.
    """
    conn.executemany(
        """
        INSERT OR REPLACE INTO annotation (
            annotation_key, annotation_id, taxid, assembly_accession,
            organism_name, source_database, source_provider, profile_id, gff_path
        ) VALUES (
            :annotation_key, :annotation_id, :taxid, :assembly_accession,
            :organism_name, :source_database, :source_provider, :profile_id, :gff_path
        )
        """,
        rows,
    )
    conn.commit()
