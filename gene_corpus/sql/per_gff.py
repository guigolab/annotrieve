"""
Per-annotation SQLite schema (write-once shard).

Tables: gene, gene_xref, tier_a_counts, meta.
Shards are replaced wholesale on rebuild / schema change.

See GENE_CORPUS_SQL_ARCHITECTURE.md §6.
"""
from __future__ import annotations

import os
import sqlite3
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path

# Negative cache_size is KiB.
_DEFAULT_CACHE_SIZE = -65536  # 64 MiB

# Keys written by harvest; required by merge to seed global annotation.
SHARD_META_KEYS: tuple[str, ...] = (
    "annotation_id",
    "taxid",
    "assembly_accession",
    "organism_name",
    "source_database",
    "source_provider",
    "profile_id",
    "gff_path",
)

_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS gene (
    local_id INTEGER PRIMARY KEY,
    source_gene_id TEXT NOT NULL,
    feature_type TEXT NOT NULL,
    seqid TEXT NOT NULL,
    start INTEGER NOT NULL,
    end INTEGER NOT NULL,
    strand INTEGER NOT NULL,
    biotype TEXT,
    primary_name TEXT,
    prose TEXT,
    prose_kind TEXT,
    parse_flags INTEGER NOT NULL DEFAULT 0,
    UNIQUE (source_gene_id, seqid, start, end, strand)
);

CREATE TABLE IF NOT EXISTS gene_xref (
    local_id INTEGER NOT NULL REFERENCES gene(local_id),
    namespace TEXT NOT NULL,
    accession TEXT NOT NULL,
    display TEXT,
    origin TEXT NOT NULL,
    via_level INTEGER NOT NULL,
    UNIQUE (local_id, namespace, accession)
);

