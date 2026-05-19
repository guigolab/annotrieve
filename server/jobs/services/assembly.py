import os
import re
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

FTP_BASE = "https://ftp.ncbi.nlm.nih.gov/genomes/all"
NCBI_FTP_SITE = "https://ftp.ncbi.nlm.nih.gov"
PLACEHOLDER_DOWNLOAD_URL_PREFIX = "http://localhost/annotrieve/pending/"
REQUEST_TIMEOUT = 15
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
        print(f"Found {len(new_accessions)} new assemblies to fetch")
        saved_accessions = fetch_new_assemblies_and_bioprojects(
            list(new_accessions), tmp_dir, valid_lineages, batch_size
        )
        if saved_accessions:
            print(f"Saved {len(saved_accessions)} new assemblies (FTP/sequences deferred to sync job)")
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
        assemblies_to_save: list[GenomeAssembly] = [
            parse_assembly_from_ncbi(assembly, valid_lineages, bioprojects_to_save) 
            for assembly in ncbi_report.get('reports', [])
        ]
        if not assemblies_to_save:
            print(f"No assemblies found in {assemblies_path} from NCBI, continuing...")
            continue
        found_accessions = [assembly.assembly_accession for assembly in assemblies_to_save]
        try:
            GenomeAssembly.objects.insert(assemblies_to_save)
            saved_accessions.extend(found_accessions)
        except Exception as e:
            print(f"Error upserting assembly batch: {e}")
            #delete the assemblies that were saved, we will retry it in the next job
            GenomeAssembly.objects(assembly_accession__in=found_accessions).delete()
            continue
    existing_bioprojects = BioProject.objects(accession__in=list(bioprojects_to_save.keys())).scalar('accession')
    bioprojects_to_save = {accession: bioproject for accession, bioproject in bioprojects_to_save.items() if accession not in existing_bioprojects}
    if bioprojects_to_save:
        #filter out existing bioprojects
        try:
            BioProject.objects.insert(list(bioprojects_to_save.values()))
        except Exception as e:
            print(f"Error upserting bioproject batch: {e}")
            #delete the bioprojects that were saved
            BioProject.objects(accession__in=list(bioprojects_to_save.keys())).delete()        
            raise e
    return saved_accessions


def save_chromosome_files(
    chromosomes_tuples: list[tuple[str, list[AssemblyReportSequence]]],
    acc_to_taxid: dict[str, str],
) -> dict[str, int]:
    """Write chromosomes.json + chr_aliases.tsv for each assembly (assembled-molecule rows)."""
    written: dict[str, int] = {}
    for assembly_accession, fetched_data in chromosomes_tuples:
        taxid = acc_to_taxid.get(assembly_accession)
        if not taxid:
            print(f"Skipping chromosome files for {assembly_accession}: missing taxid")
            continue
        molecules = seq_files.filter_assembled_molecules(fetched_data)
        seq_files.write_chromosomes(taxid, assembly_accession, molecules)
        seq_files.write_chr_aliases(taxid, assembly_accession, molecules)
        written[assembly_accession] = len(molecules)
    return written


