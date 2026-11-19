import logging
import os
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from db.embedded_documents import AssemblyReportBackfill
from db.models import (
    BioProject,
    GenomeAssembly,
    AssemblyStats,
)
from helpers import assembly_sequence_files as seq_files
from helpers.constants import PLACEHOLDER_DOWNLOAD_URL_PREFIX
from mongoengine import Q
from clients import ncbi_datasets as ncbi_datasets_client
from .classes import (
    AnnotationToProcess,
    AssemblyReportSequence,
)
from . import assembly_summary as assembly_summary_service
from .utils import create_batches
import asyncio
import aiohttp
import requests
from urllib.parse import urljoin, urlparse
import time
import uuid

logger = logging.getLogger(__name__)

# Every log line carries the tag of the concern it belongs to, so a job run can be read (or
# grepped) one concern at a time. The worker prefix only shows time/level, not the logger name.
LOG_SYNC = "[assembly-sync]"      # orchestration: plan, chunk progress, final summary
LOG_PATH = "[ftp-path]"           # finding the NCBI FTP directory / download_url of an assembly
LOG_REPORT = "[assembly-report]"  # downloading and storing the raw NCBI assembly_report.txt
LOG_CHR = "[chromosome-files]"    # generating chromosomes.json + chr_aliases.tsv from the report
LOG_STATUS = "[report-status]"    # statuses written to the DB for the two concerns above
LOG_IMPORT = "[assembly-import]"  # inserting new assemblies / refreshing them from NCBI Datasets
MAX_LISTED = 15                   # accessions listed in one log line before "... and N more"


def _listed(items, limit: int = MAX_LISTED) -> str:
    """Compact, bounded rendering of accessions (or acc(reason) strings) for one log line."""
    items = list(items)
    shown = ", ".join(str(i) for i in items[:limit])
    return shown + (f", ... and {len(items) - limit} more" if len(items) > limit else "")


FTP_BASE = "https://ftp.ncbi.nlm.nih.gov/genomes/all"
NCBI_FTP_SITE = "https://ftp.ncbi.nlm.nih.gov"
REQUEST_TIMEOUT = 15
# Assembly reports range from KBs to ~100 MB and are streamed to disk. A short *total* timeout
# makes every large report fail (and retry identically); bound connection setup and read stalls
# instead, with a generous cap on the whole transfer.
REPORT_CONNECT_TIMEOUT = 15
REPORT_READ_TIMEOUT = 60
REPORT_TOTAL_TIMEOUT = 900
# Reports of fragmented assemblies are 40-90 MB; NCBI drops connections ("Server disconnected")
# when many are pulled at once, so keep few downloads in flight and back off patiently.
REPORT_CONCURRENCY = 4
REPORT_RETRY_CONCURRENCY = 2
REPORT_RETRY_DELAYS = (5, 15, 45, 120)
REPORT_USER_AGENT = "annotrieve-assembly-sync"
_FTP_REQUEST_COUNT = 0
_FTP_RATE_LIMIT_EVERY = 3
_FTP_RATE_LIMIT_WAIT = 1.0


def _maybe_wait_ftp_rate() -> None:
    """Wait 1 second every 3 FTP requests to avoid rate limiting."""
    global _FTP_REQUEST_COUNT
    if _FTP_REQUEST_COUNT > 0 and _FTP_REQUEST_COUNT % _FTP_RATE_LIMIT_EVERY == 0:
        time.sleep(_FTP_RATE_LIMIT_WAIT)
    _FTP_REQUEST_COUNT += 1


def get_existing_accessions(accessions: list[str]) -> list[str]:
    """
    Get all the accessions that already exist in the database
    """
    return GenomeAssembly.objects(assembly_accession__in=accessions).scalar('assembly_accession')


@dataclass(frozen=True)
class NcbiFtpResolution:
    directory_url: str
    dir_name: str
    download_url: str
    assembly_report_url: str


@dataclass
class AssemblyFtpContext:
    assembly_name: str
    ncbi_ftp_directory_url: str | None = None
    raw_dest: str | None = None  # where to store the raw assembly_report.txt, if wanted


class FetchOutcome(Enum):
    OK = "ok"
    NOT_FOUND = "not_found"
    TRANSIENT = "transient"
    PARSE_EMPTY = "parse_empty"


@dataclass
class AssemblyReportFetchResult:
    outcome: FetchOutcome
    data: list[AssemblyReportSequence] | None = None
    url: str = ""
    status: int | None = None
    message: str = ""


def placeholder_download_url(assembly_accession: str) -> str:
    return f"{PLACEHOLDER_DOWNLOAD_URL_PREFIX}{assembly_accession}"


def resolution_from_summary_ftp_path(ftp_path: str) -> NcbiFtpResolution | None:
    if not ftp_path or ftp_path.strip().lower() in ("", "na", "n/a"):
        return None
    for candidate in ftp_path.split(";"):
        candidate = candidate.strip().rstrip("/")
        if not candidate or candidate.lower() in ("na", "n/a"):
            continue
        if candidate.startswith(("http://", "https://")):
            parsed = urlparse(candidate)
            if not parsed.scheme or not parsed.netloc:
                continue
            directory_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}/"
        elif candidate.startswith("/"):
            directory_url = f"{NCBI_FTP_SITE}{candidate}/"
        else:
            directory_url = f"{NCBI_FTP_SITE}/{candidate}/"
        dir_name = directory_url.rstrip("/").split("/")[-1]
        if not dir_name:
            continue
        return NcbiFtpResolution(
            directory_url=directory_url,
            dir_name=dir_name,
            download_url=urljoin(directory_url, f"{dir_name}_genomic.fna.gz"),
            assembly_report_url=urljoin(directory_url, f"{dir_name}_assembly_report.txt"),
        )
    return None


def handle_assemblies(
    annotations: list[AnnotationToProcess],
    tmp_dir: str,
    valid_lineages: dict[str, list[str]],
    batch_size: int = 5000,
) -> tuple[list[str], list[str]]:
    """
    Fetch and save new assemblies (placeholder download_url). FTP paths and sequences
    are filled by sync_new_assemblies_from_summary after import.
    Returns (valid_accessions, newly_saved_accessions).
    """
    all_accessions = set(annotation.assembly_accession for annotation in annotations)
    existing_accessions = get_existing_accessions(list(all_accessions))
    new_accessions = all_accessions - set(existing_accessions)
    newly_saved: list[str] = []

    if new_accessions:
        logger.info(f"{LOG_IMPORT} {len(new_accessions)} new assemblies to fetch from NCBI Datasets")
        saved_accessions = fetch_new_assemblies_and_bioprojects(
            list(new_accessions), tmp_dir, valid_lineages, batch_size
        )
        if saved_accessions:
            logger.info(f"{LOG_IMPORT} saved {len(saved_accessions)} new assemblies; FTP paths, reports and chromosome files are filled later by the assembly sync job")
            newly_saved = saved_accessions

    return get_existing_accessions(list(all_accessions)), newly_saved


