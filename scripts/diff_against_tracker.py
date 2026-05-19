#!/usr/bin/env python3
"""
List Annotrieve annotations that are not present in the genome-annotation-tracker TSVs.

Matches by source URL (primary) or uncompressed MD5 (fallback).

Environment:
  ANNOTRIEVE_API_BASE — default https://genome.crg.es/annotrieve/api/v0
  TRACKER_DATA_DIR — local TSV directory when using --local
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import requests

API_BASE = os.environ.get(
    "ANNOTRIEVE_API_BASE", "https://genome.crg.es/annotrieve/api/v0"
).rstrip("/")
PAGE_SIZE = 1000
REQUEST_TIMEOUT = 45

GH_TRACKER_BASE = (
    "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data"
)
TSV_NAMES = (
    "ensembl_annotations.tsv",
    "genbank_annotations.tsv",
    "refseq_annotations.tsv",
)
DEFAULT_OUTPUT = Path(__file__).resolve().parent.parent / "annotrieve_missing_from_tracker.tsv"
DEFAULT_LOCAL_TRACKER = (
    Path(__file__).resolve().parent.parent.parent / "genome-annotation-tracker" / "data"
)


def fetch_annotations_page(offset: int) -> dict:
    url = f"{API_BASE}/annotations"
    last_exc: Exception | None = None
    for attempt in range(8):
        try:
            r = requests.get(
                url,
                params={"limit": PAGE_SIZE, "offset": offset},
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "annotrieve-diff-tracker/1.0"},
            )
            if r.status_code >= 500 and attempt < 7:
                time.sleep(min(2**attempt, 60))
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            last_exc = e
            if attempt < 7:
                time.sleep(min(2**attempt, 60))
                continue
            raise
    assert last_exc is not None
    raise last_exc


def fetch_all_annotrieve_annotations() -> list[dict]:
    offset = 0
    total: int | None = None
    rows: list[dict] = []
    while True:
        payload = fetch_annotations_page(offset)
        total = int(payload["total"])
        results = payload["results"]
        rows.extend(results)
        offset += len(results)
        print(f"Fetched {offset}/{total} Annotrieve annotations...", flush=True)
        if not results or offset >= total:
            break
    return rows


def load_tracker_tsv(path: Path) -> list[dict]:
    if not path.is_file():
        raise FileNotFoundError(path)
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f, delimiter="\t"))


def load_all_tracker_rows(local_dir: Path | None) -> tuple[list[dict], int]:
    rows: list[dict] = []
    for name in TSV_NAMES:
        if local_dir:
            path = local_dir / name
        else:
            url = f"{GH_TRACKER_BASE}/{name}"
            r = requests.get(url, timeout=120, headers={"User-Agent": "annotrieve-diff-tracker/1.0"})
            r.raise_for_status()
            lines = r.text.splitlines()
            reader = csv.DictReader(lines, delimiter="\t")
            file_rows = list(reader)
            rows.extend(file_rows)
            print(f"Loaded {len(file_rows)} rows from {name} (remote)", flush=True)
            continue
        file_rows = load_tracker_tsv(path)
        rows.extend(file_rows)
        print(f"Loaded {len(file_rows)} rows from {path}", flush=True)
    return rows, len(rows)


def source_url_from_api(rec: dict) -> str | None:
    sfi = rec.get("source_file_info") or {}
    if isinstance(sfi, dict):
        url = sfi.get("url_path")
        if url:
            return str(url).strip()
    return None


def md5_from_api(rec: dict) -> str | None:
    sfi = rec.get("source_file_info") or {}
    if isinstance(sfi, dict):
        md5 = sfi.get("uncompressed_md5")
        if md5:
            return str(md5).strip().lower()
    return None


def db_from_api(rec: dict) -> str:
    sfi = rec.get("source_file_info") or {}
    if isinstance(sfi, dict) and sfi.get("database"):
        return str(sfi["database"])
    return ""


def build_tracker_index(tracker_rows: list[dict]) -> tuple[set[str], set[str]]:
    urls: set[str] = set()
    md5s: set[str] = set()
    for row in tracker_rows:
        url = (row.get("access_url") or "").strip()
        if url:
            urls.add(url)
        md5 = (row.get("md5_checksum") or "").strip().lower()
        if md5:
            md5s.add(md5)
    return urls, md5s


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Find Annotrieve annotations missing from tracker TSVs"
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Read TSVs from local genome-annotation-tracker/data/",
    )
    parser.add_argument(
        "--tracker-dir",
        type=Path,
        default=DEFAULT_LOCAL_TRACKER,
        help="Local tracker data directory (with --local)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output TSV path",
    )
    args = parser.parse_args()

    local_dir = args.tracker_dir if args.local else None
    if args.local and not local_dir.is_dir():
        print(f"Tracker data directory not found: {local_dir}", file=sys.stderr)
        return 1

    tracker_rows, tracker_count = load_all_tracker_rows(local_dir)
    tracker_urls, tracker_md5s = build_tracker_index(tracker_rows)

    api_rows = fetch_all_annotrieve_annotations()
    matched_url = 0
    matched_md5 = 0
    missing: list[dict] = []

    for rec in api_rows:
        url = source_url_from_api(rec)
        md5 = md5_from_api(rec)
        if url and url in tracker_urls:
            matched_url += 1
            continue
        if md5 and md5 in tracker_md5s:
            matched_md5 += 1
            continue
        missing.append(
            {
                "annotation_id": rec.get("annotation_id", ""),
                "organism_name": rec.get("organism_name", ""),
                "assembly_name": rec.get("assembly_name", ""),
                "source_database": db_from_api(rec),
                "source_url": url or "",
            }
        )

    fieldnames = [
        "annotation_id",
        "organism_name",
        "assembly_name",
        "source_database",
        "source_url",
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter="\t")
        writer.writeheader()
        writer.writerows(missing)

    print("\n=== Summary ===")
    print(f"Annotrieve total:     {len(api_rows)}")
    print(f"Tracker TSV rows:     {tracker_count}")
    print(f"Matched by URL:       {matched_url}")
    print(f"Matched by MD5:       {matched_md5}")
    print(f"Missing from tracker: {len(missing)}")
    print(f"Output:               {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
