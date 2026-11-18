import shutil
import pytest

from helpers import pysam_helper

pysam = pytest.importorskip("pysam")
pytestmark = pytest.mark.unit

LINES = [
    "chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=g1;Note=a=b;gene_biotype=protein_coding",
    "chr1\tsrc\tCDS\t1\t50\t.\t+\t0\tID=c1;gbkey=CDS",
    "chr1\tsrc\tgene\t200\t300\t.\t+\t.\tID=g2;gene_biotype=lncRNA",
]


@pytest.fixture
def indexed(tmp_path):
    if not shutil.which("bgzip") and not hasattr(pysam, "tabix_compress"):
        pytest.skip("no bgzip")
    plain = tmp_path / "a.gff"
    plain.write_text("\n".join(LINES) + "\n")
    gz = str(tmp_path / "a.gff.gz")
    pysam.tabix_compress(str(plain), gz, force=True)
    pysam.tabix_index(gz, preset="gff", csi=True, force=True)
    return gz


def test_value_containing_equals_does_not_crash_the_filter(indexed):
    out = list(pysam_helper.stream_gff_file(indexed, biotype="protein_coding"))
    assert len(out) == 1 and "ID=g1" in out[0]


def test_filter_still_matches_any_attribute_value(indexed):
    # legacy summaries list gbkey values as biotypes, so matching on any attribute value is relied upon
    assert len(list(pysam_helper.stream_gff_file(indexed, biotype="CDS"))) == 1
    assert list(pysam_helper.stream_gff_file(indexed, biotype="nothing")) == []