async def parse_assembly_report_stream(
    resp: aiohttp.ClientResponse,
) -> list[AssemblyReportSequence]:
    """
    Stream and parse the assembly report. Returns assembled-molecule rows in report order.
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
            print(f"Failed to persist FTP paths for {accession}: {e}")


def _classify_http_status(status: int) -> FetchOutcome:
    if status == 404:
        return FetchOutcome.NOT_FOUND
    if status in (408, 429, 500, 502, 503, 504):
        return FetchOutcome.TRANSIENT
    return FetchOutcome.NOT_FOUND


async def get_assembly_report_result(
    session: aiohttp.ClientSession,
    url: str,
) -> AssemblyReportFetchResult:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)) as resp:
            status = resp.status
            if status != 200:
                return AssemblyReportFetchResult(
                    outcome=_classify_http_status(status),
                    url=url,
                    status=status,
                    message=f"HTTP {status}",
                )
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
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        return AssemblyReportFetchResult(
            outcome=FetchOutcome.TRANSIENT,
            url=url,
            message=str(e),
        )
    except Exception as e:
        return AssemblyReportFetchResult(
            outcome=FetchOutcome.TRANSIENT,
            url=url,
            message=str(e),
        )


async def _fetch_report_outcomes(
    acc_to_url: dict[str, str],
    concurrency: int = 10,
) -> dict[str, AssemblyReportFetchResult]:
    outcomes: dict[str, AssemblyReportFetchResult] = {}
    sem = asyncio.Semaphore(concurrency)

    async with aiohttp.ClientSession() as session:
        async def bound_fetch(accession: str, url: str) -> None:
            async with sem:
                outcomes[accession] = await get_assembly_report_result(
                    session, url
                )

        await asyncio.gather(
            *(bound_fetch(acc, url) for acc, url in acc_to_url.items())
        )
    return outcomes


def _collect_successful_fetches(
    outcomes: dict[str, AssemblyReportFetchResult],
) -> tuple[list[tuple[str, list[AssemblyReportSequence]]], dict[str, str], dict[str, str]]:
    fetched: list[tuple[str, list[AssemblyReportSequence]]] = []
    transient: dict[str, str] = {}
    not_found: dict[str, str] = {}
    for acc, result in outcomes.items():
        if result.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY):
            if result.outcome == FetchOutcome.PARSE_EMPTY:
                print(f"Assembly report empty for {acc}: {result.url}")
            fetched.append((acc, result.data or []))
        elif result.outcome == FetchOutcome.TRANSIENT:
            transient[acc] = result.url
            print(f"Transient fetch error for {acc}: {result.message}")
        else:
            not_found[acc] = result.url
            print(f"Assembly report not found for {acc}: {result.message} ({result.url})")
    return fetched, transient, not_found


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

    all_outcomes: dict[str, AssemblyReportFetchResult] = {}

    if not acc_to_url:
        stats["still_missing"] = len(acc_to_context)
        for acc in acc_to_context:
            all_outcomes[acc] = AssemblyReportFetchResult(
                outcome=FetchOutcome.NOT_FOUND,
                message="no ncbi_ftp_directory_url",
            )
        return [], resolved_to_persist, stats, all_outcomes

    outcomes = await _fetch_report_outcomes(acc_to_url, concurrency=10)
    all_outcomes.update(outcomes)
    fetched, transient, not_found = _collect_successful_fetches(outcomes)

    for delay in (2, 4, 8):
        if not transient:
            break
        await asyncio.sleep(delay)
        stats["transient_retries"] += len(transient)
        retry_outcomes = await _fetch_report_outcomes(transient, concurrency=5)
        all_outcomes.update(retry_outcomes)
        retry_fetched, transient, retry_not_found = _collect_successful_fetches(retry_outcomes)
        fetched.extend(retry_fetched)
        for acc, url in retry_not_found.items():
            not_found.setdefault(acc, url)

    got_accs = {acc for acc, _ in fetched}
    not_found = {acc: url for acc, url in not_found.items() if acc not in got_accs}

    if not_found:
        print(f"Re-resolving FTP paths for {len(not_found)} assemblies after not-found")
        resolve_urls: dict[str, str] = {}
        for acc, _old_url in not_found.items():
            ctx = acc_to_context[acc]
            ftp = resolve_ncbi_ftp_paths(acc, ctx.assembly_name)
            if ftp:
                resolved_to_persist[acc] = ftp
                resolve_urls[acc] = ftp.assembly_report_url
        if resolve_urls:
            stats["resolved"] = len(resolve_urls)
            resolve_outcomes = await _fetch_report_outcomes(resolve_urls, concurrency=5)
            all_outcomes.update(resolve_outcomes)
            resolve_fetched, _, _ = _collect_successful_fetches(resolve_outcomes)
            fetched.extend(resolve_fetched)
            got = {acc for acc, _ in resolve_fetched}
            still = len(not_found) - len(got)
            if still > 0:
                print(f"After FTP re-resolve: {len(got)} recovered, {still} still missing")

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


def update_assembly_report(accession: str, status: str) -> None:
    GenomeAssembly.objects(assembly_accession=accession).update_one(
        set__assembly_report=AssemblyReportBackfill(
            report_status=status,
            report_fetched_at=datetime.utcnow(),
        )
    )


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
) -> None:
    if not outcomes:
        return
    for acc, result in outcomes.items():
        taxid = acc_to_taxid.get(acc)
        sync_ok = (
            taxid
            and result.outcome in (FetchOutcome.OK, FetchOutcome.PARSE_EMPTY)
            and seq_files.chromosomes_file_exists(taxid, acc)
        )
        if sync_ok:
            update_assembly_report(acc, REPORT_STATUS_OK)
        else:
            if taxid:
                seq_files.delete_partial_sequence_files(taxid, acc)
            update_assembly_report(acc, REPORT_STATUS_FAILED)


def sync_assemblies_ftp_and_sequences(
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
    if not target_set:
        return stats

    stats["assembly_report_backfilled"] = backfill_assembly_report_embed(target_list)

    summary_dir = assembly_summary_service.assembly_summaries_dir()
    ftp_path_index: dict[str, str] = {}

    current_dl = assembly_summary_service.download_current_assembly_summaries(
        summary_dir
    )
    stats["summaries_downloaded"].extend(current_dl.get("downloaded", []))
    stats["summaries_skipped"].extend(current_dl.get("skipped", []))
    stats["summaries_failed"].extend(current_dl.get("failed", []))

    ftp_path_index = assembly_summary_service.build_ftp_path_index(
        summary_dir, target_set, include_historical=False
    )

    orphans = target_set - set(ftp_path_index.keys())
    stats["orphans"] = len(orphans)
    if orphans:
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

    accessions_needing_sequences: list[str] = []
    accessions_for_path_update: dict[str, str] = {}
    acc_to_taxid: dict[str, str] = {}

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
        if not seq_files.is_chromosome_level_assembly(assembly.assembly_level):
            continue
        has_chromosomes = seq_files.chromosomes_file_exists(assembly.taxid, acc)
        if not overwrite_sequences and has_chromosomes:
            if assembly_report_status(assembly) != REPORT_STATUS_OK:
                update_assembly_report(acc, REPORT_STATUS_OK)
            stats["paths_skipped_complete"] += 1
            continue

        ftp_path = ftp_path_index.get(acc)
        path_just_updated = False
        if ftp_path:
            resolution = resolution_from_summary_ftp_path(ftp_path)
            if resolution:
                GenomeAssembly.objects(assembly_accession=acc).update_one(
                    set__ncbi_ftp_directory_url=resolution.directory_url,
                    set__download_url=resolution.download_url,
                )
                stats["paths_updated"] += 1
                accessions_for_path_update[acc] = resolution.directory_url
                path_just_updated = not has_real_dir
        elif not has_real_dir:
            print(f"No ftp_path in assembly summaries for {acc}")

        if overwrite_sequences or path_just_updated or not seq_files.chromosomes_file_exists(assembly.taxid, acc):
            accessions_needing_sequences.append(acc)

    still_missing_path = [
        acc for acc in target_set if acc not in ftp_path_index and acc not in accessions_for_path_update
    ]
    stats["still_missing_path"] = len(still_missing_path)

    if not accessions_needing_sequences:
        stats["still_missing_sequences"] = count_incomplete_reports(list(target_set))
        return stats

    items = list(accessions_needing_sequences)
    total_fetched = 0
    for i in range(0, len(items), chunk_size):
        chunk_accs = items[i : i + chunk_size]
        acc_to_context: dict[str, AssemblyFtpContext] = {}
        for row in GenomeAssembly.objects(assembly_accession__in=chunk_accs).only(
            "assembly_accession", "assembly_name", "ncbi_ftp_directory_url"
        ):
            if not row.ncbi_ftp_directory_url:
                continue
            acc_to_context[row.assembly_accession] = AssemblyFtpContext(
                assembly_name=row.assembly_name,
                ncbi_ftp_directory_url=row.ncbi_ftp_directory_url,
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
            save_chromosome_files(fetched, acc_to_taxid)
            total_fetched += chunk_stats.get("fetched", 0)

        apply_report_fetch_outcomes(chunk_outcomes, acc_to_taxid)

        if i + chunk_size < len(items):
            time.sleep(1)

    stats["sequences_fetched"] = total_fetched
    stats["still_missing_sequences"] = count_incomplete_reports(list(target_set))
    return stats


def parse_assembly_from_ncbi(assembly_dict: dict, valid_lineages: dict[str, list[str]], bioprojects: dict[str, BioProject]) -> GenomeAssembly:
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
        taxid=str(organism_info.get('tax_id')),
        ncbi_ftp_directory_url=None,
        download_url=placeholder_download_url(accession),
        assembly_report=initial_assembly_report(assembly_info.get("assembly_level")),
        assembly_stats=AssemblyStats(**assembly_stats),
        source_database=assembly_dict.get('source_database'),
        taxon_lineage=valid_lineages.get(str(organism_info.get('tax_id')), []),
        release_date=assembly_info.get('release_date'),
        submitter=assembly_info.get('submitter'),
        bioprojects=bp_accessions,
    )


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
        taxid = str(organism_info.get('tax_id'))
        organism_name = organism_info.get('organism_name')
        if not assembly_info:
            continue
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
        if assembly_object.taxid != taxid:
            update_payload['taxid'] = taxid
            #clean up taxon lineage if taxid changed
            update_payload['taxon_lineage'] = []
        if update_payload:  
            assembly_object.modify(**update_payload)


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
        print(f"Error updating data: {e}")
    finally:
        #delete the tmp files
        for file_to_delete in files_to_delete:
            if os.path.exists(file_to_delete):
                os.remove(file_to_delete)
        print("Updated assemblies")


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