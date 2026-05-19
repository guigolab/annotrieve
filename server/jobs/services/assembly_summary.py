"""
Download and parse NCBI assembly_summary*.txt files for FTP path lookup.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = "annotrieve-assembly-summary/1.0"
REQUEST_TIMEOUT = 120
NA_VALUES = frozenset({"", "na", "n/a"})

CURRENT_SUMMARIES = (
    (
        "assembly_summary_genbank.txt",
        "https://ftp.ncbi.nlm.nih.gov/genomes/genbank/assembly_summary_genbank.txt",
    ),
    (
        "assembly_summary_refseq.txt",
        "https://ftp.ncbi.nlm.nih.gov/genomes/refseq/assembly_summary_refseq.txt",
    ),
)

HISTORICAL_SUMMARIES = (
    (
        "assembly_summary_genbank_historical.txt",
        "https://ftp.ncbi.nlm.nih.gov/genomes/genbank/assembly_summary_genbank_historical.txt",
    ),
    (
        "assembly_summary_refseq_historical.txt",
        "https://ftp.ncbi.nlm.nih.gov/genomes/refseq/assembly_summary_refseq_historical.txt",
    ),
)


def assembly_summaries_dir(base_dir: str | None = None) -> str:
    """Return the directory for NCBI assembly_summary*.txt (under LOCAL_ANNOTATIONS_DIR)."""
    root = base_dir or os.getenv("LOCAL_ANNOTATIONS_DIR")
    if not root:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")
    root = root.rstrip("/")
    if os.path.basename(root) == "assembly_summaries":
        path = root
    else:
        path = os.path.join(root, "assembly_summaries")
    # Legacy layout from double-appending assembly_summaries
    nested = os.path.join(path, "assembly_summaries")
    if (
        os.path.isdir(nested)
        and os.path.isfile(os.path.join(nested, "assembly_summary_refseq.txt"))
        and not os.path.isfile(os.path.join(path, "assembly_summary_refseq.txt"))
    ):
        path = nested
    os.makedirs(path, exist_ok=True)
    return path


def _meta_path(dest_dir: str, filename: str) -> str:
    return os.path.join(dest_dir, f"{filename}.meta.json")


def _parse_last_modified(header_value: str | None) -> datetime | None:
    if not header_value:
        return None
    try:
        dt = parsedate_to_datetime(header_value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError):
        return None


def _read_stored_remote_mtime(dest_dir: str, filename: str) -> datetime | None:
    meta_file = _meta_path(dest_dir, filename)
    if not os.path.isfile(meta_file):
        return None
    try:
        with open(meta_file, encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("remote_last_modified")
        if not raw:
            return None
        return datetime.fromisoformat(raw)
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def _write_stored_remote_mtime(dest_dir: str, filename: str, remote_dt: datetime) -> None:
    meta_file = _meta_path(dest_dir, filename)
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(
            {"remote_last_modified": remote_dt.astimezone(timezone.utc).isoformat()},
            f,
        )


def _remote_last_modified(url: str) -> datetime | None:
    req = Request(url, method="HEAD", headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return _parse_last_modified(resp.headers.get("Last-Modified"))


def _local_matches_remote(dest_dir: str, filename: str, remote_dt: datetime) -> bool:
    local_path = os.path.join(dest_dir, filename)
    if not os.path.isfile(local_path):
        return False
    stored = _read_stored_remote_mtime(dest_dir, filename)
    if stored is not None:
        return stored == remote_dt
    local_mtime = datetime.fromtimestamp(os.path.getmtime(local_path), tz=timezone.utc)
    return abs((local_mtime - remote_dt).total_seconds()) < 2


def _download_file(url: str, dest_path: str) -> datetime | None:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        remote_dt = _parse_last_modified(resp.headers.get("Last-Modified"))
        with open(dest_path, "wb") as out:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    return remote_dt


def download_assembly_summaries(
    dest_dir: str,
    files: Iterable[tuple[str, str]],
) -> dict[str, list[str]]:
    """
    Download summary TSVs when missing or when remote Last-Modified differs from local.
    """
    downloaded: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    os.makedirs(dest_dir, exist_ok=True)

    for filename, url in files:
        dest_path = os.path.join(dest_dir, filename)
        try:
            remote_dt = _remote_last_modified(url)
            if remote_dt and _local_matches_remote(dest_dir, filename, remote_dt):
                print(f"Assembly summary up to date: {filename}")
                skipped.append(filename)
                continue

            print(f"Downloading assembly summary: {filename}")
            remote_dt = _download_file(url, dest_path) or remote_dt
            if remote_dt:
                _write_stored_remote_mtime(dest_dir, filename, remote_dt)
            downloaded.append(filename)
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            print(f"Failed to download {filename}: {exc}")
            failed.append(filename)

    return {"downloaded": downloaded, "skipped": skipped, "failed": failed}


def download_current_assembly_summaries(
    dest_dir: str | None = None,
) -> dict[str, list[str]]:
    directory = assembly_summaries_dir(dest_dir)
    return download_assembly_summaries(directory, CURRENT_SUMMARIES)


def download_historical_assembly_summaries(
    dest_dir: str | None = None,
) -> dict[str, list[str]]:
    directory = assembly_summaries_dir(dest_dir)
    return download_assembly_summaries(directory, HISTORICAL_SUMMARIES)


def _parse_header(line: str) -> dict[str, int]:
    cols = line.lstrip("#").strip().split("\t")
    return {name: idx for idx, name in enumerate(cols)}


def _ftp_path_valid(value: str) -> bool:
    v = (value or "").strip()
    return v.lower() not in NA_VALUES


def _stream_file_ftp_paths(
    filepath: str,
    *,
    target_accessions: set[str] | None,
    latest_only: bool,
    index: dict[str, str],
) -> None:
    if not os.path.isfile(filepath):
        print(f"Assembly summary file not found (skipped): {filepath}")
        return

    header: dict[str, int] | None = None
    with open(filepath, encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n\r")
            if not line or line.startswith("##"):
                continue
            if line.startswith("#"):
                if "assembly_accession" in line:
                    header = _parse_header(line)
                continue
            if header is None:
                continue

            cols = line.split("\t")
            acc_idx = header.get("assembly_accession")
            path_idx = header.get("ftp_path")
            status_idx = header.get("version_status")
            if acc_idx is None or path_idx is None:
                continue

            accession = cols[acc_idx].strip() if acc_idx < len(cols) else ""
            if not accession:
                continue
            if target_accessions is not None and accession not in target_accessions:
                continue

            # When resolving explicit accessions, keep non-latest versions (annotations pin a version).
            if (
                latest_only
                and target_accessions is None
                and status_idx is not None
                and status_idx < len(cols)
            ):
                status = cols[status_idx].strip().lower()
                if status != "latest":
                    continue

            ftp_path = cols[path_idx].strip() if path_idx < len(cols) else ""
            if _ftp_path_valid(ftp_path):
                index[accession] = ftp_path


def build_ftp_path_index(
    summary_dir: str,
    target_accessions: set[str] | None = None,
    *,
    include_historical: bool = False,
    only_accessions: set[str] | None = None,
) -> dict[str, str]:
    """
    Build accession -> ftp_path from local summary files.
    only_accessions: when set with include_historical, only add paths for these accessions.
    """
    index: dict[str, str] = {}
    filter_set = only_accessions if only_accessions is not None else target_accessions

    if include_historical:
        for filename, _ in HISTORICAL_SUMMARIES:
            _stream_file_ftp_paths(
                os.path.join(summary_dir, filename),
                target_accessions=filter_set,
                latest_only=False,
                index=index,
            )

    _stream_file_ftp_paths(
        os.path.join(summary_dir, "assembly_summary_genbank.txt"),
        target_accessions=target_accessions,
        latest_only=True,
        index=index,
    )
    _stream_file_ftp_paths(
        os.path.join(summary_dir, "assembly_summary_refseq.txt"),
        target_accessions=target_accessions,
        latest_only=True,
        index=index,
    )

    return index


def merge_historical_paths_for_orphans(
    summary_dir: str,
    orphans: set[str],
    existing_index: dict[str, str],
) -> int:
    """
    Fill ftp_path for orphan accessions from current + historical summaries
    (no version_status filter).
    """
    if not orphans:
        return 0
    before = {acc for acc in orphans if acc in existing_index}
    supplemental: dict[str, str] = {}
    for filename, _ in CURRENT_SUMMARIES + HISTORICAL_SUMMARIES:
        _stream_file_ftp_paths(
            os.path.join(summary_dir, filename),
            target_accessions=orphans,
            latest_only=False,
            index=supplemental,
        )
    for acc, path in supplemental.items():
        existing_index[acc] = path
    after = {acc for acc in orphans if acc in existing_index}
    return len(after - before)
