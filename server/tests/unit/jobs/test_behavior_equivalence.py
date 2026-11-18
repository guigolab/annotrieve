"""
Differential tests against the code at commit dd6580d (frozen in tests/unit/jobs/originals/) for
the parts that are meant to stay identical: the sorted stream / md5 (annotation identity), paths,
feature summary, taxon stats, date parsing. Parts deliberately cleaned up (reconcile, skip filter,
error bookkeeping, std, lncRNA, summary stripping, per-seqid gene counts) are covered by their own
tests instead.

Production data is involved, so "more robust" must never mean "different output". Each test
runs the ORIGINAL function and the CURRENT one on identical inputs and compares results (or the
resulting database state / bytes on disk).
"""

import gzip
import hashlib
import os
import random
import shlex
import subprocess

import mongomock
import pytest
from mongoengine import connect, disconnect

from jobs.services import annotation as new_ann
from jobs.services import feature_summary as new_summary
from jobs.services import stats as new_stats
from jobs.services.classes import AnnotationToProcess
from tests.integration.factories import make_annotation, make_taxon
from tests.unit.jobs.originals import annotation_orig as old_ann
from tests.unit.jobs.originals import feature_summary_orig as old_summary
from tests.unit.jobs.originals import stats_orig as old_stats

pytestmark = pytest.mark.unit


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
@pytest.fixture
def mongo(monkeypatch):
    from datetime import datetime

    from db.models import AnnotationError, GenomeAnnotation, TaxonNode
    from tests.integration import factories

    monkeypatch.setattr(factories, "_utcnow", lambda: datetime(2024, 1, 1))  # identical seeds -> identical dates

    disconnect(alias="default")
    connect(db="equivalence", alias="default", mongo_client_class=mongomock.MongoClient)
    for model in (GenomeAnnotation, AnnotationError, TaxonNode):
        model.objects.delete()
    yield
    for model in (GenomeAnnotation, AnnotationError, TaxonNode):
        model.objects.delete()
    disconnect(alias="default")


