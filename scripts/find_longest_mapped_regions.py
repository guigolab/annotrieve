#!/usr/bin/env python3
"""
Fetch all annotations from the Annotrieve API (1000 per page) and report the
annotation with the longest mapped_regions list.

Environment:
  ANNOTRIEVE_API_BASE — default https://genome.crg.es/annotrieve/api/v0
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import requests

API_BASE = os.environ.get(
    "ANNOTRIEVE_API_BASE", "https://genome.crg.es/annotrieve/api/v0"
).rstrip("/")
PAGE_SIZE = 1000
REQUEST_TIMEOUT = 120


def fetch_annotations_page(api_base: str, offset: int) -> dict:
    url = f"{api_base}/annotations"
    last_exc: Exception | None = None
    for attempt in range(8):
        try:
            response = requests.get(
                url,
                params={"limit": PAGE_SIZE, "offset": offset},
                timeout=REQUEST_TIMEOUT,
                headers={"User-Agent": "annotrieve-find-longest-mapped-regions/1.0"},
            )
            if response.status_code >= 500 and attempt < 7:
                time.sleep(min(2**attempt, 60))
                continue
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < 7:
                time.sleep(min(2**attempt, 60))
                continue
            raise
    assert last_exc is not None
    raise last_exc


def mapped_regions_length(annotation: dict) -> int:
    regions = annotation.get("mapped_regions")
    if regions is None:
        return 0
    if not isinstance(regions, list):
        return 0
    return len(regions)


def find_longest_mapped_regions(api_base: str) -> tuple[dict, int]:
    offset = 0
    total: int | None = None
    best_annotation: dict | None = None
    best_length = -1

    while True:
        payload = fetch_annotations_page(api_base, offset)
        total = int(payload["total"])
        results = payload.get("results") or []

        for annotation in results:
            length = mapped_regions_length(annotation)
            if length > best_length:
                best_length = length
                best_annotation = annotation

        offset += len(results)
        print(f"Scanned {offset}/{total} annotations...", flush=True)

        if not results or offset >= total:
            break

    if best_annotation is None:
        raise RuntimeError("No annotations returned from API")

    return best_annotation, best_length


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Find the annotation with the longest mapped_regions list."
    )
    parser.add_argument(
        "--api-base",
        default=API_BASE,
        help=f"Annotrieve API base URL (default: {API_BASE})",
    )
    args = parser.parse_args()

    api_base = args.api_base.rstrip("/")

    try:
        annotation, length = find_longest_mapped_regions(api_base)
    except requests.RequestException as exc:
        print(f"API request failed: {exc}", file=sys.stderr)
        return 1

    summary = {
        "mapped_regions_count": length,
        "annotation_id": annotation.get("annotation_id"),
        "assembly_accession": annotation.get("assembly_accession"),
        "assembly_name": annotation.get("assembly_name"),
        "organism_name": annotation.get("organism_name"),
        "taxid": annotation.get("taxid"),
    }
    print("\nLongest mapped_regions:")
    print(json.dumps(summary, indent=2))
    print("\nFull annotation:")
    print(json.dumps(annotation, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
