"""
Monthly backfill of `source_file_info.provider` from the genome-annotation-tracker TSVs.

Only the provider is touched here: assembly / taxonomy metadata is maintained by the `updates`
jobs, and the import job deliberately skips rows whose (url, md5) pair is already stored, so a
provider that the tracker later refines (e.g. `community` -> `community_ipk`) would never reach
the database otherwise.

Safety rules (this runs against production data):
- a TSV row is applied only when BOTH the stored `url_path` and `uncompressed_md5` equal the
  row's `access_url` / `md5_checksum` (same pair the import uses to decide "already imported");
- empty providers in the TSV never overwrite a stored value;
- a url listed more than once with different providers is ambiguous and skipped;
- a TSV that cannot be fetched (empty result) contributes nothing; absence never deletes or blanks;
- only `source_file_info.provider` is written (`$set` on that one field).
"""
import logging
from collections import Counter

from celery import shared_task

from db.models import GenomeAnnotation
from .import_annotations import URLS_TO_FETCH
from .services import annotation as annotation_service
from .services.utils import create_batches

logger = logging.getLogger(__name__)

LOOKUP_BATCH_SIZE = 1000
SAMPLE_SIZE = 20


def collect_tsv_providers(urls: list[str]) -> tuple[dict[str, tuple[str, str]], dict]:
    """
    Fetch the TSVs and return ({access_url: (md5, provider)}, report).
    Rows without url/md5/provider are ignored; urls with conflicting providers are dropped.
    """
    wanted: dict[str, tuple[str, str]] = {}
    ambiguous: set[str] = set()
    report = {"files_failed": [], "tsv_rows": 0, "tsv_without_provider": 0, "ambiguous_urls": 0}
    for url in urls:
        rows = annotation_service.fetch_from_url(url)
        if not rows:
            report["files_failed"].append(url)
            continue
        for row in rows:
            report["tsv_rows"] += 1
            access_url = (row.access_url or "").strip()
            md5 = (row.md5_checksum or "").strip()
            provider = (row.annotation_provider or "").strip()
            if not access_url or not md5:
                continue
            if not provider:
                report["tsv_without_provider"] += 1
                continue
            previous = wanted.get(access_url)
            if previous is not None and previous != (md5, provider):
                ambiguous.add(access_url)
                continue
            wanted[access_url] = (md5, provider)
    for access_url in ambiguous:
        wanted.pop(access_url, None)
    report["ambiguous_urls"] = len(ambiguous)
    return wanted, report


@shared_task(name="backfill_annotation_providers", ignore_result=False)
def backfill_annotation_providers(dry_run: bool = False):
    """
    Set `source_file_info.provider` of stored annotations to the provider currently published
    in the tracker TSVs. Returns counts (and a sample of the changes); `dry_run` writes nothing.
    """
    wanted, report = collect_tsv_providers(URLS_TO_FETCH)
    counts = Counter(matched=0, unchanged=0, updated=0, md5_differs=0)
    transitions: Counter = Counter()
    sample: list[dict] = []

    if not wanted:
        logger.warning("Provider backfill: no usable TSV rows, nothing to do (%s)", report)
        return {**report, **counts, "dry_run": dry_run, "transitions": {}, "sample": []}

    for batch in create_batches(list(wanted), LOOKUP_BATCH_SIZE):
        stored_docs = GenomeAnnotation.objects(source_file_info__url_path__in=batch).only(
            "annotation_id", "source_file_info.url_path", "source_file_info.uncompressed_md5",
            "source_file_info.provider",
        )
        for doc in stored_docs:
            info = doc.source_file_info
            md5, provider = wanted[info.url_path]
            if info.uncompressed_md5 != md5:
                counts["md5_differs"] += 1  # content changed: the import job owns this row
                continue
            counts["matched"] += 1
            if info.provider == provider:
                counts["unchanged"] += 1
                continue
            transitions[(info.provider or "", provider)] += 1
            if len(sample) < SAMPLE_SIZE:
                sample.append({"annotation_id": doc.annotation_id, "from": info.provider, "to": provider})
            if not dry_run:
                GenomeAnnotation.objects(annotation_id=doc.annotation_id).update_one(
                    set__source_file_info__provider=provider
                )
            counts["updated"] += 1

    result = {
        **report,
        **counts,
        "dry_run": dry_run,
        "transitions": {f"{a or '<empty>'} -> {b}": n for (a, b), n in transitions.most_common(50)},
        "sample": sample,
    }
    logger.info("Provider backfill %s: %s", "(dry run)" if dry_run else "done", {k: v for k, v in result.items() if k != "sample"})
    return result
