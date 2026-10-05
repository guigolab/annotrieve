"""
Download / parse the public annotation report for gene_corpus.

Stdlib only — does not import server.* . Mirrors the behavior of
server/gene_search_build/annotation_report.py for selected fields.

Uses POST /annotations/report with always-on db_sources filter; optional
md5_checksums (annotation_id list) to fetch only requested rows.
"""
from __future__ import annotations

import csv
import json
import os
import shutil
import tempfile
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence
from urllib.error import HTTPError, URLError

DEFAULT_API_BASE = "https://genome.crg.es/annotrieve/api/v0"

# Extended columns only (defaults always present on the report).
REPORT_SELECTED_FIELDS = "attribute_keys,feature_types,root_type_counts,has_cds"

# Databases included in the gene_corpus dry-run (TOGA2 deferred).
# Client filter is casefolded; API filter uses title-case labels as stored.
ALLOWED_DATABASES: frozenset[str] = frozenset({"ensembl", "genbank", "refseq"})
API_DB_SOURCES: tuple[str, ...] = ("Ensembl", "GenBank", "RefSeq")


@dataclass(frozen=True)
class ReportRow:
    """Raw filtered report row before path resolve / gating."""

    annotation_id: str
    database: str
    taxid: int
    assembly_accession: str
    organism_name: str
    provider: str | None
    bgzip_path: str
    source_url: str
    attribute_keys: list[str]
    feature_types: list[str]
    root_type_counts: dict[str, int] | None
    has_cds: bool | None


def annotation_report_url(api_base: str) -> str:
    """POST endpoint URL (no query string; filters go in JSON body)."""
    return f"{api_base.rstrip('/')}/annotations/report"


def download_annotation_report(
    api_base: str,
    dest: Path,
    *,
    annotation_ids: Sequence[str] | None = None,
    timeout: float = 600,
    opener=None,
) -> None:
    """
    POST the report TSV to dest.

    Always filters ``db_sources`` to Ensembl/GenBank/RefSeq. When
    ``annotation_ids`` is set, also sends ``md5_checksums`` (API name for
    annotation_id__in).
    """
    url = annotation_report_url(api_base)
    body: dict = {
        "selected_fields": REPORT_SELECTED_FIELDS,
        "db_sources": list(API_DB_SOURCES),
    }
    if annotation_ids:
        body["md5_checksums"] = list(annotation_ids)

    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "text/tab-separated-values",
        },
    )
    open_url = opener or urllib.request.urlopen
    dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = dest.with_name(dest.name + ".partial")
    try:
        with open_url(request, timeout=timeout) as response, temporary.open(
            "wb"
        ) as handle:
            shutil.copyfileobj(response, handle)
        os.replace(temporary, dest)
    except HTTPError as exc:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"annotation report download failed: HTTP {exc.code} from {url}"
        ) from exc
    except URLError as exc:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(
            f"annotation report download failed: {exc.reason} ({url})"
        ) from exc
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


@contextmanager
def downloaded_annotation_report(
    api_base: str,
    *,
    annotation_ids: Sequence[str] | None = None,
    timeout: float = 600,
    opener=None,
) -> Iterator[Path]:
    """Yield a temp TSV path, then delete the temp directory."""
    directory = tempfile.mkdtemp(prefix="gene-corpus-annotation-report-")
    dest = Path(directory) / "annotation_report.tsv"
    try:
        download_annotation_report(
            api_base,
            dest,
            annotation_ids=annotation_ids,
            timeout=timeout,
            opener=opener,
        )
        yield dest
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def _split_semi(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(";") if part.strip()]


def _parse_has_cds(raw: str | None) -> bool | None:
    if raw is None:
        return None
    key = raw.strip().lower()
    if not key:
        return None
    return {"true": True, "false": False}.get(key)


def _parse_root_type_counts(raw: str | None) -> dict[str, int] | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    out: dict[str, int] = {}
    for key, value in parsed.items():
        try:
            out[str(key)] = int(value)
        except (TypeError, ValueError):
            continue
    return out or None


def parse_report_rows(report: Path) -> list[ReportRow]:
    """Parse TSV; keep Ensembl / GenBank / RefSeq only (client-side belt)."""
    rows: list[ReportRow] = []
    with report.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            database = (row.get("database") or "").strip()
            if database.casefold() not in ALLOWED_DATABASES:
                continue
            bgzip = (row.get("bgzip_path") or "").strip()
            taxid_raw = (row.get("taxid") or "").strip()
            provider_raw = (row.get("provider") or "").strip()
            rows.append(
                ReportRow(
                    annotation_id=(row.get("annotation_id") or "").strip(),
                    database=database,
                    taxid=int(taxid_raw) if taxid_raw.isdigit() else 0,
                    assembly_accession=(row.get("assembly_accession") or "").strip(),
                    organism_name=(row.get("organism_name") or "").strip(),
                    provider=provider_raw or None,
                    bgzip_path=bgzip,
                    source_url=(row.get("source_url") or "").strip(),
                    attribute_keys=_split_semi(row.get("attribute_keys")),
                    feature_types=_split_semi(row.get("feature_types")),
                    root_type_counts=_parse_root_type_counts(row.get("root_type_counts")),
                    has_cds=_parse_has_cds(row.get("has_cds")),
                )
            )
    return rows


def load_report_rows(
    *,
    api_base: str | None = None,
    report: Path | None = None,
    annotation_ids: Sequence[str] | None = None,
    timeout: float = 600,
) -> list[ReportRow]:
    """
    Load from a local TSV or POST-download from api_base.

    ``annotation_ids`` filters the API request (md5_checksums). For a local
    ``--report`` file, filters client-side after parse.
    """
    ids = list(annotation_ids) if annotation_ids else None
    if report is not None:
        if not report.is_file():
            raise FileNotFoundError(f"report not found: {report}")
        rows = parse_report_rows(report)
        if ids:
            want = set(ids)
            rows = [r for r in rows if r.annotation_id in want]
        return rows
    if not api_base:
        raise ValueError("api_base or report is required")
    with downloaded_annotation_report(
        api_base, annotation_ids=ids, timeout=timeout
    ) as path:
        return parse_report_rows(path)
