"""
End-to-end run of the assembly sync against a local HTTP server, asserting on the *logs*: each
concern (FTP path, report download, chromosome files, status) has its own tag, routine events are
not warnings, and real problems are warnings that name the assembly and the reason.
"""
import asyncio
import logging
import threading
from unittest.mock import patch

import pytest
from aiohttp import web

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from jobs.services import assembly as svc
from .mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

HEADER = (
    "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tAssigned-Molecule-Location/Type\tGenBank-Accn\t"
    "Relationship\tRefSeq-Accn\tAssembly-Unit\tSequence-Length\tUCSC-style-name\n"
)
WITH_MOLECULES = HEADER + "1\tassembled-molecule\t1\tChromosome\tCM1.1\t=\tNC_1.1\tPrimary Assembly\t100\tchr1\n"
NO_MOLECULES = HEADER + "scaf1\tunplaced-scaffold\tna\tna\tJH1.1\t<>\tNW_1.1\tPrimary Assembly\t50\tna\n"
TAGS = ("[assembly-sync]", "[ftp-path]", "[assembly-report]", "[chromosome-files]", "[report-status]", "[assembly-job]")


@pytest.fixture
def server():
    loop = asyncio.new_event_loop()
    ready = threading.Event()
    info = {}

    async def start():
        app = web.Application()

        def text(body):
            return lambda r: web.Response(text=body)

        app.add_routes([
            web.get("/chr/chr_assembly_report.txt", text(WITH_MOLECULES)),
            web.get("/scaf/scaf_assembly_report.txt", text(NO_MOLECULES)),
            web.get("/down/down_assembly_report.txt", lambda r: web.Response(status=503)),
            web.get("/gone/gone_assembly_report.txt", lambda r: web.Response(status=404)),
        ])
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        info["port"] = site._server.sockets[0].getsockname()[1]
        info["runner"] = runner
        ready.set()

    def run():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(start())
        loop.run_forever()

    t = threading.Thread(target=run, daemon=True)
    t.start()
    ready.wait(10)
    yield info["port"]
    asyncio.run_coroutine_threadsafe(info["runner"].cleanup(), loop).result(10)
    loop.call_soon_threadsafe(loop.stop)


def _assembly(acc, level, name, port, url_dir):
    GenomeAssembly(
        assembly_accession=acc, assembly_name=name, taxid="9", organism_name="o", assembly_level=level,
        download_url=f"http://127.0.0.1:{port}/{url_dir}/{url_dir}_genomic.fna.gz",
        ncbi_ftp_directory_url=f"http://127.0.0.1:{port}/{url_dir}/",
    ).save()


def test_sync_logs_are_readable_and_tagged_by_concern(server, tmp_path, monkeypatch, caplog):
    connect_mongomock("sync_logging")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    monkeypatch.setattr(svc, "REPORT_RETRY_DELAYS", (0, 0))
    _assembly("GCA_1.1", "Chromosome", "chr", server, "chr")
    _assembly("GCA_2.1", "Scaffold", "scaf", server, "scaf")
    _assembly("GCA_3.1", "Scaffold", "down", server, "down")
    _assembly("GCA_4.1", "Scaffold", "gone", server, "gone")

    s = svc.assembly_summary_service
    with patch.object(s, "assembly_summaries_dir", return_value="/nonexistent"), patch.object(
        s, "download_current_assembly_summaries", return_value={"downloaded": [], "skipped": ["a.txt"], "failed": []}
    ), patch.object(s, "build_ftp_path_index", return_value={}), patch.object(
        s, "merge_historical_paths_for_orphans", return_value=0
    ), patch.object(s, "download_historical_assembly_summaries", return_value={}), patch.object(
        svc, "resolve_ncbi_ftp_paths", return_value=None
    ), caplog.at_level(logging.INFO, logger=svc.logger.name):
        stats = svc.sync_assemblies_ftp_and_sequences(
            accessions=["GCA_1.1", "GCA_2.1", "GCA_3.1", "GCA_4.1"], chunk_size=10
        )

    records = [r for r in caplog.records if r.name == svc.logger.name]
    text = "\n".join(f"{r.levelname:7} {r.getMessage()}" for r in records)
    print("\n" + text)

    # every line belongs to exactly one concern
    assert all(r.getMessage().startswith(TAGS) for r in records), text
    msgs = [r.getMessage() for r in records]
    for expected in (
        "[assembly-sync] START: 4 assemblies",
        "[assembly-sync] PLAN:",
        "[assembly-sync] chunk 1/1: 4 assemblies",
        "[assembly-report] downloading 4 assembly reports",
        "[chromosome-files] generating chromosomes.json + chr_aliases.tsv for 1 assemblies",
        "[chromosome-files] chromosomes.json + chr_aliases.tsv written for 1 assemblies",
        "[report-status] raw_report_status written for 4 assemblies",
        "[assembly-sync] DONE in",
    ):
        assert any(m.startswith(expected) for m in msgs), (expected, text)

    # chromosome-file lines never talk about downloading, report lines never about chromosome files
    assert not any("download" in m for m in msgs if m.startswith("[chromosome-files]"))
    assert not any("chromosomes.json" in m for m in msgs if m.startswith("[assembly-report]"))

    # a scaffold-level report without assembled molecules is routine, never a warning
    warnings = [r.getMessage() for r in records if r.levelno >= logging.WARNING]
    assert not any("GCA_2.1" in w for w in warnings), warnings
    # real problems are warnings naming the assembly and the reason
    assert any(w.startswith("[assembly-report] GIVING UP") and "GCA_3.1" in w and "HTTP 503" in w for w in warnings), warnings
    assert any("raw_report_status='failed'" in w and "GCA_3.1" in w for w in warnings), warnings
    assert any("raw_report_status='missing'" in w and "GCA_4.1" in w for w in warnings), warnings

    assert stats["still_missing_raw_reports"] == 2
