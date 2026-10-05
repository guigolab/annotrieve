"""
Harvest CLI: annotation report → per-GFF genes.sqlite shards.

    python -m gene_corpus.harvest \\
        --gff-mode local --files-root /data/files \\
        --work-dir /data/gene_corpus_build \\
        [--annotation-id ID ...]
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from gene_corpus.catalog import DEFAULT_API_BASE, AnnotationJob, load_report_rows
from gene_corpus.resolve import resolve_jobs
from gene_corpus.sql.per_gff import shard_sqlite_path, tier_a_counts_n
from gene_corpus.stream.harvest import harvest_annotation


def prepare_job(job: AnnotationJob) -> AnnotationJob:
    """Validate job is ready for harvest."""
    if job.gate is None:
        raise ValueError(f"job missing gate: {job.annotation_id}")
    if job.gff_mode == "local" and not job.resolved_path:
        raise ValueError(f"job missing resolved_path: {job.annotation_id}")
    if job.gff_mode == "url" and not job.resolved_url:
        raise ValueError(f"job missing resolved_url: {job.annotation_id}")
    return job


def _counts_from_shard(job: AnnotationJob, per_gff_root: str) -> tuple[int, str]:
    """Read Tier A pair count from an existing shard (skip path)."""
    shard = shard_sqlite_path(Path(per_gff_root), job.annotation_id)
    conn = sqlite3.connect(str(shard))
    try:
        n_pairs = tier_a_counts_n(conn)
    finally:
        conn.close()
    return n_pairs, job.annotation_id


def _harvest_one(job: AnnotationJob, per_gff_root: str) -> tuple[int, str]:
    """Worker entry: returns (n_pairs, annotation_id)."""
    n_pairs = harvest_annotation(job, per_gff_root=Path(per_gff_root))
    return n_pairs, job.annotation_id


def process_one(
    job: AnnotationJob,
    per_gff_root: str,
    *,
    force: bool = False,
) -> tuple[int, str, bool]:
    """
    Harvest or skip if ``genes.sqlite`` already exists (unless ``force``).

    ``force`` means do not skip; the previous shard is kept until harvest
    atomically replaces it on success.

    Returns ``(n_pairs, annotation_id, skipped_existing)``.
    """
    shard = shard_sqlite_path(Path(per_gff_root), job.annotation_id)
    if shard.is_file() and not force:
        n_pairs, ann_id = _counts_from_shard(job, per_gff_root)
        return n_pairs, ann_id, True
    n_pairs, ann_id = _harvest_one(job, per_gff_root)
    return n_pairs, ann_id, False


def _write_jobs_jsonl(path: Path, jobs: list[AnnotationJob]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for job in jobs:
            handle.write(json.dumps(job.to_dict(), ensure_ascii=False) + "\n")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Download/filter the annotation report and harvest per-GFF "
            "genes.sqlite shards (no global merge)."
        )
    )
    parser.add_argument(
        "--api-base",
        default=DEFAULT_API_BASE,
        help=f"Annotrieve API root (default: {DEFAULT_API_BASE})",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=None,
        help="local annotation report TSV (skip download)",
    )
    parser.add_argument(
        "--download-timeout",
        type=float,
        default=600.0,
        help="timeout seconds for report download",
    )
    parser.add_argument(
        "--gff-mode",
        choices=("local", "url"),
        default="local",
        help="local: files-root + bgzip_path (required to write shards)",
    )
    parser.add_argument(
        "--files-root",
        type=Path,
        default=None,
        help="host mount of annotations volume (required for --gff-mode local)",
    )
    parser.add_argument(
        "--annotation-id",
        action="append",
        default=None,
        metavar="ID",
        help="harvest only these annotation_ids (repeatable; default: all)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="process pool size (1 or 2; default: 1)",
    )
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=Path("tmp/gene_corpus_build"),
        help="output root (writes per_gff/ and jobs.jsonl)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="re-harvest even when genes.sqlite already exists",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.gff_mode == "local" and args.files_root is None:
        print("--files-root is required for --gff-mode local", file=sys.stderr)
        return 2
    if args.gff_mode != "local":
        print(
            "harvest requires --gff-mode local (shards need a local GFF path)",
            file=sys.stderr,
        )
        return 2
    if args.workers < 1 or args.workers > 2:
        print("--workers must be 1 or 2", file=sys.stderr)
        return 2

    annotation_ids = list(args.annotation_id) if args.annotation_id else None

    try:
        rows = load_report_rows(
            api_base=None if args.report else args.api_base,
            report=args.report,
            annotation_ids=annotation_ids,
            timeout=args.download_timeout,
        )
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"report rows (Ensembl/GenBank/RefSeq): {len(rows)}", file=sys.stderr)

    if annotation_ids:
        got = {r.annotation_id for r in rows}
        missing = set(annotation_ids) - got
        if missing:
            print(
                f"annotation-id not in report: {sorted(missing)}",
                file=sys.stderr,
            )
            return 1
        print(f"filtered to {len(rows)} annotation_id(s)", file=sys.stderr)

    selected = rows

    jobs, stats = resolve_jobs(
        selected,
        gff_mode=args.gff_mode,
        files_root=args.files_root,
    )
    print(
        f"resolve: ready={stats.ready} "
        f"skipped_missing={stats.skipped_missing} "
        f"skipped_no_url={stats.skipped_no_url} "
        f"skipped_no_profile={stats.skipped_no_profile}",
        file=sys.stderr,
    )

    if not jobs:
        print("no jobs ready", file=sys.stderr)
        return 1

    prepared = [prepare_job(job) for job in jobs]
    work_dir: Path = args.work_dir
    work_dir.mkdir(parents=True, exist_ok=True)
    per_gff_root = work_dir / "per_gff"
    per_gff_root.mkdir(parents=True, exist_ok=True)
    jobs_path = work_dir / "jobs.jsonl"
    _write_jobs_jsonl(jobs_path, prepared)

    by_db = Counter(j.database for j in prepared)
    total = len(prepared)
    print(f"jobs written: {total} → {jobs_path}", file=sys.stderr)
    print(f"per-db: {dict(by_db)}", file=sys.stderr)

    harvested = 0
    skipped_existing = 0
    errors = 0
    done = 0
    force = bool(args.force)
    progress_every = 50

    def _on_complete() -> None:
        nonlocal done
        done += 1
        if done % progress_every == 0 or done == total:
            print(
                f"harvest progress: {done}/{total} "
                f"(ok={harvested} skipped={skipped_existing} errors={errors})",
                file=sys.stderr,
                flush=True,
            )

    if args.workers == 1:
        for job in prepared:
            try:
                n_pairs, ann_id, skipped = process_one(
                    job, str(per_gff_root), force=force
                )
                if skipped:
                    skipped_existing += 1
                else:
                    harvested += 1
                if n_pairs == 0:
                    print(
                        f"harvest empty {ann_id}: 0 xref pairs",
                        file=sys.stderr,
                    )
            except Exception as exc:  # noqa: BLE001
                errors += 1
                print(
                    f"harvest fail {job.annotation_id}: {exc}",
                    file=sys.stderr,
                )
            _on_complete()
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(
                    process_one, job, str(per_gff_root), force=force
                ): job
                for job in prepared
            }
            for fut in as_completed(futures):
                job = futures[fut]
                try:
                    n_pairs, ann_id, skipped = fut.result()
                    if skipped:
                        skipped_existing += 1
                    else:
                        harvested += 1
                    if n_pairs == 0:
                        print(
                            f"harvest empty {ann_id}: 0 xref pairs",
                            file=sys.stderr,
                        )
                except Exception as exc:  # noqa: BLE001
                    errors += 1
                    print(
                        f"harvest fail {job.annotation_id}: {exc}",
                        file=sys.stderr,
                    )
                _on_complete()

    print(
        f"harvested: ok={harvested} skipped_existing={skipped_existing} "
        f"errors={errors} per_gff={per_gff_root}",
        file=sys.stderr,
    )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
