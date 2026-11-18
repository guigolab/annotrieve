import types

import pytest
from fastapi import HTTPException

from helpers import annotation as annotation_helper
from helpers import assembly_sequence_files as seq_files
from helpers import sequence_resolver as sr

REPORT = (
    "# Assembly name: x\n"
    "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tAssigned-Molecule-Location/Type\tGenBank-Accn\tRelationship\tRefSeq-Accn\tAssembly-Unit\tSequence-Length\tUCSC-style-name\n"
    "1\tassembled-molecule\t1\tChromosome\tCM000001.1\t=\tNC_000001.11\tPrimary Assembly\t1,000\tchr1\n"
    "scafA\tunplaced-scaffold\tna\tna\tJH000001.1\t<>\tNW_000001.1\tPrimary Assembly\t50\tna\n"
    "scafB\tunlocalized-scaffold\tUn\tna\tJH000002.1\t<>\tNW_000002.1\tPrimary Assembly\t60\tna\n"
    "scafC\tunlocalized-scaffold\tUn\tna\tJH000003.1\t<>\tNW_000003.1\tPrimary Assembly\t70\tna\n"
)


@pytest.fixture
def report(tmp_path):
    p = tmp_path / "assembly_report.txt"
    p.write_text(REPORT)
    return str(p)


def test_refseq_preferred_for_gcf(report):
    r = sr.resolve_aliases_in_report(report, ["chr1", "CM000001.1"], "GCF_1.1")
    assert [x.accession for x in r] == ["NC_000001.11", "NC_000001.11"]
    assert r[0].db == "refseq" and r[0].length == 1000


def test_genbank_preferred_for_gca(report):
    r = sr.resolve_aliases_in_report(report, ["NC_000001.11"], "GCA_1.1")[0]
    assert (r.accession, r.db) == ("CM000001.1", "genbank")


def test_normalized_matching(report):
    r = sr.resolve_aliases_in_report(report, ["CHR1", "NC_000001", "SCAFA", "1"], "GCF_1.1")
    assert [x.accession for x in r] == ["NC_000001.11", "NC_000001.11", "NW_000001.1", "NC_000001.11"]
    assert r[2].match == sr.MATCH_NORMALIZED and r[3].match == sr.MATCH_EXACT


def test_ambiguous_and_unresolved(report):
    r = sr.resolve_aliases_in_report(report, ["Un", "nope"], "GCF_1.1")
    assert r[0].status == sr.STATUS_AMBIGUOUS and r[0].candidates == 2
    assert r[1].status == sr.STATUS_UNRESOLVED and r[1].accession is None


def test_gff_fallback_maps_to_seqid_in_file(report, monkeypatch):
    monkeypatch.setattr(seq_files, "resolve_assembly_report_path", lambda *a: report)
    ann = types.SimpleNamespace(taxid="9", assembly_accession="GCF_1.1")
    got = annotation_helper._resolve_via_assembly_report("scafA", ann, None, {"NW_000001"}, "f.gz")
    assert got == "NW_000001"  # version-less seqid actually present in the file
    assert annotation_helper._resolve_via_assembly_report("nope", ann, None, {"x"}, "f.gz") is None


def test_gff_fallback_never_raises(monkeypatch):
    def boom(*a):
        raise OSError("disk")
    monkeypatch.setattr(seq_files, "resolve_assembly_report_path", boom)
    ann = types.SimpleNamespace(taxid="9", assembly_accession="GCF_1.1")
    assert annotation_helper._resolve_via_assembly_report("x", ann, None, {"x"}, "f") is None


def test_service_limits(monkeypatch):
    from services import assemblies_service as svc
    with pytest.raises(HTTPException) as e:
        svc.resolve_sequence_aliases("GCF_1.1", [])
    assert e.value.status_code == 422
    with pytest.raises(HTTPException) as e:
        svc.resolve_sequence_aliases("GCF_1.1", ["a"] * 1001)
    assert e.value.status_code == 422
