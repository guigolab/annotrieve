"""Merge per-GFF tier_a_counts into global xref_hit + xref_meta."""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from gene_corpus.sql.per_gff import shard_sqlite_path
from gene_corpus.sql.schema import create_indexes


def merge_shards_into_db(
    conn: sqlite3.Connection,
    per_gff_root: Path,
) -> tuple[int, int]:
    """
    Copy each shard's ``tier_a_counts`` into ``xref_hit`` via ATTACH + INSERT…SELECT.

    One shard attached at a time (no Python row batch / no stage table). Each
    shard is committed before DETACH so the attach lock is released. Rebuilds
    ``xref_meta`` from ``xref_hit`` with a single GROUP BY.

    Returns ``(n_xref_hit_rows, n_xref_meta_rows)``.
    """
    conn.execute("DELETE FROM xref_hit")
    conn.execute("DELETE FROM xref_meta")
    conn.commit()

    # Materialize first: ATTACH/INSERT cannot run while a SELECT cursor is
    # open on the same connection. Annotation dimension is small (key + id).
    ann_rows = conn.execute(
        "SELECT annotation_key, annotation_id FROM annotation "
        "ORDER BY annotation_key"
    ).fetchall()

    for annotation_key, annotation_id in ann_rows:
        shard = shard_sqlite_path(per_gff_root, str(annotation_id))
        if not shard.is_file():
            print(
                f"merge warn: missing shard for {annotation_id} "
                f"({shard})",
                file=sys.stderr,
            )
            continue

        # Absolute path: ATTACH is relative to the process cwd, not the DB.
        # Plain INSERT: global DB wiped above; each annotation_key appears once;
        # tier_a_counts PK already unique per (namespace, accession).
        # Commit before DETACH — SQLite holds an attach lock until commit.
        conn.execute("ATTACH DATABASE ? AS shard", (str(shard.resolve()),))
        try:
            try:
                conn.execute(
                    """
                    INSERT INTO xref_hit (
                        namespace, accession, annotation_key, gene_count
                    )
                    SELECT namespace, accession, ?, gene_count
                    FROM shard.tier_a_counts
                    """,
                    (int(annotation_key),),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        finally:
            conn.execute("DETACH DATABASE shard")

    conn.execute(
        """
        INSERT INTO xref_meta (namespace, accession, n_annotations)
        SELECT namespace, accession, COUNT(*)
        FROM xref_hit
        GROUP BY namespace, accession
        """
    )
    conn.commit()

    n_hit = int(conn.execute("SELECT COUNT(*) FROM xref_hit").fetchone()[0])
    n_meta = int(conn.execute("SELECT COUNT(*) FROM xref_meta").fetchone()[0])

    create_indexes(conn)
    return n_hit, n_meta