def _row(**kwargs) -> AnnotationToProcess:
    defaults = dict(
        source_database="Ensembl", annotation_provider="Ensembl", release_date="2024-01-02",
        last_modified_date="2024-01-03", md5_checksum="src1", access_url="https://example.com/a.gff.gz",
        taxon_id="9606", organism_name="Homo sapiens", assembly_accession="GCA_1", assembly_name="GRCh38",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


def _store(annotation_id, url, md5, assembly="GCA_1"):
    ann = make_annotation(annotation_id=annotation_id, assembly_accession=assembly, with_stats=False, with_busco=False)
    ann.source_file_info.url_path = url
    ann.source_file_info.uncompressed_md5 = md5
    ann.save()
    return ann


def _snapshot():
    from db.models import AnnotationError, GenomeAnnotation, TaxonNode

    def dump(model, key, volatile=()):
        docs = [d.to_mongo().to_dict() for d in model.objects]
        for d in docs:
            d.pop("_id", None)  # ObjectIds / wall-clock stamps differ between two seedings
            for field in volatile:
                d.pop(field, None)
        return sorted(docs, key=lambda d: str(d.get(key)))

    return {
        "annotations": dump(GenomeAnnotation, "annotation_id"),
        "errors": dump(AnnotationError, "url_path", volatile=("created_at", "last_modified")),
        "taxa": dump(TaxonNode, "taxid"),
    }


def _both(seed_fn, run_old, run_new):
    """Seed an identical DB state, run old, snapshot, reseed, run new, snapshot."""
    from db.models import AnnotationError, GenomeAnnotation, TaxonNode

    results = []
    for runner in (run_old, run_new):
        for model in (GenomeAnnotation, AnnotationError, TaxonNode):
            model.objects.delete()
        seed_fn()
        returned = runner()
        results.append((returned, _snapshot()))
    return results


# --------------------------------------------------------------------------- #
# incoming-row filters
# --------------------------------------------------------------------------- #
class TestFilterEquivalence:
    def test_field_filter(self):
        rows = [_row(taxon_id=str(i % 4)) for i in range(10)]
        wanted = {"1": [], "3": []}
        assert new_ann.filter_annotations_dict_by_field(rows, "taxon_id", wanted.keys()) == \
            old_ann.filter_annotations_dict_by_field(rows, "taxon_id", list(wanted.keys()))


# --------------------------------------------------------------------------- #
# pure helpers
# --------------------------------------------------------------------------- #
class TestPureHelpersEquivalence:
    @pytest.mark.parametrize("header", [
        "Wed, 03 Jan 2024 00:00:00 GMT", "Thu, 29 Feb 2024 23:59:59 GMT",
        "Wed, 03 Jan 2024 00:00:00 UTC", "", "nonsense", None, "2024-01-03",
    ])
    def test_last_modified(self, header):
        assert new_ann.get_last_modified_date({"Last-Modified": header}) == \
            old_ann.get_last_modified_date({"Last-Modified": header})
        assert new_ann.get_last_modified_date({}) == old_ann.get_last_modified_date({})

    @pytest.mark.parametrize("overrides", [
        {}, dict(source_database="RefSeq"), dict(source_database=""), dict(source_database=None),
        dict(taxon_id="1", assembly_accession="GCF_000001405.40", md5_checksum="0" * 32),
    ])
    def test_output_paths(self, tmp_path, overrides):
        row = _row(**overrides)
        old_dir, new_dir = tmp_path / "old", tmp_path / "new"
        old = old_ann.init_annotation_file_paths(str(old_dir), row)
        new = new_ann.init_annotation_file_paths(str(new_dir), row)
        assert new[1] == old[1]
        assert new[0].replace(str(new_dir), "") == old[0].replace(str(old_dir), "")
        assert len(new) == 2
        old_tree = sorted(os.path.relpath(p, old_dir) for p, _, _ in os.walk(old_dir))
        new_tree = sorted(os.path.relpath(p, new_dir) for p, _, _ in os.walk(new_dir))
        assert new_tree == old_tree

    @pytest.mark.parametrize("seed", range(30))
    def test_distribution_stats(self, seed):
        rnd = random.Random(seed)
        values = [rnd.randint(0, 5000) for _ in range(rnd.randint(0, 40))]
        new = new_stats.compute_distribution_stats(values).to_mongo().to_dict()
        old = old_stats.compute_distribution_stats(values).to_mongo().to_dict()
        # std uses the exact mean now (the original used the rounded one): rounding-level difference
        assert abs(new.pop("std") - old.pop("std")) < 0.05
        assert new == old


# --------------------------------------------------------------------------- #
# feature summary
# --------------------------------------------------------------------------- #
class TestFeatureSummaryEquivalence:
    @pytest.mark.parametrize("seed", range(10))
    def test_summary(self, seed):
        rnd = random.Random(seed)
        lines = ["##gff-version 3"]
        for i in range(rnd.randint(0, 80)):
            ftype = rnd.choice(["gene", "mRNA", "exon", "CDS", "pseudogene", "ncRNA_gene", "region"])
            attrs = []
            if rnd.random() < 0.8:
                attrs.append(f"ID={ftype}{i}")
            if rnd.random() < 0.5:
                attrs.append(f"{rnd.choice(['biotype', 'gene_biotype', 'transcript_biotype'])}={rnd.choice(['a', 'b', 'protein_coding'])}")
            if rnd.random() < 0.3:
                attrs.append(f"Name{rnd.randint(0, 3)}=x")
            lines.append(f"chr{i % 3}\t{rnd.choice(['src', 'other'])}\t{ftype}\t{i}\t{i + 9}\t.\t+\t.\t{';'.join(attrs)}")
        old = old_summary._compute_features_summary_from_lines(iter(lines)).to_mongo().to_dict()
        new = new_summary._compute_features_summary_from_lines(iter(lines)).to_mongo().to_dict()
        assert new == old


# --------------------------------------------------------------------------- #
# taxon statistics (the rewritten aggregation) against the original, on a real (mock) DB
# --------------------------------------------------------------------------- #
class TestTaxonStatsEquivalence:
    @staticmethod
    def _seeder(seed):
        from db.embedded_documents import (
            AssociatedGenesStats, GeneCategoryFeatureStats, GenericLengthStats, GenericTranscriptTypeStats, GFFStats,
        )

        def seed_db():
            rnd = random.Random(seed)  # fresh generator so both runs get identical data
            length = GenericLengthStats(min=1, max=2, mean=1.5)
            for taxid in ("1", "9605", "9606", "9607", "777"):
                make_taxon(taxid=taxid, scientific_name=f"t{taxid}")
            for i in range(rnd.randint(1, 8)):
                ann = make_annotation(
                    annotation_id=f"{i:032x}", taxid=rnd.choice(["9606", "9607"]),
                    assembly_accession=f"GCA_{i}", with_stats=False, with_busco=False)
                genes = {c: GeneCategoryFeatureStats(total_count=rnd.randint(0, 500), length_stats=length)
                         for c in rnd.sample(["coding", "non_coding", "pseudogene", "other"], rnd.randint(0, 4))}
                tx = {t: GenericTranscriptTypeStats(total_count=rnd.randint(0, 900), length_stats=length,
                                                    associated_genes=AssociatedGenesStats(total_count=1))
                      for t in rnd.sample(["mRNA", "lnc_RNA", "tRNA", "miRNA", "rRNA", "snoRNA"], rnd.randint(0, 5))}
                ann.features_statistics = GFFStats(gene_category_stats=genes, transcript_type_stats=tx)
                ann.save()

        return seed_db

    @pytest.mark.parametrize("seed", range(12))
    def test_same_taxon_documents_after_the_update(self, mongo, seed):
        (_, old_state), (_, new_state) = _both(
            self._seeder(seed), old_stats.update_taxon_gene_and_transcript_stats,
            new_stats.update_taxon_gene_and_transcript_stats)
        assert new_state["taxa"] == old_state["taxa"]
        assert len(new_state["annotations"]) == len(old_state["annotations"])  # annotations are only read


# --------------------------------------------------------------------------- #
# the sort stream: this is what `annotation_id` is the md5 of; it must never change
# --------------------------------------------------------------------------- #
GFF_BODY = (
    "##gff-version 3\n#!genome-build X\n"
    "chr2\ts\tgene\t100\t200\t.\t+\t.\tID=g2\n"
    "chr1\ts\tgene\t300\t400\t.\t+\t.\tID=g1b\n"
    "chr1\ts\tgene\t50\t60\t.\t+\t.\tID=g1a\n"
    "chr10\ts\tgene\t1\t9\t.\t-\t.\tID=g10\n"
    "chr1\ts\tmRNA\t50\t60\t.\t+\t.\tID=t1;Parent=g1a\n"
    "##FASTA\n>chr1\nACGT\n"
)


def _write_input(tmp_path, name, content: bytes, gz: bool):
    path = tmp_path / name
    path.write_bytes(gzip.compress(content) if gz else content)
    return str(path)


def _stdout(cmd):
    # Production runs in the container's default C locale; compare both versions under it.
    env = {**os.environ, "LC_ALL": "C"}
    proc = subprocess.run(["bash", "-lc", cmd], capture_output=True, env=env)
    return proc.returncode, proc.stdout


def _old_full_cmd(path, md5_path, out):
    return (
        f"{old_ann._sorted_gff_stream_cmd(path)} | tee >(md5sum | awk '{{print $1}}' > {shlex.quote(str(md5_path))}) "
        f"| gzip > {shlex.quote(str(out))}"
    )


class TestSortStreamEquivalence:
    CASES = {
        "normal": GFF_BODY.encode(),
        "no_header_lines": b"chr2\ts\tgene\t1\t2\t.\t+\t.\tID=a\nchr1\ts\tgene\t1\t2\t.\t+\t.\tID=b\n",
        "only_header": b"##gff-version 3\n",
        "tabs_and_spaces": b"chr1\ts\tgene\t10\t20\t.\t+\t.\tID=a b\nchr1 x\ts\tgene\t5\t6\t.\t+\t.\tID=c\n",
        "equal_keys_keep_input_order": b"".join(
            f"chr1\ts{i}\tgene\t5\t6\t.\t+\t.\tID=g{i}\n".encode() for i in range(50)),
        "no_trailing_newline": b"chr1\ts\tgene\t2\t3\t.\t+\t.\tID=a\nchr1\ts\tgene\t1\t3\t.\t+\t.\tID=b",
        "numeric_not_lexical": b"".join(f"chr1\ts\tgene\t{p}\t{p + 1}\t.\t+\t.\tID=g{p}\n".encode() for p in (100, 9, 10, 1)),
    }

    @pytest.mark.parametrize("name", sorted(CASES))
    @pytest.mark.parametrize("gz", [True, False])
    def test_sorted_stream_bytes_are_identical(self, tmp_path, name, gz):
        path = _write_input(tmp_path, f"{name}.gff{'.gz' if gz else ''}", self.CASES[name], gz)
        old_rc, old_out = _stdout(old_ann._sorted_gff_stream_cmd(path))
        new_rc, new_out = _stdout(new_ann._sorted_gff_stream_cmd(path))
        assert new_out == old_out
        assert (new_rc == 0) == (old_rc == 0)
        # with a spill directory, which only changes where sort puts its temp files
        spill = tmp_path / "spill"
        spill.mkdir()
        assert _stdout(new_ann._sorted_gff_stream_cmd(path, sort_tmp_dir=str(spill)))[1] == old_out

    def test_a_small_sort_buffer_that_forces_spilling_does_not_change_the_bytes(self, tmp_path, monkeypatch):
        rnd = random.Random(1)
        body = "".join(
            f"chr{rnd.randint(1, 30)}\ts\tgene\t{rnd.randint(1, 10**6)}\t9\t.\t+\t.\tID=g{i}\n" for i in range(30000)
        ).encode()
        path = _write_input(tmp_path, "big.gff.gz", body, True)
        monkeypatch.setattr(new_ann, "SORT_BUFFER_SIZE", "64K")
        spill = tmp_path / "spill"
        spill.mkdir()
        _, old_out = _stdout(old_ann._sorted_gff_stream_cmd(path))
        _, new_out = _stdout(new_ann._sorted_gff_stream_cmd(path, sort_tmp_dir=str(spill)))
        assert new_out == old_out
        assert list(spill.iterdir()) == []  # sort removes its own temp files

    @pytest.mark.parametrize("name", ["normal", "no_header_lines", "equal_keys_keep_input_order"])
    def test_full_pipeline_md5_and_payload_are_identical(self, tmp_path, name):
        """md5 of the sorted stream == annotation_id; the compressed payload must decode identically."""
        path = _write_input(tmp_path, "in.gff.gz", self.CASES[name], True)

        def run(cmd, md5_path, out):
            assert _stdout(cmd)[0] == 0
            assert new_ann._read_md5_file(str(md5_path), wait=5)  # tee >(...) finishes asynchronously
            return md5_path.read_text().strip(), gzip.decompress(out.read_bytes())

        o_md5, o_out = tmp_path / "old.md5", tmp_path / "old.gz"
        n_md5, n_out = tmp_path / "new.md5", tmp_path / "new.gz"
        old_md5, old_payload = run(_old_full_cmd(path, o_md5, o_out), o_md5, o_out)
        new_md5, new_payload = run(new_ann.build_stream_cmd(path, str(n_md5), str(n_out), compressor="gzip"), n_md5, n_out)
        assert new_md5 == old_md5 == hashlib.md5(old_payload).hexdigest()
        assert new_payload == old_payload

    def test_gzip_with_trailing_garbage_is_still_accepted_like_before(self, tmp_path):
        """gzip exits 2 (a warning) for trailing garbage; the old pipeline imported it, so must the new one."""
        path = tmp_path / "garbage.gff.gz"
        path.write_bytes(gzip.compress(self.CASES["normal"]) + b"\x00\x00\x00trailing-junk")
        o_md5, o_out = tmp_path / "old.md5", tmp_path / "old.gz"
        n_md5, n_out = tmp_path / "new.md5", tmp_path / "new.gz"
        assert _stdout(_old_full_cmd(str(path), o_md5, o_out))[0] == 0
        assert _stdout(new_ann.build_stream_cmd(str(path), str(n_md5), str(n_out), compressor="gzip"))[0] == 0
        assert gzip.decompress(n_out.read_bytes()) == gzip.decompress(o_out.read_bytes())

    def test_truncated_gzip_now_fails_instead_of_storing_a_partial_file(self, tmp_path):
        """The one intentional difference: a truncated download used to be imported silently as partial data."""
        data = gzip.compress(self.CASES["normal"] * 200)
        path = tmp_path / "trunc.gff.gz"
        path.write_bytes(data[: len(data) // 2])
        o_md5, o_out = tmp_path / "old.md5", tmp_path / "old.gz"
        n_md5, n_out = tmp_path / "new.md5", tmp_path / "new.gz"
        assert _stdout(_old_full_cmd(str(path), o_md5, o_out))[0] == 0  # the old pipeline reported success
        assert _stdout(new_ann.build_stream_cmd(str(path), str(n_md5), str(n_out), compressor="gzip"))[0] != 0

    def test_sort_options_are_only_added_for_gnu_sort(self, monkeypatch, tmp_path):
        monkeypatch.setattr(new_ann, "_sort_supports_gnu_options", lambda: False)
        cmd = new_ann._sorted_gff_stream_cmd("/x/in.gff.gz", sort_tmp_dir=str(tmp_path))
        assert " -S " not in cmd and "--parallel" not in cmd and " -T " not in cmd


class TestSortLocalePinned:
    """annotation_id = md5 of the sorted stream, so the sort must not depend on the caller's locale."""

    def test_sorted_stream_identical_under_utf8_and_c_locale(self, tmp_path, monkeypatch):
        import gzip, hashlib, os
        from jobs.services import annotation as A

        rows = ["chr1\tsrc\tgene\t5\t9\t.\t+\t.\tID=a", "Chr1\tsrc\tgene\t1\t9\t.\t+\t.\tID=b",
                "chr_1\tsrc\tgene\t2\t9\t.\t+\t.\tID=c", "chr1a\tsrc\tgene\t3\t9\t.\t+\t.\tID=d",
                "chr10\tsrc\tgene\t4\t9\t.\t+\t.\tID=e", "chr2\tsrc\tgene\t1\t9\t.\t+\t.\tID=f"]
        src = tmp_path / "x.gff.gz"
        with gzip.open(src, "wt") as f:
            f.write("##gff-version 3\n" + "\n".join(rows) + "\n")
        digests = set()
        for loc in ("C", "en_US.UTF-8", "tr_TR.UTF-8"):
            monkeypatch.setenv("LC_ALL", loc)
            monkeypatch.setenv("LANG", loc)
            out = tmp_path / f"o_{loc}.gff"
            A.sort_gff_file(str(src), str(out))
            digests.add(hashlib.md5(out.read_bytes()).hexdigest())
        assert len(digests) == 1
        assert "export LC_ALL=C" in A._sorted_gff_stream_cmd("x.gff")
