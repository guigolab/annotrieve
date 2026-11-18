"""Monthly provider backfill: only source_file_info.provider, only for the exact (url, md5) pair."""
from unittest.mock import patch

import mongomock
import pytest
from mongoengine import connect, disconnect

from jobs import backfill_providers as bp
from jobs.services.classes import AnnotationToProcess
from tests.integration.factories import make_annotation

pytestmark = pytest.mark.unit


@pytest.fixture
def mongo():
    from db.models import GenomeAnnotation

    disconnect(alias="default")
    connect(db="prov", alias="default", mongo_client_class=mongomock.MongoClient)
    GenomeAnnotation.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    disconnect(alias="default")


def _store(n, provider="community", url=None, md5=None, assembly="GCA_1"):
    ann = make_annotation(annotation_id=f"{n:032x}", assembly_accession=assembly, with_stats=False, with_busco=False)
    ann.source_file_info.url_path = url or f"https://example.com/{n}.gff.gz"
    ann.source_file_info.uncompressed_md5 = md5 or f"{n + 1000:032x}"
    ann.source_file_info.provider = provider
    ann.save()
    return ann


def _row(n, provider, url=None, md5=None):
    return AnnotationToProcess(
        annotation_provider=provider, access_url=url or f"https://example.com/{n}.gff.gz",
        md5_checksum=md5 or f"{n + 1000:032x}",
    )


def _run(rows_by_file, dry_run=False):
    files = list(rows_by_file)
    with patch.object(bp, "URLS_TO_FETCH", files), patch.object(
        bp.annotation_service, "fetch_from_url", side_effect=lambda u: rows_by_file[u]
    ):
        return bp.backfill_annotation_providers(dry_run=dry_run)


def _provider(n):
    from db.models import GenomeAnnotation

    return GenomeAnnotation.objects(annotation_id=f"{n:032x}").first().source_file_info.provider


def _snapshot():
    from db.models import GenomeAnnotation

    return {d.annotation_id: d.to_mongo().to_dict() for d in GenomeAnnotation.objects}


def test_updates_provider_only(mongo):
    _store(1, "community")
    before = _snapshot()
    res = _run({"a": [_row(1, "community_ipk")]})
    assert _provider(1) == "community_ipk"
    assert res["updated"] == 1 and res["transitions"] == {"community -> community_ipk": 1}
    after = _snapshot()
    before["%032x" % 1]["source_file_info"]["provider"] = "community_ipk"
    assert after == before  # nothing else changed


def test_unchanged_is_not_written(mongo):
    _store(1, "ensembl")
    res = _run({"a": [_row(1, "ensembl")]})
    assert res["unchanged"] == 1 and res["updated"] == 0


def test_dry_run_writes_nothing(mongo):
    _store(1, "community")
    res = _run({"a": [_row(1, "community_ipk")]}, dry_run=True)
    assert res["updated"] == 1 and res["dry_run"] is True and res["sample"][0]["to"] == "community_ipk"
    assert _provider(1) == "community"


def test_md5_mismatch_is_left_to_import_job(mongo):
    _store(1, "community")
    res = _run({"a": [_row(1, "community_ipk", md5="f" * 32)]})
    assert res["md5_differs"] == 1 and res["updated"] == 0
    assert _provider(1) == "community"


def test_empty_tsv_provider_never_blanks(mongo):
    _store(1, "community")
    res = _run({"a": [_row(1, "")]})
    assert _provider(1) == "community" and res["tsv_without_provider"] == 1


def test_unknown_url_ignored(mongo):
    _store(1, "community")
    res = _run({"a": [_row(2, "x")]})
    assert res["matched"] == 0 and _provider(1) == "community"


def test_conflicting_duplicate_urls_are_skipped(mongo):
    _store(1, "community")
    res = _run({"a": [_row(1, "p1")], "b": [_row(1, "p2")]})
    assert res["ambiguous_urls"] == 1 and _provider(1) == "community"


def test_identical_duplicate_rows_are_fine(mongo):
    _store(1, "community")
    _run({"a": [_row(1, "p1")], "b": [_row(1, "p1")]})
    assert _provider(1) == "p1"


def test_failed_fetch_changes_nothing(mongo):
    _store(1, "community")
    res = _run({"a": [], "b": [_row(1, "community_ipk")]})
    assert res["files_failed"] == ["a"] and _provider(1) == "community_ipk"
    res = _run({"a": [], "b": []})
    assert _provider(1) == "community_ipk" and res["updated"] == 0


def test_batches_cover_all_rows(mongo):
    for n in range(1, 8):
        _store(n, "community")
    with patch.object(bp, "LOOKUP_BATCH_SIZE", 3):
        res = _run({"a": [_row(n, "new") for n in range(1, 8)]})
    assert res["updated"] == 7 and all(_provider(n) == "new" for n in range(1, 8))


def test_registered_in_beat_and_worker():
    from celery_app.celery_config import beat_schedule

    entry = beat_schedule["backfill-annotation-providers-monthly"]
    assert entry["task"] == "backfill_annotation_providers"
    assert bp.backfill_annotation_providers.name == "backfill_annotation_providers"
