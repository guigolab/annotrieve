#!/usr/bin/env python3
"""
Stream NCBI RefSeq assembly_summary_refseq.txt and summarize assembly counts.

Reports the number of unique assembly accessions and how many have no paired
GenBank assembly (column gbrs_paired_asm empty or "na"; see NCBI README).

Environment:
  REFSEQ_ASSEMBLY_SUMMARY_URL — override the default FTP URL
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_URL = os.environ.get(
    "REFSEQ_ASSEMBLY_SUMMARY_URL",
    "https://ftp.ncbi.nlm.nih.gov/genomes/genbank/assembly_summary_genbank.txt",
)
USER_AGENT = "annotrieve-refseq-summary/1.0"
NA_VALUES = frozenset({"", "na", "n/a"})


def parse_header(line: str) -> dict[str, int]:
    cols = line.lstrip("#").strip().split("\t")
    return {name: idx for idx, name in enumerate(cols)}


def paired_genbank_missing(value: str) -> bool:
    return (value or "").strip().lower() in NA_VALUES


def summarize_from_stream(lines: Iterable[str]) -> dict[str, int]:
    unique_accessions: set[str] = set()
    accession_to_paired: dict[str, str] = {}
    total_rows = 0
    header: dict[str, int] | None = None

    for raw in lines:
        line = raw.rstrip("\n\r")
        if not line or line.startswith("##"):
            continue
        if line.startswith("#"):
            if "assembly_accession" in line:
                header = parse_header(line)
            continue
        if header is None:
            continue

        cols = line.split("\t")
        acc_idx = header["assembly_accession"]
        paired_idx = header["gbrs_paired_asm"]
        accession = cols[acc_idx] if acc_idx < len(cols) else ""
        paired = cols[paired_idx] if paired_idx < len(cols) else ""

        total_rows += 1
        unique_accessions.add(accession)
        accession_to_paired[accession] = paired

    if header is None:
        raise RuntimeError("Could not find assembly_accession header in stream")

    no_paired = sum(
        1
        for acc in unique_accessions
        if paired_genbank_missing(accession_to_paired[acc])
    )
    unique_count = len(unique_accessions)
    return {
        "total_rows": total_rows,
        "unique_assemblies": unique_count,
        "no_paired_genbank": no_paired,
        "with_paired_genbank": unique_count - no_paired,
    }


def stream_and_summarize(url: str) -> dict[str, int]:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=120) as resp:
        text = (raw.decode("utf-8", errors="replace") for raw in resp)
        return summarize_from_stream(text)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Summarize unique RefSeq assemblies and GenBank pairing from NCBI FTP."
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help=f"assembly_summary_refseq.txt URL (default: {DEFAULT_URL})",
    )
    args = parser.parse_args()

    print(f"Streaming {args.url} ...", flush=True)
    try:
        stats = stream_and_summarize(args.url)
    except (HTTPError, URLError, TimeoutError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    duplicate_rows = stats["total_rows"] - stats["unique_assemblies"]
    print("\n=== RefSeq assembly summary ===")
    print(f"Source:                     {args.url}")
    print(f"Data rows:                  {stats['total_rows']:,}")
    print(f"Unique assemblies:          {stats['unique_assemblies']:,}")
    if duplicate_rows:
        print(f"Duplicate accessions:       {duplicate_rows:,}")
    print(f"No paired GenBank assembly:  {stats['no_paired_genbank']:,}")
    print(f"With paired GenBank:        {stats['with_paired_genbank']:,}")
    if stats["unique_assemblies"]:
        pct = 100.0 * stats["no_paired_genbank"] / stats["unique_assemblies"]
        print(f"Unpaired (percent):         {pct:.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
