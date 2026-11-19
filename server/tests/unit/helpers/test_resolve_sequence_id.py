import types
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from helpers import annotation as ah
from helpers import assembly_sequence_files as seq_files

pytestmark = pytest.mark.unit

REPORT = (
    "# Sequence-Name\tSequence-Role\tAssigned-Molecule\tAssigned-Molecule-Location/Type\tGenBank-Accn\tRelationship\tRefSeq-Accn\tAssembly-Unit\tSequence-Length\tUCSC-style-name\n"
    "1\tassembled-molecule\t1\tChromosome\tCM000994.3\t=\tNC_000067.7\tPrimary Assembly\t100\tchr1\n"
    "scafA\tunplaced-scaffold\tna\tna\tJH000001.1\t<>\tNW_000001.1\tPrimary Assembly\t50\tna\n"
)
REL = "9606/GCF_1.1/refseq_abc.gff.gz"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    d = tmp_path / "9606" / "GCF_1.1"
    d.mkdir(parents=True)
    ann = types.SimpleNamespace(
        assembly_accession="GCF_1.1", taxid="9606",
        indexed_file_info=types.SimpleNamespace(bgzipped_path="/" + REL),
    )
    asm = types.SimpleNamespace(paired_assembly_accession=None)
    with patch.object(ah, "GenomeAnnotation") as GA, patch.object(ah, "GenomeAssembly") as GS:
        GA.objects.return_value.only.return_value.first.return_value = ann
        GS.objects.return_value.only.return_value.first.return_value = asm
        yield d


def write_contigs(d, *names):
    (d / "refseq_abc.gff.gz.contigs.txt").write_text("\n".join(names) + "\n")


def test_fast_path_skips_all_other_lookups(env):
    write_contigs(env, "1", "NW_000001")
    with patch.object(seq_files, "load_chr_aliases_index") as idx, patch.object(
        seq_files, "resolve_chromosomes_path"
    ) as chrp, patch.object(seq_files, "resolve_assembly_report_path") as rep:
        assert ah.resolve_sequence_id("1", "abc", "f.gz") == "1"
    idx.assert_not_called(); chrp.assert_not_called(); rep.assert_not_called()


def test_alias_lookup_still_works(env):
    write_contigs(env, "1")
    (env / "chr_aliases.tsv").write_text("1\tchr1\tNC_000067.7\n")
    assert ah.resolve_sequence_id("chr1", "abc", "f.gz") == "1"


def test_report_fallback_for_scaffold(env):
    write_contigs(env, "1", "NW_000001")
    (env / "assembly_report.txt").write_text(REPORT)
    assert ah.resolve_sequence_id("scafA", "abc", "f.gz") == "NW_000001"
    assert ah.resolve_sequence_id("JH000001.1", "abc", "f.gz") == "NW_000001"


def test_not_found_is_still_404(env):
    write_contigs(env, "1")
    (env / "assembly_report.txt").write_text(REPORT)
    with pytest.raises(HTTPException) as e:
        ah.resolve_sequence_id("nope", "abc", "f.gz")
    assert e.value.status_code == 404


def test_report_hit_not_in_gff_is_404(env):
    write_contigs(env, "1")  # the scaffold is not annotated in this GFF
    (env / "assembly_report.txt").write_text(REPORT)
    with pytest.raises(HTTPException) as e:
        ah.resolve_sequence_id("scafA", "abc", "f.gz")
    assert e.value.status_code == 404
