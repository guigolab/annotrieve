import asyncio
from unittest.mock import patch

import pytest

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from jobs import assemblies as assemblies_job
from jobs.services import assembly as svc
from .mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit


def test_looks_like_assembly_report(tmp_path):
    good = tmp_path / "g.txt"
    good.write_text("# x\n# Sequence-Name\tSequence-Role\n1\tassembled-molecule\n")
    bad = tmp_path / "b.txt"
    bad.write_text("<html><body>Service unavailable</body></html>")
    assert svc._looks_like_assembly_report(str(good))
    assert not svc._looks_like_assembly_report(str(bad))
    assert not svc._looks_like_assembly_report(str(tmp_path / "missing.txt"))


class _Resp:
    status = 200

    def __init__(self, text):
        self._lines = text.splitlines(keepends=True)
        self.content = self

    async def readline(self):
        return self._lines.pop(0).encode() if self._lines else b""

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Session:
    def __init__(self, text):
        self.text = text

    def get(self, url, timeout=None):
        return _Resp(self.text)


def test_html_200_is_not_stored_and_is_transient(tmp_path):
    dest = tmp_path / "9" / "GCA_1.1" / "assembly_report.txt"
    res = asyncio.run(svc.get_assembly_report_result(_Session("<html>oops</html>"), "u", str(dest)))
    assert res.outcome == svc.FetchOutcome.TRANSIENT
    assert not dest.exists()
    assert not list(dest.parent.glob("*.tmp"))


def test_valid_report_is_published_and_no_tmp_left(tmp_path):
    text = "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tGenBank-Accn\tRefSeq-Accn\tSequence-Length\tUCSC-style-name\n"
    dest = tmp_path / "9" / "GCA_1.1" / "assembly_report.txt"
    res = asyncio.run(svc.get_assembly_report_result(_Session(text), "u", str(dest)))
    assert res.outcome == svc.FetchOutcome.PARSE_EMPTY
    assert dest.read_text() == text
    assert not list(dest.parent.glob("*.tmp"))


def test_delete_assembly_files_removes_stale_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    d = tmp_path / "9" / "GCA_1.1"
    d.mkdir(parents=True)
    stale = d / "assembly_report.txt.abc123.tmp"
    stale.write_text("partial")
    import os, time
    os.utime(stale, (time.time() - 7200, time.time() - 7200))  # a fresh one may still be written
    seq_files.delete_assembly_files("9", "GCA_1.1")
    assert not d.exists()


def test_set_report_fields_recovers_from_null_embed():
    connect_mongomock("hardening")
    GenomeAssembly.drop_collection()
    GenomeAssembly(
        assembly_accession="GCA_9.1", assembly_name="n", taxid="1", organism_name="o",
        download_url="https://ftp.ncbi.nlm.nih.gov/a/y.fna.gz",
    ).save()
    GenomeAssembly._get_collection().update_one(
        {"assembly_accession": "GCA_9.1"}, {"$set": {"assembly_report": None}}
    )
    svc.update_raw_report_status("GCA_9.1", svc.RAW_STATUS_MISSING)
    svc.update_assembly_report("GCA_9.1", svc.REPORT_STATUS_OK)
    a = GenomeAssembly.objects(assembly_accession="GCA_9.1").first()
    assert a.assembly_report.raw_report_status == "missing"
    assert a.assembly_report.report_status == "ok"


def test_bulk_jobs_skip_when_locked():
    with assemblies_job._exclusive_run() as first:
        assert first
        with patch("jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences") as sync:
            assert assemblies_job._run_locked_sync("t", ["GCA_1.1"], 10) == {"skipped": "locked"}
        sync.assert_not_called()
    with patch(
        "jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences", return_value={"ok": 1}
    ):
        assert assemblies_job._run_locked_sync("t", ["GCA_1.1"], 10) == {"ok": 1}


def test_sweep_refuses_on_empty_db(tmp_path, monkeypatch):
    connect_mongomock("hardening_empty")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    with pytest.raises(RuntimeError):
        assemblies_job.sweep_orphan_assembly_files(dry_run=False)


def test_sweep_only_removes_unknown_assemblies(tmp_path, monkeypatch):
    connect_mongomock("hardening_sweep")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    GenomeAssembly(
        assembly_accession="GCA_1.1", assembly_name="n", taxid="9", organism_name="o",
        download_url="https://ftp.ncbi.nlm.nih.gov/a/1.fna.gz",
    ).save()
    for acc in ("GCA_1.1", "GCA_2.1"):
        d = tmp_path / "9" / acc
        d.mkdir(parents=True)
        (d / "assembly_report.txt").write_text("x")
        (d / "refseq_abc.gff.gz").write_text("annotation")
    dry = assemblies_job.sweep_orphan_assembly_files(dry_run=True)
    assert dry["orphans"] == 1 and dry["files_removed"] == 0
    assert (tmp_path / "9" / "GCA_2.1" / "assembly_report.txt").exists()
    wet = assemblies_job.sweep_orphan_assembly_files(dry_run=False)
    assert wet["files_removed"] == 1
    assert not (tmp_path / "9" / "GCA_2.1" / "assembly_report.txt").exists()
    assert (tmp_path / "9" / "GCA_2.1" / "refseq_abc.gff.gz").exists()  # annotations untouched
    assert (tmp_path / "9" / "GCA_1.1" / "assembly_report.txt").exists()
