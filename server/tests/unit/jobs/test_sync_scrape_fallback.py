import os
from unittest.mock import patch

import pytest

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from helpers.constants import PLACEHOLDER_DOWNLOAD_URL_PREFIX
from jobs import assemblies as assemblies_job
from jobs.services import assembly as svc
from .mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

ACC = "GCA_902500845.1"
DIR = "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/902/500/845/GCA_902500845.1_africanbuffalo/"


@pytest.fixture
def db(tmp_path, monkeypatch):
    connect_mongomock("scrape_fallback")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    GenomeAssembly(
        assembly_accession=ACC, assembly_name="africanbuffalo", taxid="9970",
        organism_name="Syncerus caffer", assembly_level="Scaffold",
        download_url=f"{PLACEHOLDER_DOWNLOAD_URL_PREFIX}{ACC}",
    ).save()
    GenomeAssembly(
        assembly_accession="GCA_2.1", assembly_name="ok", taxid="1", organism_name="x",
        assembly_level="Scaffold", download_url="https://ftp.ncbi.nlm.nih.gov/a/b_genomic.fna.gz",
        ncbi_ftp_directory_url="https://ftp.ncbi.nlm.nih.gov/a/",
    ).save()
    return tmp_path


def test_placeholder_selection(db):
    assert assemblies_job.placeholder_assembly_accessions() == [ACC]


def _patch_summaries():
    s = svc.assembly_summary_service
    return [
        patch.object(s, "assembly_summaries_dir", return_value="/nonexistent"),
        patch.object(s, "download_current_assembly_summaries", return_value={}),
        patch.object(s, "download_historical_assembly_summaries", return_value={}),
        patch.object(s, "build_ftp_path_index", return_value={}),
        patch.object(s, "merge_historical_paths_for_orphans", return_value=0),
    ]


def test_sync_scrapes_when_summaries_have_no_path(db):
    scraped = svc._ftp_file_urls(
        "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/902/500/845/", "GCA_902500845.1_africanbuffalo"
    )

    async def fake_fetch(ctxs):
        ctx = ctxs[ACC]
        assert ctx.ncbi_ftp_directory_url == DIR and ctx.raw_dest
        os.makedirs(os.path.dirname(ctx.raw_dest), exist_ok=True)  # as the real fetch does
        with open(ctx.raw_dest, "w") as fh:
            fh.write("# report\n")
        return (
            [(ACC, [])], {}, {"fetched": 1},
            {ACC: svc.AssemblyReportFetchResult(outcome=svc.FetchOutcome.PARSE_EMPTY, data=[])},
        )

    patches = _patch_summaries() + [
        patch.object(svc, "resolve_ncbi_ftp_paths", return_value=scraped),
        patch.object(svc, "fetch_reports_with_retry", fake_fetch),
        patch.object(svc, "backfill_assembly_report_embed", return_value=0),
    ]
    for p in patches:
        p.start()
    try:
        stats = svc.sync_assemblies_ftp_and_sequences(accessions=[ACC])
    finally:
        for p in patches:
            p.stop()
    a = GenomeAssembly.objects(assembly_accession=ACC).first()
    assert stats["paths_resolved_by_scrape"] == 1
    assert a.ncbi_ftp_directory_url == DIR
    assert a.download_url.endswith("GCA_902500845.1_africanbuffalo_genomic.fna.gz")
    assert a.assembly_report.raw_report_status == "ok"
    assert seq_files.assembly_report_file_exists("9970", ACC)
    assert assemblies_job.placeholder_assembly_accessions() == []


def test_sync_keeps_placeholder_when_scrape_finds_nothing(db):
    patches = _patch_summaries() + [
        patch.object(svc, "resolve_ncbi_ftp_paths", return_value=None),
        patch.object(svc, "backfill_assembly_report_embed", return_value=0),
    ]
    for p in patches:
        p.start()
    try:
        stats = svc.sync_assemblies_ftp_and_sequences(accessions=[ACC])
    finally:
        for p in patches:
            p.stop()
    a = GenomeAssembly.objects(assembly_accession=ACC).first()
    assert stats["paths_resolved_by_scrape"] == 0
    assert a.download_url.startswith(PLACEHOLDER_DOWNLOAD_URL_PREFIX)
    assert a.assembly_report.raw_report_status == "missing"
