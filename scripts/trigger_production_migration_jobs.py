#!/usr/bin/env python3
"""
Trigger production migration Celery jobs via the Annotrieve API (in order):

  1. backfill_taxon_parent_id
  2. unset_genome_annotation_mapped_regions (dry_run=false by default)
  3. remap_all_assemblies_and_annotations
  4. track_unique_users_by_country

Each step POSTs to the authenticated jobs API; workers must be running on the target
environment. remap_all_assemblies_and_annotations is long-running — run off-peak.

Environment:
  ANNOTRIEVE_API_BASE — default https://genome.crg.es/annotrieve/api/v0
  AUTH_KEY            — required (e.g. in annotrieve/.env)

Usage (from annotrieve/):
  python scripts/trigger_production_migration_jobs.py --confirm
  ANNOTRIEVE_API_BASE=http://localhost:94/annotrieve/api/v0 \\
    python scripts/trigger_production_migration_jobs.py --confirm
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

ANNOTRIEVE_ROOT = Path(__file__).resolve().parent.parent
PRODUCTION_API_BASE = "https://genome.crg.es/annotrieve/api/v0"

JOBS: tuple[tuple[str, str, dict | None], ...] = (
    ("backfill_taxon_parent_id", "/jobs/update/taxonomy/backfill-parent-id", None),
    (
        "unset_genome_annotation_mapped_regions",
        "/jobs/unset/mapped-regions",
        {"dry_run": "false"},
    ),
    (
        "remap_all_assemblies_and_annotations",
        "/jobs/remap/assemblies-and-annotations",
        None,
    ),
    (
        "track_unique_users_by_country",
        "/jobs/update/analytics",
        None,
    ),
)


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key:
            os.environ.setdefault(key, value)


def post_job(
    api_base: str,
    auth_key: str,
    path: str,
    params: dict | None,
    timeout: int,
) -> requests.Response:
    url = f"{api_base}{path}"
    return requests.post(
        url,
        headers={"X-Auth-Key": auth_key},
        params=params,
        timeout=timeout,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trigger production migration jobs on Annotrieve.",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("ANNOTRIEVE_API_BASE", PRODUCTION_API_BASE).rstrip("/"),
        help=f"API root (default: {PRODUCTION_API_BASE} or ANNOTRIEVE_API_BASE)",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required: acknowledge triggering jobs on the target API",
    )
    parser.add_argument(
        "--unset-dry-run",
        action="store_true",
        help="Pass dry_run=true for unset_genome_annotation_mapped_regions only",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="HTTP timeout per request in seconds (default: 120)",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv(ANNOTRIEVE_ROOT / ".env")
    args = parse_args()

    if not args.confirm:
        print("Refusing to run without --confirm.", file=sys.stderr)
        return 1

    auth_key = os.environ.get("AUTH_KEY", "").strip()
    if not auth_key:
        print("AUTH_KEY not set (expected in annotrieve/.env)", file=sys.stderr)
        return 1

    api_base = args.api_base.rstrip("/")
    print(f"Target API: {api_base}", file=sys.stderr)

    failed = False
    for name, path, params in JOBS:
        job_params = dict(params) if params else None
        if name == "unset_genome_annotation_mapped_regions" and args.unset_dry_run:
            job_params = {"dry_run": "true"}

        url = f"{api_base}{path}"
        print(f"\n→ {name}", file=sys.stderr)
        print(f"  POST {url}" + (f" ?{job_params}" if job_params else ""), file=sys.stderr)

        try:
            response = post_job(
                api_base, auth_key, path, job_params, timeout=args.timeout
            )
        except requests.exceptions.RequestException as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)
            failed = True
            break

        try:
            body = response.json()
        except requests.exceptions.JSONDecodeError:
            body = response.text

        print(f"  {response.status_code} {body}")

        if response.status_code == 401:
            print(
                "  Unauthorized — check AUTH_KEY matches the API server",
                file=sys.stderr,
            )
            failed = True
            break
        if not response.ok:
            print("  Request failed", file=sys.stderr)
            failed = True
            break

    if failed:
        return 1

    print("\nAll migration jobs queued successfully.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
