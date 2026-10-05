"""
Merge CLI: scan per_gff shards → global gene_corpus.sqlite.

    python -m gene_corpus.merge --work-dir /data/gene_corpus_build
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

from gene_corpus.sql.merge import merge_shards_into_db
from gene_corpus.sql.per_gff import (
    discover_shard_paths,
    meta_complete,
    read_shard_meta,
)
from gene_corpus.sql.schema import connect_for_build, init_schema, seed_annotations


def _seed_rows_from_shards(per_gff_root: Path) -> list[dict]:
    """
    Discover shards, read meta, assign dense annotation_key by sorted id.

    Skips shards with incomplete meta (warns on stderr).
    """
    paths = discover_shard_paths(per_gff_root)
    by_id: dict[str, dict] = {}
    for shard in paths:
        conn = sqlite3.connect(f"file:{shard.resolve()}?mode=ro", uri=True)
        try:
            meta = read_shard_meta(conn)
        finally:
            conn.close()
        if not meta_complete(meta):
            print(
                f"merge warn: incomplete meta in {shard}",
                file=sys.stderr,
            )
            continue
        ann_id = meta["annotation_id"]
        if not ann_id:
            print(
                f"merge warn: empty annotation_id in {shard}",
                file=sys.stderr,
            )
            continue
        by_id[ann_id] = {
            "annotation_id": ann_id,
            "taxid": int(meta["taxid"]),
            "assembly_accession": meta["assembly_accession"],
            "organism_name": meta["organism_name"] or None,
            "source_database": meta["source_database"],
            "source_provider": meta["source_provider"] or None,
            "profile_id": meta["profile_id"],
            "gff_path": meta["gff_path"] or None,
        }

    rows: list[dict] = []
    for i, ann_id in enumerate(sorted(by_id), start=1):
        row = dict(by_id[ann_id])
        row["annotation_key"] = i
        rows.append(row)
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Merge per_gff/*/genes.sqlite into global gene_corpus.sqlite "
            "(xref_hit + xref_meta). Annotation keys assigned at merge time."
        )
    )
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=Path("tmp/gene_corpus_build"),
        help="directory containing per_gff/ (writes gene_corpus.sqlite)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    work_dir: Path = args.work_dir
    per_gff_root = work_dir / "per_gff"
    db_path = work_dir / "gene_corpus.sqlite"

    if not per_gff_root.is_dir():
        print(f"per_gff directory missing: {per_gff_root}", file=sys.stderr)
        return 1

    seed_rows = _seed_rows_from_shards(per_gff_root)
    if not seed_rows:
        print("no shards with complete meta to merge", file=sys.stderr)
        return 1

    for path in (
        db_path,
        Path(str(db_path) + "-wal"),
        Path(str(db_path) + "-shm"),
    ):
        if path.exists():
            path.unlink()

    conn = connect_for_build(db_path)
    init_schema(conn)
    seed_annotations(conn, seed_rows)
    print(
        f"seeded {len(seed_rows)} annotations from shards → {db_path}",
        file=sys.stderr,
    )

    n_hit, n_meta = merge_shards_into_db(conn, per_gff_root)
    conn.close()
    print(
        f"merged xref_hit={n_hit} xref_meta={n_meta} → {db_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
