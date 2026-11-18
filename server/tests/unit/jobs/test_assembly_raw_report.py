import asyncio
import os

import pytest

from helpers import assembly_sequence_files as seq_files
from jobs.services import assembly as svc


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    return tmp_path


def test_delete_assembly_files_keeps_annotations(root):
    d = root / "9606" / "GCF_1.1"
    d.mkdir(parents=True)
    for n in ("assembly_report.txt", "chromosomes.json", "chr_aliases.tsv"):
        (d / n).write_text("x")
    (d / "refseq_abc.gff.gz").write_text("keep")
    removed = seq_files.delete_assembly_files("9606", "GCF_1.1")
    assert len(removed) == 3
    assert (d / "refseq_abc.gff.gz").exists()
    (d / "refseq_abc.gff.gz").unlink()
    seq_files.delete_assembly_files("9606", "GCF_1.1")
    assert not d.exists()


def test_resolve_report_falls_back_to_paired(root):
    d = root / "9606" / "GCF_2.1"
    d.mkdir(parents=True)
    (d / "assembly_report.txt").write_text("x")
    assert seq_files.resolve_assembly_report_path("9606", "GCA_2.1", "GCF_2.1").endswith("GCF_2.1/assembly_report.txt")
    assert seq_files.resolve_assembly_report_path("9606", "GCA_2.1") is None


class _Content:
    def __init__(self, data):
        self._lines = data.splitlines(keepends=True)

    async def readline(self):
        return self._lines.pop(0).encode() if self._lines else b""


class _Resp:
    def __init__(self, data):
        self.content = _Content(data)


def test_stream_writes_raw_verbatim(tmp_path):
    text = (
        "# Assembly name: x\n"
        "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tAssigned-Molecule-Location/Type\tGenBank-Accn\tRelationship\tRefSeq-Accn\tAssembly-Unit\tSequence-Length\tUCSC-style-name\n"
        "1\tassembled-molecule\t1\tChromosome\tCM1.1\t=\tNC_1.1\tPrimary Assembly\t100\tchr1\n"
        "scaf\tunplaced-scaffold\tna\tna\tJ1.1\t=\tNW_1.1\tPrimary Assembly\t5\tna\n"
    )
    out = tmp_path / "r.txt"
    with open(out, "wb") as fh:
        rows = asyncio.run(svc.parse_assembly_report_stream(_Resp(text), fh))
    assert out.read_text() == text
    assert len(rows) == 1  # parsing is unchanged: assembled molecules only