CREATE TABLE IF NOT EXISTS tier_a_counts (
    namespace TEXT NOT NULL,
    accession TEXT NOT NULL,
    gene_count INTEGER NOT NULL,
    PRIMARY KEY (namespace, accession)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

_INDEXES_SQL = """
CREATE INDEX IF NOT EXISTS gene_by_source_id ON gene(source_gene_id);
CREATE INDEX IF NOT EXISTS gene_by_coord ON gene(seqid, start, local_id);
CREATE INDEX IF NOT EXISTS xref_resolve ON gene_xref(namespace, accession, local_id);
CREATE INDEX IF NOT EXISTS xref_by_gene ON gene_xref(local_id, namespace);
"""

# Gene row: local_id, source_gene_id, feature_type, seqid, start, end, strand,
# biotype, primary_name, prose, prose_kind, parse_flags
GeneRow = tuple[
    int, str, str, str, int, int, int, str | None, str | None, str | None, str | None, int
]
# Xref row: local_id, namespace, accession, display, origin, via_level
XrefRow = tuple[int, str, str, str | None, str, int]


def sanitize_annotation_id(annotation_id: str) -> str:
    """Replace path-unsafe characters; IDs today are hex-like."""
    return annotation_id.replace("/", "_").replace("\0", "").replace("\\", "_")


def shard_dir(per_gff_root: Path, annotation_id: str) -> Path:
    return per_gff_root / sanitize_annotation_id(annotation_id)


def shard_sqlite_path(per_gff_root: Path, annotation_id: str) -> Path:
    return shard_dir(per_gff_root, annotation_id) / "genes.sqlite"


def shard_tmp_path(per_gff_root: Path, annotation_id: str) -> Path:
    return shard_dir(per_gff_root, annotation_id) / "genes.sqlite.tmp"


def connect_per_gff(path: str | Path) -> sqlite3.Connection:
    """
    Open a per-annotation SQLite DB for write-once build.

    Uses DELETE journal (not WAL) so a finished shard is a single file.
    ``path`` may be ``\":memory:\"`` for tests.
    """
    conn = sqlite3.connect(str(path))
    conn.execute("PRAGMA journal_mode=DELETE")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(f"PRAGMA cache_size={_DEFAULT_CACHE_SIZE}")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Create gene / gene_xref / tier_a_counts / meta if missing."""
    conn.executescript(_TABLES_SQL)
    conn.commit()


def create_indexes(conn: sqlite3.Connection) -> None:
    """Create resolve/browse indexes after bulk load; run ANALYZE."""
    conn.executescript(_INDEXES_SQL)
    conn.execute("ANALYZE")
    conn.commit()


def write_shard_meta(conn: sqlite3.Connection, mapping: Mapping[str, str]) -> None:
    """Replace shard meta key/value rows. Caller commits unless finalize does."""
    conn.execute("DELETE FROM meta")
    conn.executemany(
        "INSERT INTO meta (key, value) VALUES (?, ?)",
        [(str(k), str(v)) for k, v in mapping.items()],
    )


def read_shard_meta(conn: sqlite3.Connection) -> dict[str, str]:
    """Load all meta rows as a dict."""
    return {
        str(k): str(v)
        for k, v in conn.execute("SELECT key, value FROM meta")
    }


def meta_complete(meta: Mapping[str, str]) -> bool:
    """True when all SHARD_META_KEYS are present (values may be empty)."""
    return all(k in meta for k in SHARD_META_KEYS)


def insert_genes(conn: sqlite3.Connection, rows: Sequence[GeneRow]) -> None:
    """Batched insert into ``gene``. Caller commits."""
    if not rows:
        return
    conn.executemany(
        """
        INSERT INTO gene (
            local_id, source_gene_id, feature_type, seqid, start, end, strand,
            biotype, primary_name, prose, prose_kind, parse_flags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def insert_xrefs(conn: sqlite3.Connection, rows: Sequence[XrefRow]) -> None:
    """Batched insert into ``gene_xref``. Caller commits."""
    if not rows:
        return
    conn.executemany(
        """
        INSERT INTO gene_xref (
            local_id, namespace, accession, display, origin, via_level
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def build_tier_a_counts(
    conn: sqlite3.Connection,
    tier_a_namespaces: frozenset[str] | Iterable[str],
) -> int:
    """
    Derive ``tier_a_counts`` from ``gene_xref`` via SQL GROUP BY.

    Replaces any prior rows. Returns number of count rows written.
    """
    ns_list = sorted(tier_a_namespaces)
    if not ns_list:
        conn.execute("DELETE FROM tier_a_counts")
        conn.commit()
        return 0
    placeholders = ", ".join("?" for _ in ns_list)
    conn.execute("DELETE FROM tier_a_counts")
    conn.execute(
        f"""
        INSERT INTO tier_a_counts (namespace, accession, gene_count)
        SELECT namespace, accession, COUNT(DISTINCT local_id)
        FROM gene_xref
        WHERE namespace IN ({placeholders})
        GROUP BY namespace, accession
        """,
        ns_list,
    )
    conn.commit()
    row = conn.execute("SELECT COUNT(*) FROM tier_a_counts").fetchone()
    return int(row[0]) if row else 0


def tier_a_counts_n(conn: sqlite3.Connection) -> int:
    """Return ``COUNT(*)`` from ``tier_a_counts`` (no row materialization)."""
    row = conn.execute("SELECT COUNT(*) FROM tier_a_counts").fetchone()
    return int(row[0]) if row else 0


def finalize_shard(
    conn: sqlite3.Connection,
    *,
    tmp_path: Path,
    final_path: Path,
    tier_a_namespaces: frozenset[str] | Iterable[str],
    meta: Mapping[str, str] | None = None,
) -> int:
    """
    EOF: aggregate Tier A → write meta → indexes → close → atomic replace.

    Returns number of ``tier_a_counts`` rows written into the finished shard.
    """
    build_tier_a_counts(conn, tier_a_namespaces)
    if meta is not None:
        write_shard_meta(conn, meta)
        conn.commit()
    n_pairs = tier_a_counts_n(conn)
    create_indexes(conn)
    conn.close()
    final_path.parent.mkdir(parents=True, exist_ok=True)
    os.replace(tmp_path, final_path)
    return n_pairs


def discover_shard_paths(per_gff_root: Path) -> list[Path]:
    """Return ``per_gff/*/genes.sqlite`` paths sorted by directory name."""
    if not per_gff_root.is_dir():
        return []
    return sorted(per_gff_root.glob("*/genes.sqlite"))