def fetch_new_assemblies_and_bioprojects(new_accessions: list[str], tmp_dir: str, valid_lineages: dict[str, list[str]], batch_size: int=5000) -> list[str]:
    """
    Fetch the new assemblies from the accessions and save them, Here we also handle bioprojects. Return the list of saved accessions
    """
    saved_accessions = []
    bioprojects_to_save = dict() #accession: BioProject to ensure we don't save the same bioproject multiple times

    batches = create_batches(new_accessions, batch_size)
    for idx, batch in enumerate(batches):

        assemblies_path = os.path.join(tmp_dir, f'assemblies_{idx}_{len(batch)}.txt')
        with open(assemblies_path, 'w') as f:
            for assembly in batch: 
                f.write(assembly + '\n')
        cmd = ['genome', 'accession', '--inputfile', assemblies_path]
        ncbi_report = ncbi_datasets_client.get_data_from_ncbi(cmd)
        parsed = [
            parse_assembly_from_ncbi(assembly, valid_lineages, bioprojects_to_save)
            for assembly in ncbi_report.get('reports', [])
        ]
        # an assembly without a usable tax id would be stored with taxid "None" and could never be
        # placed in a folder: skip it, the next run retries it
        assemblies_to_save: list[GenomeAssembly] = [a for a in parsed if a is not None]
        if not assemblies_to_save:
            logger.warning(f"{LOG_IMPORT} NCBI Datasets returned no usable assembly for the batch in {assemblies_path}; continuing")
            continue
        found_accessions = [assembly.assembly_accession for assembly in assemblies_to_save]
        try:
            GenomeAssembly.objects.insert(assemblies_to_save)
            saved_accessions.extend(found_accessions)
        except Exception as e:
            logger.error(f"{LOG_IMPORT} could not insert an assembly batch ({len(found_accessions)} assemblies), they will be retried by the next import: {e}")
            #delete the assemblies that were saved, we will retry it in the next job
            GenomeAssembly.objects(assembly_accession__in=found_accessions).delete()
            continue
    existing_bioprojects = set(
        BioProject.objects(accession__in=list(bioprojects_to_save.keys())).scalar('accession')
    )
    _insert_bioprojects([
        bioproject for accession, bioproject in bioprojects_to_save.items()
        if accession not in existing_bioprojects
    ])
    return saved_accessions


def _insert_bioprojects(bioprojects: list[BioProject]) -> None:
    """
    Insert bioprojects without ever raising.

    The assemblies referencing them are already saved at this point; raising would make the
    caller lose the list of newly saved accessions (so their FTP/sequence sync would never be
    scheduled and they would keep their placeholder download_url forever). On a bulk failure
    fall back to inserting one by one so a single bad document does not drop the rest.
    """
    if not bioprojects:
        return
    try:
        BioProject.objects.insert(bioprojects)
        return
    except Exception as e:
        logger.warning(f"{LOG_IMPORT} bulk bioproject insert failed, falling back to one-by-one: {e}")
    for bioproject in bioprojects:
        try:
            if not BioProject.objects(accession=bioproject.accession).first():
                BioProject.objects.insert([bioproject])
        except Exception as single_e:
            logger.error(f"{LOG_IMPORT} could not insert bioproject {bioproject.accession}: {single_e}")


def save_chromosome_files(
    chromosomes_tuples: list[tuple[str, list[AssemblyReportSequence]]],
    acc_to_taxid: dict[str, str],
) -> dict[str, int]:
    """Write chromosomes.json + chr_aliases.tsv for each assembly (assembled-molecule rows)."""
    written: dict[str, int] = {}
    no_taxid: list[str] = []
    for assembly_accession, fetched_data in chromosomes_tuples:
        taxid = acc_to_taxid.get(assembly_accession)
        if not taxid:
            no_taxid.append(assembly_accession)
            continue
        molecules = seq_files.filter_assembled_molecules(fetched_data)
        seq_files.write_chromosomes(taxid, assembly_accession, molecules)
        seq_files.write_chr_aliases(taxid, assembly_accession, molecules)
        written[assembly_accession] = len(molecules)
    if no_taxid:
        logger.warning(f"{LOG_CHR} NOT generated for {len(no_taxid)} assemblies without a taxid: {_listed(no_taxid)}")
    if chromosomes_tuples:
        empty = [a for a, n in written.items() if n == 0]
        logger.info(
            f"{LOG_CHR} chromosomes.json + chr_aliases.tsv written for {len(written)} assemblies "
            f"({sum(written.values())} assembled molecules in total)"
        )
        if empty:
            logger.warning(
                f"{LOG_CHR} {len(empty)} chromosome-level assemblies have NO assembled-molecule rows in their "
                f"report, empty files were written: {_listed(empty)}"
            )
    return written


async def parse_assembly_report_stream(
    resp: aiohttp.ClientResponse,
    raw_out=None,
) -> list[AssemblyReportSequence]:
    """
    Stream and parse the assembly report. Returns assembled-molecule rows in report order.
    When `raw_out` (a binary file object) is given, every line is also written to it verbatim.
    """
    assembled_rows: list[AssemblyReportSequence] = []
    header_cols: list[str] | None = None
    role_idx: int | None = None

    def normalize_header(line: str) -> list[str]:
        normalized = (
            line.lstrip("#").strip().lower()
            .replace(" ", "_")
            .replace("-", "_")
            .replace("/", "_")
        )
        return normalized.split("\t")

    def clean_value(value: str) -> str:
        v = value.strip()
        if v in ("NA", "na"):
            return ""
        return v

    while True:
        raw_line_bytes = await resp.content.readline()
        if not raw_line_bytes:
            break
        if raw_out is not None:
            raw_out.write(raw_line_bytes)
        line = raw_line_bytes.decode("utf-8", errors="replace").rstrip("\n")
        if not line:
            continue

        if line.startswith("#"):
            cols = normalize_header(line)
            if "sequence_role" in cols and "sequence_name" in cols:
                header_cols = cols
                role_idx = header_cols.index("sequence_role")
            continue

        if not header_cols:
            continue

        cols = line.split("\t")
        role = cols[role_idx] if role_idx is not None and role_idx < len(cols) else ""

        row = {h: clean_value(v) for h, v in zip(header_cols, cols)}

        try:
            sequence_length_str = row.get("sequence_length", "").replace(",", "")
            sequence_length = int(sequence_length_str) if sequence_length_str else 0
            report_seq = AssemblyReportSequence(
                chr_name=row.get("assigned_molecule", ""),
                genbank_accn=row.get("genbank_accn", ""),
                refseq_accn=row.get("refseq_accn", ""),
                sequence_length=sequence_length,
                ucsc_style_name=row.get("ucsc_style_name", ""),
                sequence_name=row.get("sequence_name", ""),
                sequence_role=role,
            )
        except Exception:
            continue

        if role.strip().lower() != seq_files.ASSEMBLED_MOLECULE_ROLE:
            continue

        assembled_rows.append(report_seq)

    return assembled_rows

def _build_ftp_level_url(accession: str) -> str:
    """Build the NCBI FTP URL for the accession's numeric level directory (e.g. .../GCF/000/001/405/)."""
    return f"{FTP_BASE}/{accession[0:3]}/{accession[4:7]}/{accession[7:10]}/{accession[10:13]}/"


