import pytest

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from tests.unit.jobs.mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

REPORT = (
    "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tAssigned-Molecule-Location/Type\tGenBank-Accn\tRelationship\tRefSeq-Accn\tAssembly-Unit\tSequence-Length\tUCSC-style-name\n"
    "1\tassembled-molecule\t1\tChromosome\tCM000994.3\t=\tNC_000067.7\tPrimary Assembly\t195154279\tchr1\n"
    "S1\tunlocalized-scaffold\t1\tChromosome\tGL456210.1\t=\tNT_166280.1\tPrimary Assembly\t169725\tna\n"
)
URL = "https://ftp.ncbi.nlm.nih.gov/a/b_genomic.fna.gz"


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    connect_mongomock("resolve_api")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    GenomeAssembly(assembly_accession="GCF_1.1", assembly_name="a", taxid="10090", organism_name="m", download_url=URL).save()
    GenomeAssembly(assembly_accession="GCA_2.1", assembly_name="b", taxid="10090", organism_name="m", download_url=URL + "2").save()
    d = tmp_path / "10090" / "GCF_1.1"
    d.mkdir(parents=True)
    (d / "assembly_report.txt").write_text(REPORT)


def test_get_and_post(client, seeded):
    base = "/assemblies/GCF_1.1/sequences/resolve"
    g = client.get(base, params={"aliases": "1,chr1,S1,nope"})
    assert g.status_code == 200
    body = g.json()
    assert body["assembly_accession"] == "GCF_1.1"
    assert [r["alias"] for r in body["results"]] == ["1", "chr1", "S1", "nope"]
    assert [r["accession"] for r in body["results"]] == ["NC_000067.7", "NC_000067.7", "NT_166280.1", None]
    assert body["results"][0]["db"] == "refseq" and body["results"][3]["status"] == "unresolved"
    p = client.post(base, json={"aliases": ["CM000994.3", "1"]})
    assert p.status_code == 200 and [r["accession"] for r in p.json()["results"]] == ["NC_000067.7"] * 2


def test_errors(client, seeded):
    assert client.get("/assemblies/GCF_9.9/sequences/resolve", params={"aliases": "1"}).status_code == 404
    assert client.get("/assemblies/GCA_2.1/sequences/resolve", params={"aliases": "1"}).status_code == 409  # no report
    assert client.get("/assemblies/GCF_1.1/sequences/resolve").status_code == 422  # no aliases
    assert client.post("/assemblies/GCF_1.1/sequences/resolve", json={"aliases": ["a"] * 1001}).status_code == 422
    assert client.post("/assemblies/GCF_1.1/sequences/resolve", json={"aliases": 5}).status_code == 422


def test_paired_fallback(client, seeded):
    GenomeAssembly.objects(assembly_accession="GCA_2.1").update_one(set__paired_assembly_accession="GCF_1.1")
    r = client.get("/assemblies/GCA_2.1/sequences/resolve", params={"aliases": "chr1"})
    assert r.status_code == 200
    assert r.json()["results"][0]["accession"] == "CM000994.3"  # GCA_ => GenBank
