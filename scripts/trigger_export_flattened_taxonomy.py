#!/usr/bin/env python3
"""
Trigger export_flattened_taxonomy via the Annotrieve API.

Writes prebuilt flattened-tree.tsv and flattened-tree.json under
LOCAL_ANNOTATIONS_DIR/taxonomy/ (Celery worker must be running).

Environment:
  ANNOTRIEVE_API_BASE — default https://genome.crg.es/annotrieve/api/v0
  AUTH_KEY            — required (e.g. in annotrieve/.env)

Usage (from annotrieve/):
  python scripts/trigger_export_flattened_taxonomy.py
  ANNOTRIEVE_API_BASE=http://localhost:94/annotrieve/api/v0 \\
    python scripts/trigger_export_flattened_taxonomy.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

ANNOTRIEVE_ROOT = Path(__file__).resolve().parent.parent
PRODUCTION_API_BASE = "https://genome.crg.es/annotrieve/api/v0"
JOB_PATH = "/jobs/update/taxonomy/export-flattened"


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trigger export_flattened_taxonomy on Annotrieve.",
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("ANNOTRIEVE_API_BASE", PRODUCTION_API_BASE).rstrip("/"),
        help=f"API root (default: {PRODUCTION_API_BASE} or ANNOTRIEVE_API_BASE)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="HTTP timeout in seconds (default: 120)",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv(ANNOTRIEVE_ROOT / ".env")
    args = parse_args()

    auth_key = os.environ.get("AUTH_KEY", "").strip()
    if not auth_key:
        print("AUTH_KEY not set (expected in annotrieve/.env)", file=sys.stderr)
        return 1

    api_base = args.api_base.rstrip("/")
    url = f"{api_base}{JOB_PATH}"
    print(f"POST {url}", file=sys.stderr)

    try:
        response = requests.post(
            url,
            headers={"X-Auth-Key": auth_key},
            timeout=args.timeout,
        )
    except requests.exceptions.RequestException as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        body = response.json()
    except requests.exceptions.JSONDecodeError:
        body = response.text

    print(response.status_code, body)

    if response.status_code == 401:
        print("Unauthorized — check AUTH_KEY matches the API server", file=sys.stderr)
        return 1
    if not response.ok:
        print("Request failed", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