def _ftp_resource_exists(url: str) -> bool:
    """Return True if the URL exists on NCBI FTP (HEAD with GET fallback)."""
    _maybe_wait_ftp_rate()
    try:
        resp = requests.head(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if resp.status_code == 200:
            return True
    except Exception:
        pass
    _maybe_wait_ftp_rate()
    try:
        with requests.get(url, timeout=REQUEST_TIMEOUT, stream=True, allow_redirects=True) as resp:
            if resp.status_code != 200:
                return False
            next(resp.iter_content(chunk_size=1), None)
            return True
    except Exception:
        return False


def _scrape_ftp_directory(level_url: str, accession: str) -> list[str]:
    """
    Fetch the NCBI FTP directory listing and return subdirectory names for this accession version.
    """
    _maybe_wait_ftp_rate()
    try:
        resp = requests.get(level_url, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        html = resp.text
    except Exception:
        return []
    prefix = re.escape(accession) + "_"
    pattern = prefix + r"([^\s/]+)/"
    matches = re.findall(pattern, html)
    dir_names = [accession + "_" + m for m in matches]
    return list(dict.fromkeys(dir_names))


def _ftp_file_urls(level_url: str, dir_name: str) -> NcbiFtpResolution:
    directory_url = urljoin(level_url, f"{dir_name}/")
    return NcbiFtpResolution(
        directory_url=directory_url,
        dir_name=dir_name,
        download_url=urljoin(directory_url, f"{dir_name}_genomic.fna.gz"),
        assembly_report_url=urljoin(directory_url, f"{dir_name}_assembly_report.txt"),
    )


def _pick_directory_for_accession(
    accession: str, dir_names: list[str], level_url: str
) -> str | None:
    """Pick FTP subdirectory matching the accession version prefix (e.g. GCF_000001405.40_)."""
    prefix = f"{accession}_"
    matches = [d for d in dir_names if d.startswith(prefix)]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    for dir_name in matches:
        report_url = _ftp_file_urls(level_url, dir_name).assembly_report_url
        if _ftp_resource_exists(report_url):
            return dir_name
    return matches[0]


def _legacy_ftp_candidate(accession: str, assembly_name: str) -> NcbiFtpResolution:
    """Name-based FTP paths when version directory scrape finds no match."""
    name = assembly_name.replace(" ", "_").replace("-", "_")
    return _ftp_file_urls(_build_ftp_level_url(accession), f"{accession}_{name}")


def resolve_ncbi_ftp_paths(
    accession: str, assembly_name: str | None = None
) -> NcbiFtpResolution | None:
    """
    Resolve NCBI FTP directory and file URLs by accession version, with optional legacy name fallback.
    """
    if not accession or len(accession) < 13:
        return _legacy_ftp_candidate(accession, assembly_name) if assembly_name else None
    level_url = _build_ftp_level_url(accession)
    dirs = _scrape_ftp_directory(level_url, accession)
    dir_name = _pick_directory_for_accession(accession, dirs, level_url)
    if dir_name:
        return _ftp_file_urls(level_url, dir_name)
    if assembly_name:
        return _legacy_ftp_candidate(accession, assembly_name)
    return None


def assembly_report_url_from_directory(directory_url: str) -> str:
    dir_name = directory_url.rstrip("/").split("/")[-1]
    base = directory_url if directory_url.endswith("/") else f"{directory_url}/"
    return urljoin(base, f"{dir_name}_assembly_report.txt")


def _report_url_and_resolution(
    ctx: AssemblyFtpContext,
) -> tuple[str | None, NcbiFtpResolution | None]:
    if ctx.ncbi_ftp_directory_url:
        return assembly_report_url_from_directory(ctx.ncbi_ftp_directory_url), None
    return None, None


def _persist_resolved_ftp_paths(resolved: dict[str, NcbiFtpResolution]) -> None:
    for accession, ftp in resolved.items():
        try:
            GenomeAssembly.objects(assembly_accession=accession).update_one(
                set__ncbi_ftp_directory_url=ftp.directory_url,
                set__download_url=ftp.download_url,
            )
        except Exception as e:
            logger.error(f"{LOG_PATH} could not save the FTP path of {accession} to the DB: {e}")


def _classify_http_status(status: int) -> FetchOutcome:
    if status == 404:
        return FetchOutcome.NOT_FOUND
    if status in (408, 429, 500, 502, 503, 504):
        return FetchOutcome.TRANSIENT
    return FetchOutcome.NOT_FOUND


def _report_timeout() -> aiohttp.ClientTimeout:
    return aiohttp.ClientTimeout(
        total=REPORT_TOTAL_TIMEOUT,
        sock_connect=REPORT_CONNECT_TIMEOUT,
        sock_read=REPORT_READ_TIMEOUT,
    )


def _looks_like_assembly_report(path: str, head_bytes: int = 262144) -> bool:
    """True if the head of the file has the report's `# Sequence-Name ... Sequence-Role` header."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(head_bytes).decode("utf-8", errors="replace").lower()
    except OSError:
        return False
    return any(
        line.startswith("#") and "sequence-name" in line and "sequence-role" in line
        for line in head.splitlines()
    )


async def get_assembly_report_result(
    session: aiohttp.ClientSession,
    url: str,
    raw_dest: str | None = None,
) -> AssemblyReportFetchResult:
    """
    Fetch and parse one assembly report. When `raw_dest` is given the raw text is streamed to
    `raw_dest.tmp` and atomically published only if the whole body was read (never held in RAM).
    """
    tmp_path = f"{raw_dest}.{uuid.uuid4().hex}.tmp" if raw_dest else None
    try:
        async with session.get(url, timeout=_report_timeout()) as resp:
            status = resp.status
            if status != 200:
                return AssemblyReportFetchResult(
                    outcome=_classify_http_status(status),
                    url=url,
                    status=status,
                    message=f"HTTP {status}",
                )
            if tmp_path:
                os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
                with open(tmp_path, "wb") as raw_out:
                    data = await parse_assembly_report_stream(resp, raw_out)
                if not _looks_like_assembly_report(tmp_path):
                    # e.g. an HTML error page served with 200: never store it, retry later
                    return AssemblyReportFetchResult(
                        outcome=FetchOutcome.TRANSIENT,
                        url=url,
                        status=status,
                        message="response is not an NCBI assembly report",
                    )
                os.replace(tmp_path, raw_dest)
            else:
                data = await parse_assembly_report_stream(resp)
            if not data:
                return AssemblyReportFetchResult(
                    outcome=FetchOutcome.PARSE_EMPTY,
                    data=[],
                    url=url,
                    status=status,
                )
            return AssemblyReportFetchResult(
                outcome=FetchOutcome.OK, data=data, url=url, status=status
            )
    except Exception as e:  # aiohttp/timeout/disk errors: all retried as transient
        return AssemblyReportFetchResult(
            outcome=FetchOutcome.TRANSIENT,
            url=url,
            message=str(e) or type(e).__name__,  # asyncio.TimeoutError has an empty str()
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


async def _fetch_report_outcomes(
    acc_to_url: dict[str, str],
    concurrency: int = REPORT_CONCURRENCY,
    raw_dests: dict[str, str] | None = None,
) -> dict[str, AssemblyReportFetchResult]:
    outcomes: dict[str, AssemblyReportFetchResult] = {}
    sem = asyncio.Semaphore(concurrency)

    # force_close: never reuse a keep-alive connection NCBI may already have closed
    connector = aiohttp.TCPConnector(limit=concurrency, force_close=True)
    async with aiohttp.ClientSession(
        connector=connector, headers={"User-Agent": REPORT_USER_AGENT}
    ) as session:
        async def bound_fetch(accession: str, url: str) -> None:
            async with sem:
                outcomes[accession] = await get_assembly_report_result(
                    session, url, (raw_dests or {}).get(accession)
                )

        await asyncio.gather(
            *(bound_fetch(acc, url) for acc, url in acc_to_url.items())
        )
    return outcomes


def _collect_successful_fetches(
    outcomes: dict[str, AssemblyReportFetchResult],
) -> tuple[list[tuple[str, list[AssemblyReportSequence]]], dict[str, str], dict[str, str]]:
    """Split fetch outcomes into stored reports, transient errors and not-found. Per-item detail is DEBUG."""
    fetched: list[tuple[str, list[AssemblyReportSequence]]] = []
    transient: dict[str, str] = {}
    not_found: dict[str, str] = {}
    for acc, result in outcomes.items():
        if result.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY):
            fetched.append((acc, result.data or []))
        elif result.outcome == FetchOutcome.TRANSIENT:
            transient[acc] = result.url
            logger.debug(f"{LOG_REPORT} {acc}: transient error ({result.message}) {result.url}")
        else:
            not_found[acc] = result.url
            logger.debug(f"{LOG_REPORT} {acc}: not found ({result.message}) {result.url}")
    return fetched, transient, not_found


def _log_fetch_round(label: str, outcomes: dict[str, AssemblyReportFetchResult]) -> None:
    """One INFO line per download round: what was stored and what went wrong, with reasons counted."""
    stored = [a for a, r in outcomes.items() if r.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY)]
    no_molecules = [a for a in stored if outcomes[a].outcome == FetchOutcome.PARSE_EMPTY]
    transient = [a for a, r in outcomes.items() if r.outcome == FetchOutcome.TRANSIENT]
    not_found = [a for a, r in outcomes.items() if r.outcome == FetchOutcome.NOT_FOUND]
    parts = [f"downloaded and stored={len(stored)}"]
    if no_molecules:
        parts.append(f"of which without assembled molecules (normal for scaffold/contig-level)={len(no_molecules)}")
    if transient:
        reasons = Counter(outcomes[a].message or "unknown" for a in transient)
        parts.append(f"network errors={len(transient)} ({'; '.join(f'{m} x{n}' for m, n in reasons.most_common(3))})")
    if not_found:
        parts.append(f"not found at the stored path={len(not_found)}")
    logger.info(f"{LOG_REPORT} {label}: " + ", ".join(parts))


async def fetch_reports_with_retry(
    acc_to_context: dict[str, AssemblyFtpContext],
) -> tuple[list[tuple[str, list[AssemblyReportSequence]]], dict[str, NcbiFtpResolution], dict, dict[str, AssemblyReportFetchResult]]:
    """
    Fetch assembly reports with transient backoff and FTP re-resolution for not-found URLs.
    """
    stats = {
        "candidates": len(acc_to_context),
        "fetched": 0,
        "transient_retries": 0,
        "resolved": 0,
        "still_missing": 0,
    }
    resolved_to_persist: dict[str, NcbiFtpResolution] = {}
    acc_to_url: dict[str, str] = {}

    for acc, ctx in acc_to_context.items():
        url, ftp = _report_url_and_resolution(ctx)
        if ftp:
            resolved_to_persist[acc] = ftp
        if url:
            acc_to_url[acc] = url

    raw_dests = {acc: ctx.raw_dest for acc, ctx in acc_to_context.items() if ctx.raw_dest}
    all_outcomes: dict[str, AssemblyReportFetchResult] = {}

    if not acc_to_url:
        logger.warning(
            f"{LOG_REPORT} cannot download {len(acc_to_context)} reports: these assemblies have no "
            f"ncbi_ftp_directory_url ({_listed(acc_to_context)})"
        )
        stats["still_missing"] = len(acc_to_context)
        for acc in acc_to_context:
            all_outcomes[acc] = AssemblyReportFetchResult(
                outcome=FetchOutcome.NOT_FOUND,
                message="no ncbi_ftp_directory_url",
            )
        return [], resolved_to_persist, stats, all_outcomes

    logger.info(
        f"{LOG_REPORT} downloading {len(acc_to_url)} assembly reports from the NCBI FTP "
        f"(concurrency={REPORT_CONCURRENCY}, raw copy stored for {len(raw_dests)})"
    )
    outcomes = await _fetch_report_outcomes(acc_to_url, concurrency=REPORT_CONCURRENCY, raw_dests=raw_dests)
    all_outcomes.update(outcomes)
    _log_fetch_round("first pass", outcomes)
    fetched, transient, not_found = _collect_successful_fetches(outcomes)

    for attempt, delay in enumerate(REPORT_RETRY_DELAYS, start=1):
        if not transient:
            break
        logger.info(
            f"{LOG_REPORT} retry {attempt}/{len(REPORT_RETRY_DELAYS)}: waiting {delay}s, then downloading again "
            f"{len(transient)} reports that hit network errors (concurrency={REPORT_RETRY_CONCURRENCY})"
        )
        await asyncio.sleep(delay)
        stats["transient_retries"] += len(transient)
        retry_outcomes = await _fetch_report_outcomes(transient, concurrency=REPORT_RETRY_CONCURRENCY, raw_dests=raw_dests)
        all_outcomes.update(retry_outcomes)
        _log_fetch_round(f"retry {attempt}/{len(REPORT_RETRY_DELAYS)}", retry_outcomes)
        retry_fetched, transient, retry_not_found = _collect_successful_fetches(retry_outcomes)
        fetched.extend(retry_fetched)
        for acc, url in retry_not_found.items():
            not_found.setdefault(acc, url)

    if transient:
        logger.warning(
            f"{LOG_REPORT} GIVING UP on {len(transient)} reports after {len(REPORT_RETRY_DELAYS)} retries "
            f"(network errors; raw_report_status becomes 'failed', the monthly retry job tries again): "
            f"{_listed(f'{a} ({all_outcomes[a].message})' for a in transient)}"
        )

    got_accs = {acc for acc, _ in fetched}
    not_found = {acc: url for acc, url in not_found.items() if acc not in got_accs}

    if not_found:
        logger.info(
            f"{LOG_REPORT} {len(not_found)} reports are not at their stored FTP path (HTTP 404); looking the "
            f"directory up again in the NCBI FTP listing: {_listed(not_found)}"
        )
        resolve_urls: dict[str, str] = {}
        for acc, _old_url in not_found.items():
            ctx = acc_to_context[acc]
            try:
                ftp = resolve_ncbi_ftp_paths(acc, ctx.assembly_name)
            except Exception as e:
                logger.warning(f"{LOG_PATH} {acc}: FTP directory lookup failed ({e}); keeping the stored path")
                continue
            if ftp:
                resolved_to_persist[acc] = ftp
                resolve_urls[acc] = ftp.assembly_report_url
        if resolve_urls:
            stats["resolved"] = len(resolve_urls)
            resolve_outcomes = await _fetch_report_outcomes(resolve_urls, concurrency=REPORT_RETRY_CONCURRENCY, raw_dests=raw_dests)
            all_outcomes.update(resolve_outcomes)
            _log_fetch_round("after FTP re-resolve", resolve_outcomes)
            resolve_fetched, _, _ = _collect_successful_fetches(resolve_outcomes)
            fetched.extend(resolve_fetched)
            got = {acc for acc, _ in resolve_fetched}
            for acc in resolve_urls:
                if acc not in got:
                    resolved_to_persist.pop(acc, None)  # do not store a path that did not work
            still = [a for a in not_found if a not in got]
            if still:
                logger.warning(
                    f"{LOG_REPORT} {len(still)} reports still not found after re-resolving the FTP directory "
                    f"(raw_report_status becomes 'missing', the monthly retry job tries again): {_listed(still)}"
                )

    for acc in acc_to_context:
        if acc not in all_outcomes:
            all_outcomes[acc] = AssemblyReportFetchResult(
                outcome=FetchOutcome.NOT_FOUND,
                message="assembly report fetch failed after retries",
            )

    stats["fetched"] = len(fetched)
    stats["still_missing"] = len(acc_to_context) - len({acc for acc, _ in fetched})
    return fetched, resolved_to_persist, stats, all_outcomes


def parse_bioprojects(assembly_info: dict, bioprojects_to_save: dict[str, BioProject]) -> list[str]:
    """
    Parse the bioprojects from the assembly info and return the list of accessions related to the assembly
    """
    
    accessions = set()
    lineages = assembly_info.get('bioproject_lineage', [])
    for lin in lineages:
        bioprojects = lin.get('bioprojects', [])
        for bioproject in bioprojects:
            accession = bioproject.get('accession')
            if not accession:
                continue
            accessions.add(accession)
            if accession in bioprojects_to_save: #already seen before
                continue
            bioprojects_to_save[accession] = BioProject(
                accession=accession,
                title=bioproject.get('title', accession), #accession is the title if not provided
            )
    return list(accessions)



REPORT_STATUS_PENDING = "pending"
REPORT_STATUS_OK = "ok"
REPORT_STATUS_FAILED = "failed"


def initial_assembly_report(assembly_level: str | None) -> AssemblyReportBackfill:
    """Non-chromosome assemblies do not need an NCBI assembly report on disk."""
    if seq_files.is_chromosome_level_assembly(assembly_level):
        return AssemblyReportBackfill(report_status=REPORT_STATUS_PENDING)
    return AssemblyReportBackfill(report_status=REPORT_STATUS_OK)


def chromosome_level_q() -> Q:
    q = Q()
    for level in seq_files.CHROMOSOME_LEVELS:
        q |= Q(assembly_level__iexact=level)
    return q


def assemblies_with_incomplete_report() -> Q:
    """Chromosome-level assemblies not yet synced or last fetch failed."""
    return chromosome_level_q() & Q(
        assembly_report__report_status__in=[REPORT_STATUS_PENDING, REPORT_STATUS_FAILED]
    )


def assemblies_with_complete_report() -> Q:
    """Non-chromosome assemblies or chromosome-level with report_status ok."""
    return ~chromosome_level_q() | Q(assembly_report__report_status=REPORT_STATUS_OK)


def assemblies_with_pending_report() -> Q:
    return chromosome_level_q() & Q(assembly_report__report_status=REPORT_STATUS_PENDING)


def assemblies_with_failed_report() -> Q:
    return Q(assembly_report__report_status=REPORT_STATUS_FAILED)


def count_raw_reports_not_ok(accessions: list[str] | None = None) -> int:
    qs = GenomeAssembly.objects()
    if accessions is not None:
        qs = qs.filter(assembly_accession__in=accessions)
    return qs.filter(assembly_report__raw_report_status__ne=RAW_STATUS_OK).count()


def count_incomplete_reports(accessions: list[str] | None = None) -> int:
    qs = GenomeAssembly.objects()
    if accessions is not None:
        qs = qs.filter(assembly_accession__in=accessions)
    return qs.filter(assemblies_with_incomplete_report()).count()


def _infer_report_status_from_legacy(row: GenomeAssembly) -> str:
    """Migration helper when assembly_report is missing (pre-embed or fetch_failed only)."""
    if getattr(row, "assembly_report_fetch_failed", False):
        return REPORT_STATUS_FAILED
    if not seq_files.is_chromosome_level_assembly(row.assembly_level):
        return REPORT_STATUS_OK
    if seq_files.chromosomes_file_exists(row.taxid, row.assembly_accession):
        return REPORT_STATUS_OK
    return REPORT_STATUS_PENDING


def assembly_report_status(row: GenomeAssembly) -> str:
    ar = row.assembly_report
    if ar and ar.report_status:
        return ar.report_status
    return _infer_report_status_from_legacy(row)


def _set_report_fields(accession: str, **fields) -> None:
    """
    Set fields of the embedded assembly_report. A dotted $set cannot create fields inside a null
    parent (MongoDB raises; other backends may silently skip), so a null/missing embed is created
    first. The guard only matches documents that really lack the embed.
    """
    GenomeAssembly.objects(assembly_accession=accession, assembly_report=None).update_one(
        set__assembly_report=AssemblyReportBackfill()
    )
    GenomeAssembly.objects(assembly_accession=accession).update_one(**fields)


def update_assembly_report(accession: str, status: str) -> None:
    _set_report_fields(
        accession,
        set__assembly_report__report_status=status,
        set__assembly_report__report_fetched_at=datetime.utcnow(),
    )


RAW_STATUS_PENDING = "pending"
RAW_STATUS_OK = "ok"
RAW_STATUS_FAILED = "failed"    # transient error, retried on the next sync
RAW_STATUS_MISSING = "missing"  # not found on NCBI, retried by the monthly job


def update_raw_report_status(accession: str, status: str) -> None:
    _set_report_fields(
        accession,
        set__assembly_report__raw_report_status=status,
        set__assembly_report__raw_report_fetched_at=datetime.utcnow(),
    )


def apply_raw_report_outcomes(
    outcomes: dict[str, AssemblyReportFetchResult],
    acc_to_taxid: dict[str, str],
) -> dict[str, int]:
    """Set raw_report_status from the fetch outcome; the file on disk is the source of truth."""
    counts = {RAW_STATUS_OK: 0, RAW_STATUS_FAILED: 0, RAW_STATUS_MISSING: 0}
    not_ok: dict[str, list[str]] = {RAW_STATUS_FAILED: [], RAW_STATUS_MISSING: []}
    for acc, result in outcomes.items():
        taxid = acc_to_taxid.get(acc)
        if taxid and result.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY) \
                and seq_files.assembly_report_file_exists(taxid, acc):
            status = RAW_STATUS_OK
        elif result.outcome == FetchOutcome.TRANSIENT:
            status = RAW_STATUS_FAILED
        else:
            status = RAW_STATUS_MISSING
        update_raw_report_status(acc, status)
        counts[status] += 1
        if status != RAW_STATUS_OK:
            not_ok[status].append(f"{acc} ({result.message or result.outcome.value})")
    if outcomes:
        logger.info(
            f"{LOG_STATUS} raw_report_status written for {len(outcomes)} assemblies: "
            f"ok={counts[RAW_STATUS_OK]}, failed={counts[RAW_STATUS_FAILED]}, missing={counts[RAW_STATUS_MISSING]}"
        )
    for status, items in not_ok.items():
        if items:
            logger.warning(f"{LOG_STATUS} raw_report_status='{status}' for {len(items)} assemblies: {_listed(items)}")
    return counts


def backfill_assembly_report_embed(accessions: list[str] | None = None) -> int:
    """Set assembly_report on documents missing status (legacy fetch_failed + disk)."""
    qs = GenomeAssembly.objects()
    if accessions is not None:
        qs = qs.filter(assembly_accession__in=accessions)
    updated = 0
    for row in qs.only(
        "assembly_accession",
        "taxid",
        "assembly_level",
        "assembly_report",
        "assembly_report_fetch_failed",
    ):
        if row.assembly_report and row.assembly_report.report_status:
            continue
        update_assembly_report(row.assembly_accession, _infer_report_status_from_legacy(row))
        updated += 1
    return updated


def apply_report_fetch_outcomes(
    outcomes: dict[str, AssemblyReportFetchResult],
    acc_to_taxid: dict[str, str],
) -> dict[str, int]:
    """
    Set the chromosome-files status (assembly_report.report_status) of chromosome-level assemblies:
    ok when chromosomes.json exists, failed otherwise (partial files are removed).
    """
    counts = {REPORT_STATUS_OK: 0, REPORT_STATUS_FAILED: 0}
    if not outcomes:
        return counts
    failed: list[str] = []
    for acc, result in outcomes.items():
        taxid = acc_to_taxid.get(acc)
        report_ok = result.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY)
        sync_ok = bool(taxid and report_ok and seq_files.chromosomes_file_exists(taxid, acc))
        if sync_ok:
            update_assembly_report(acc, REPORT_STATUS_OK)
            counts[REPORT_STATUS_OK] += 1
        else:
            if taxid:
                seq_files.delete_partial_sequence_files(taxid, acc)
            update_assembly_report(acc, REPORT_STATUS_FAILED)
            counts[REPORT_STATUS_FAILED] += 1
            reason = (
                "report could not be downloaded, so there was nothing to generate them from"
                if not report_ok
                else "report downloaded but chromosomes.json was not written"
            )
            failed.append(f"{acc} ({reason})")
    logger.info(
        f"{LOG_STATUS} chromosome-files status (report_status) written for {len(outcomes)} chromosome-level "
        f"assemblies: ok={counts[REPORT_STATUS_OK]}, failed={counts[REPORT_STATUS_FAILED]}"
    )
    if failed:
        logger.warning(
            f"{LOG_CHR} chromosomes.json / chr_aliases.tsv NOT available for {len(failed)} assemblies "
            f"(report_status='failed'; partial files removed): {_listed(failed)}"
        )
    return counts


def _fmt_duration(seconds: float) -> str:
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}h{m:02d}m{sec:02d}s" if h else f"{m}m{sec:02d}s" if m else f"{sec}s"


def log_sync_summary(stats: dict, elapsed: float) -> None:
    """The end-of-run summary, one concern per line (see the LOG_* tags)."""
    logger.info(f"{LOG_SYNC} DONE in {_fmt_duration(elapsed)} for {stats.get('targets', 0)} assemblies")
    logger.info(
        f"{LOG_PATH} summary: from NCBI summaries={stats.get('paths_updated', 0)}, "
        f"found by FTP directory scrape={stats.get('paths_resolved_by_scrape', 0)}, "
        f"without any FTP directory={stats.get('without_ftp_path', 0)}"
    )
    logger.info(
        f"{LOG_REPORT} summary: reports downloaded={stats.get('sequences_fetched', 0)}, "
        f"already complete (skipped)={stats.get('paths_skipped_complete', 0)}, "
        f"assemblies whose raw report is still not 'ok'={stats.get('still_missing_raw_reports', 0)}"
    )
    logger.info(
        f"{LOG_CHR} summary: chromosome-level assemblies still without chromosome files="
        f"{stats.get('still_missing_sequences', 0)}"
    )


def sync_assemblies_ftp_and_sequences(
    accessions: list[str] | None = None,
    *,
    overwrite_sequences: bool = False,
    chunk_size: int = 500,
) -> dict:
    """
    Resolve FTP paths, store the raw assembly report of every assembly and generate
    chromosomes.json + chr_aliases.tsv for chromosome-level ones. See _sync_assemblies_impl.
    Logs a plan, one line per chunk and a final summary, each line tagged by concern.
    """
    started = time.monotonic()
    stats = _sync_assemblies_impl(
        accessions, overwrite_sequences=overwrite_sequences, chunk_size=chunk_size
    )
    log_sync_summary(stats, time.monotonic() - started)
    return stats


def _sync_assemblies_impl(
    accessions: list[str] | None = None,
    *,
    overwrite_sequences: bool = False,
    chunk_size: int = 500,
) -> dict:
    """
    Update FTP paths from local NCBI assembly summaries and write chromosomes.json + chr_aliases.tsv.
    Summaries are downloaded when missing or when NCBI Last-Modified differs from local cache.
    When overwrite_sequences is True, re-fetch assembly reports even if chromosomes.json exists.
    """
    stats: dict = {
        "targets": 0,
        "summaries_downloaded": [],
        "summaries_skipped": [],
        "summaries_failed": [],
        "orphans": 0,
        "orphans_resolved_from_historical": 0,
        "paths_updated": 0,
        "paths_resolved_by_scrape": 0,
        "paths_skipped_complete": 0,
        "sequences_fetched": 0,
        "still_missing_path": 0,
        "still_missing_sequences": 0,
    }

    if accessions is None:
        target_list = list(GenomeAssembly.objects().scalar("assembly_accession"))
    else:
        target_list = list(accessions)
    target_set = set(target_list)
    stats["targets"] = len(target_set)
    logger.info(
        f"{LOG_SYNC} START: {len(target_set)} assemblies, chunk_size={chunk_size}, "
        f"re-download existing files={overwrite_sequences}"
    )
    if not target_set:
        return stats

    stats["assembly_report_backfilled"] = backfill_assembly_report_embed(target_list)
    if stats["assembly_report_backfilled"]:
        logger.info(f"{LOG_STATUS} created the missing report status of {stats['assembly_report_backfilled']} legacy assemblies")

    summary_dir = assembly_summary_service.assembly_summaries_dir()
    ftp_path_index: dict[str, str] = {}

    current_dl = assembly_summary_service.download_current_assembly_summaries(
        summary_dir
    )
    stats["summaries_downloaded"].extend(current_dl.get("downloaded", []))
    stats["summaries_skipped"].extend(current_dl.get("skipped", []))
    stats["summaries_failed"].extend(current_dl.get("failed", []))
    logger.info(
        f"{LOG_PATH} NCBI assembly summaries (current): downloaded={len(current_dl.get('downloaded', []))}, "
        f"up to date={len(current_dl.get('skipped', []))}, failed={len(current_dl.get('failed', []))}"
    )
    if current_dl.get("failed"):
        logger.warning(f"{LOG_PATH} could not download summaries: {_listed(current_dl['failed'])}")

    ftp_path_index = assembly_summary_service.build_ftp_path_index(
        summary_dir, target_set, include_historical=False
    )
    logger.info(f"{LOG_PATH} {len(ftp_path_index)} of {len(target_set)} assemblies have a path in the current summaries")

    orphans = target_set - set(ftp_path_index.keys())
    stats["orphans"] = len(orphans)
    if orphans:
        logger.info(
            f"{LOG_PATH} {len(orphans)} assemblies are not in the current summaries (suppressed or "
            f"replaced); checking the historical summaries"
        )
        hist_dl = assembly_summary_service.download_historical_assembly_summaries(
            summary_dir
        )
        stats["summaries_downloaded"].extend(hist_dl.get("downloaded", []))
        stats["summaries_skipped"].extend(hist_dl.get("skipped", []))
        stats["summaries_failed"].extend(hist_dl.get("failed", []))
        resolved = assembly_summary_service.merge_historical_paths_for_orphans(
            summary_dir, orphans, ftp_path_index
        )
        stats["orphans_resolved_from_historical"] = resolved
        logger.info(f"{LOG_PATH} historical summaries: found a path for {resolved} of those {len(orphans)} assemblies")

    accessions_needing_sequences: list[str] = []
    accessions_for_path_update: dict[str, str] = {}
    acc_to_taxid: dict[str, str] = {}
    no_ftp_path: list[str] = []        # no stored FTP directory and none found this run
    chromosome_accs: set[str] = set()  # need chromosomes.json + chr_aliases.tsv
    raw_needed: set[str] = set()       # need assembly_report.txt

    assemblies = GenomeAssembly.objects(assembly_accession__in=target_list).only(
        "assembly_accession",
        "assembly_name",
        "assembly_level",
        "taxid",
        "assembly_stats",
        "ncbi_ftp_directory_url",
        "download_url",
        "assembly_report",
    )
    for assembly in assemblies:
        acc = assembly.assembly_accession
        acc_to_taxid[acc] = assembly.taxid
        has_real_dir = bool(assembly.ncbi_ftp_directory_url)
        is_chromosome = seq_files.is_chromosome_level_assembly(assembly.assembly_level)

        raw_complete = (not overwrite_sequences) and seq_files.assembly_report_file_exists(assembly.taxid, acc)
        if raw_complete and (assembly.assembly_report is None or assembly.assembly_report.raw_report_status != RAW_STATUS_OK):
            update_raw_report_status(acc, RAW_STATUS_OK)
        if is_chromosome and not overwrite_sequences and seq_files.chromosomes_file_exists(assembly.taxid, acc):
            if assembly_report_status(assembly) != REPORT_STATUS_OK:
                update_assembly_report(acc, REPORT_STATUS_OK)
            if raw_complete:
                stats["paths_skipped_complete"] += 1
                continue
            chromosomes_needed = False
        else:
            chromosomes_needed = is_chromosome
        if raw_complete and not chromosomes_needed:
            stats["paths_skipped_complete"] += 1
            continue

        # FTP path / download_url resolution runs for every assembly (chromosome-level
        # or not); only chromosome-level assemblies additionally need report/sequence files.
        ftp_path = ftp_path_index.get(acc)
        resolution = resolution_from_summary_ftp_path(ftp_path) if ftp_path else None
        if resolution:
            GenomeAssembly.objects(assembly_accession=acc).update_one(
                set__ncbi_ftp_directory_url=resolution.directory_url,
                set__download_url=resolution.download_url,
            )
            stats["paths_updated"] += 1
            accessions_for_path_update[acc] = resolution.directory_url
        elif not has_real_dir:
            # Summaries have no usable path (e.g. suppressed assemblies list `na`): look the
            # accession up in the NCBI FTP level directory. Scrape only (no name-based guess),
            # so an unverified URL is never stored.
            logger.info(f"{LOG_PATH} {acc}: no usable path in the NCBI summaries, looking it up in the NCBI FTP listing")
            try:
                scraped = resolve_ncbi_ftp_paths(acc)
                if not scraped:
                    logger.info(f"{LOG_PATH} {acc}: not in the NCBI FTP listing either (reported below as having no FTP directory)")
                if scraped:
                    GenomeAssembly.objects(assembly_accession=acc).update_one(
                        set__ncbi_ftp_directory_url=scraped.directory_url,
                        set__download_url=scraped.download_url,
                    )
                    stats["paths_resolved_by_scrape"] += 1
                    accessions_for_path_update[acc] = scraped.directory_url
                    logger.info(f"{LOG_PATH} {acc}: found {scraped.directory_url} (saved ncbi_ftp_directory_url and download_url)")
            except Exception as e:  # one bad assembly must not abort the whole sync
                logger.error(f"{LOG_PATH} {acc}: FTP listing lookup failed, skipping it this run: {e}")

        if not has_real_dir and acc not in accessions_for_path_update:
            no_ftp_path.append(acc)

        if is_chromosome and chromosomes_needed:
            accessions_needing_sequences.append(acc)
            chromosome_accs.add(acc)
        if not raw_complete:
            raw_needed.add(acc)
            if acc not in accessions_needing_sequences:
                accessions_needing_sequences.append(acc)

    still_missing_path = [
        acc for acc in target_set if acc not in ftp_path_index and acc not in accessions_for_path_update
    ]
    stats["still_missing_path"] = len(still_missing_path)
    logger.info(
        f"{LOG_SYNC} PLAN: already complete (skipped)={stats['paths_skipped_complete']}, "
        f"raw reports to download={len(raw_needed)}, "
        f"chromosome files to generate={len(chromosome_accs)} (chromosome-level assemblies only)"
    )
    stats["without_ftp_path"] = len(no_ftp_path)
    if no_ftp_path:
        logger.warning(
            f"{LOG_PATH} {len(no_ftp_path)} assemblies have NO FTP directory (not stored, not in the NCBI "
            f"summaries, not in the FTP listing), their report cannot be downloaded: {_listed(sorted(no_ftp_path))}"
        )

    if not accessions_needing_sequences:
        logger.info(f"{LOG_SYNC} nothing to download or generate")
        stats["still_missing_raw_reports"] = count_raw_reports_not_ok(list(target_set))
        stats["still_missing_sequences"] = count_incomplete_reports(list(target_set))
        return stats

    items = list(accessions_needing_sequences)
    total_fetched = 0
    n_chunks = (len(items) + chunk_size - 1) // chunk_size
    for i in range(0, len(items), chunk_size):
        chunk_accs = items[i : i + chunk_size]
        logger.info(
            f"{LOG_SYNC} chunk {i // chunk_size + 1}/{n_chunks}: {len(chunk_accs)} assemblies "
            f"(raw reports to download: {sum(a in raw_needed for a in chunk_accs)}, "
            f"chromosome files to generate: {sum(a in chromosome_accs for a in chunk_accs)})"
        )
        acc_to_context: dict[str, AssemblyFtpContext] = {}
        for row in GenomeAssembly.objects(assembly_accession__in=chunk_accs).only(
            "assembly_accession", "assembly_name", "ncbi_ftp_directory_url"
        ):
            if not row.ncbi_ftp_directory_url:
                continue
            acc_to_context[row.assembly_accession] = AssemblyFtpContext(
                assembly_name=row.assembly_name,
                ncbi_ftp_directory_url=row.ncbi_ftp_directory_url,
                raw_dest=(
                    seq_files.assembly_report_path(acc_to_taxid[row.assembly_accession], row.assembly_accession)
                    if row.assembly_accession in raw_needed and acc_to_taxid.get(row.assembly_accession)
                    else None
                ),
            )

        chunk_outcomes: dict[str, AssemblyReportFetchResult] = {}
        for acc in chunk_accs:
            if acc not in acc_to_context:
                chunk_outcomes[acc] = AssemblyReportFetchResult(
                    outcome=FetchOutcome.NOT_FOUND,
                    message="no ncbi_ftp_directory_url",
                )

        if acc_to_context:
            fetched, resolved_to_persist, chunk_stats, fetch_outcomes = asyncio.run(
                fetch_reports_with_retry(acc_to_context)
            )
            _persist_resolved_ftp_paths(resolved_to_persist)
            chunk_outcomes.update(fetch_outcomes)
            chromosome_inputs = [(a, d) for a, d in fetched if a in chromosome_accs]
            if chromosome_inputs:
                logger.info(f"{LOG_CHR} generating chromosomes.json + chr_aliases.tsv for {len(chromosome_inputs)} assemblies from the stored reports")
            save_chromosome_files(chromosome_inputs, acc_to_taxid)
            total_fetched += chunk_stats.get("fetched", 0)

        apply_report_fetch_outcomes(
            {a: o for a, o in chunk_outcomes.items() if a in chromosome_accs}, acc_to_taxid
        )
        apply_raw_report_outcomes(
            {a: o for a, o in chunk_outcomes.items() if a in raw_needed}, acc_to_taxid
        )

        if i + chunk_size < len(items):
            time.sleep(1)

    stats["sequences_fetched"] = total_fetched
    stats["still_missing_raw_reports"] = count_raw_reports_not_ok(list(target_set))
    stats["still_missing_sequences"] = count_incomplete_reports(list(target_set))
    return stats


def normalize_taxid(value) -> str | None:
    """The tax id as a string of digits, or None when NCBI sent none (str(None) would give "None")."""
    text = str(value).strip() if value is not None else ""
    return text if text.isdigit() else None


def parse_assembly_from_ncbi(assembly_dict: dict, valid_lineages: dict[str, list[str]], bioprojects: dict[str, BioProject]) -> GenomeAssembly | None:
    taxid_value = normalize_taxid((assembly_dict.get('organism') or {}).get('tax_id'))
    if taxid_value is None:
        logger.warning(f"{LOG_IMPORT} skipping {assembly_dict.get('accession')}: NCBI reported no tax id (retried by the next import)")
        return None
    assembly_stats = assembly_dict.get('assembly_stats', dict())
    assembly_info = assembly_dict.get('assembly_info', dict())
    organism_info = assembly_dict.get('organism', dict())
    bp_accessions = parse_bioprojects(assembly_info, bioprojects) #keep collecting the bioprojects accessions:BioProject objects
    accession = assembly_dict.get('accession')
    assembly_name = assembly_info.get('assembly_name')
    return GenomeAssembly(
        assembly_accession=accession,
        paired_assembly_accession=assembly_dict.get('paired_accession'),
        assembly_name=assembly_name,
        organism_name=organism_info.get('organism_name'),
        assembly_level=assembly_info.get('assembly_level'),
        assembly_status=assembly_info.get('assembly_status'),
        assembly_type=assembly_info.get('assembly_type'),
        refseq_category=assembly_info.get('refseq_category'),
        taxid=taxid_value,
        ncbi_ftp_directory_url=None,
        download_url=placeholder_download_url(accession),
        assembly_report=initial_assembly_report(assembly_info.get("assembly_level")),
        assembly_stats=AssemblyStats(**assembly_stats),
        source_database=assembly_dict.get('source_database'),
        taxon_lineage=valid_lineages.get(taxid_value, []),
        release_date=assembly_info.get('release_date'),
        submitter=assembly_info.get('submitter'),
        bioprojects=bp_accessions,
    )


def _relocate_after_taxid_change(assembly_accession: str, previous_taxid: str, new_taxid: str) -> None:
    """Move the assembly's files (annotations and assembly-level) to the new taxid folder."""
    from . import file_layout
    try:
        stats = file_layout.relocate_assembly(
            assembly_accession, new_taxid, old_taxids={str(previous_taxid)})
        logger.info(f"{LOG_IMPORT} taxid of {assembly_accession} changed {previous_taxid} -> {new_taxid}; moved files: {stats}")
    except Exception as e:  # the taxid update itself must not fail; the backfill job repairs it
        logger.error(f"{LOG_IMPORT} could not move the files of {assembly_accession} after its taxid changed: {e}")


def update_assemblies_from_ncbi_report(ncbi_report: dict):
    """
    Update the assemblies from the NCBI report
    """
    results = ncbi_report.get('reports', [])
    accessions = [assembly.get('accession') for assembly in results]
    acc_to_ass_map = {ass.assembly_accession: ass for ass in GenomeAssembly.objects(assembly_accession__in=accessions)}
    for assembly in results:
        assembly_info = assembly.get('assembly_info', dict())
        organism_info = assembly.get('organism', dict())
        taxid = normalize_taxid(organism_info.get('tax_id'))
        organism_name = organism_info.get('organism_name')
        if not assembly_info:
            continue
        if taxid is None:
            logger.warning(f"{LOG_IMPORT} NCBI reported no tax id for {assembly.get('accession')}: keeping the stored taxid")
        assembly_object = acc_to_ass_map.get(assembly.get('accession'))
        if not assembly_object:
            continue
        update_payload = dict()
        if assembly_object.assembly_status != assembly_info.get('assembly_status'):
            update_payload['assembly_status'] = assembly_info.get('assembly_status')
        update_payload['paired_assembly_accession'] = assembly.get('paired_accession', None)
        if assembly_object.refseq_category != assembly_info.get('refseq_category'):
            update_payload['refseq_category'] = assembly_info.get('refseq_category')
        if assembly_object.organism_name != organism_name:
            update_payload['organism_name'] = organism_name
        previous_taxid = assembly_object.taxid
        taxid_changed = taxid is not None and previous_taxid != taxid
        if taxid_changed:
            update_payload['taxid'] = taxid
            #clean up taxon lineage if taxid changed
            update_payload['taxon_lineage'] = []
        if update_payload:  
            assembly_object.modify(**update_payload)
        if taxid_changed:
            _relocate_after_taxid_change(assembly_object.assembly_accession, previous_taxid, taxid)


def update_assemblies_from_ncbi(accessions: list[str], tmp_dir: str, batch_size: int=1000):
    """
    Fetch assemblies from NCBI Datasets and update the db with the updated fields if any field has changed
    """
    batches = create_batches(accessions, batch_size)
    files_to_delete = []
    try:
        for idx, batch in enumerate(batches):
            if idx > 0:
                time.sleep(1)
            assemblies_path = os.path.join(tmp_dir, f'assemblies_to_update_{idx}_{len(batch)}.txt')
            files_to_delete.append(assemblies_path)
            with open(assemblies_path, 'w') as f:
                for accession in batch:
                    f.write(accession + '\n')
            cmd = ['genome', 'accession', '--inputfile', assemblies_path]
            ncbi_report = ncbi_datasets_client.get_data_from_ncbi(cmd)
            if ncbi_report:
                update_assemblies_from_ncbi_report(ncbi_report)
    except Exception as e:
        logger.error(f"{LOG_IMPORT} error while refreshing assemblies from NCBI: {e}")
    finally:
        #delete the tmp files
        for file_to_delete in files_to_delete:
            if os.path.exists(file_to_delete):
                os.remove(file_to_delete)
        logger.info(f"{LOG_IMPORT} finished refreshing assemblies from NCBI")


def build_assembly_lookup(accessions: list[str], fields: list[str]=['assembly_accession', 'taxid', 'organism_name', 'taxon_lineage']) -> dict[str, GenomeAssembly]:
    """
    Build a lookup dictionary of assemblies by accession, this is used to quickly get the assembly by accession
    """
    return {
        a.assembly_accession: a
        for a in GenomeAssembly.objects(
            assembly_accession__in=accessions
        ).only(*fields)
    }