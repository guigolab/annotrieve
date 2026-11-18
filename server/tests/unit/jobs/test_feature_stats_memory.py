"""
The single-pass feature_stats rewrite (audit OOM section) must be (a) result-identical to the
previous implementation, frozen in reference_feature_stats.py, and (b) much lighter in memory.
"""

import random
import tracemalloc

import pytest

from jobs.services import feature_stats as new_impl
from tests.unit.jobs import reference_feature_stats as old_impl

pytestmark = pytest.mark.unit


def _gff_lines(seed, seqids=4, genes_per_seqid=60, messy=True):
    """Sorted-by-seqid GFF lines with a realistic mix of genes, transcripts, exons, CDS and noise."""
    rnd = random.Random(seed)
    out = []
    for s in range(seqids):
        seqid = f"chr{s + 1}"
        pos = 1
        rows = []
        for g in range(genes_per_seqid):
            gid = f"{seqid}.gene{g}"
            gtype = rnd.choice(["gene", "gene", "gene", "ncRNA_gene", "pseudogene"])
            gattr = f"ID={gid}"
            if rnd.random() < 0.7:
                gattr += ";" + rnd.choice(["biotype", "gene_biotype", "type"]) + "=" + rnd.choice(
                    ["protein_coding", "lncRNA", "Pseudogene", "miRNA"])
            rows.append((pos, f"{seqid}\tsrc\t{gtype}\t{pos}\t{pos + 5000}\t.\t+\t.\t{gattr}"))
            parent_gene = gid
            if rnd.random() < 0.1:  # an unusual parent feature that is not a *_gene
                parent_gene = f"{seqid}.seg{g}"
                rows.append((pos, f"{seqid}\tsrc\tgene_segment\t{pos}\t{pos + 5000}\t.\t+\t.\tID={parent_gene};biotype=ig"))
            for t in range(rnd.randint(0, 3)):
                tid = f"{seqid}.tx{g}.{t}"
                ttype = rnd.choice(["mRNA", "mRNA", "lnc_RNA", "ncRNA", "transcript", "tRNA", "V_gene_segment"])
                tattr = f"ID={tid};Parent={parent_gene}"
                if rnd.random() < 0.5:
                    tattr += ";" + rnd.choice(["biotype", "transcript_biotype"]) + "=" + rnd.choice(["a", "b", "c"])
                rows.append((pos + 1, f"{seqid}\tsrc\t{ttype}\t{pos + 1}\t{pos + 4000}\t.\t+\t.\t{tattr}"))
                for e in range(rnd.randint(0, 6)):
                    start = pos + 10 + e * 300
                    parents = tid if rnd.random() > 0.1 else f"{tid},{seqid}.tx{g}.{t + 1}"
                    rows.append((start, f"{seqid}\tsrc\texon\t{start}\t{start + 100 + e}\t.\t+\t.\tID=ex{tid}.{e};Parent={parents}"))
                    if rnd.random() < 0.6:
                        rows.append((start, f"{seqid}\tsrc\tCDS\t{start}\t{start + 90 + e}\t.\t+\t0\tID=cds{tid}.{e};Parent={tid}"))
            if messy and rnd.random() < 0.15:
                rows.append((pos, f"{seqid}\tsrc\tmRNA\tNaN\t10\t.\t+\t.\tID={seqid}.bad{g};Parent={gid}"))  # bad int
                rows.append((pos, f"{seqid}\tsrc\texon\t1\t2"))  # too few columns
                rows.append((pos, f"{seqid}\tsrc\tmRNA\t5\t50\t.\t+\t.\tParent={gid}"))  # no ID
                rows.append((pos, f"{seqid}\tsrc\tCDS\t5\t50\t.\t+\t0\tID=orphan"))  # no Parent
                rows.append((pos, f"{seqid}\tsrc\tregion\t1\t999\t.\t+\t.\tID=reg{g}"))
            pos += 6000
        rows.sort(key=lambda r: r[0])
        out.append("##sequence-region\n".rstrip("\n")) if False else None
        out.extend(line for _, line in rows)
    return ["##gff-version 3"] + out


def _as_dict(stats):
    return stats.to_mongo().to_dict()


class TestEquivalenceWithPreviousImplementation:
    @pytest.mark.parametrize("seed", range(8))
    def test_random_files_give_identical_statistics(self, seed):
        lines = _gff_lines(seed)
        expected = _as_dict(old_impl._compute_features_statistics_from_lines(iter(lines)))
        actual = _as_dict(new_impl._compute_features_statistics_from_lines(iter(lines)))
        assert actual == expected
        assert actual["transcript_type_stats"]  # the generator really exercises the code

    def test_empty_and_comment_only_input(self):
        for lines in ([], ["##gff-version 3"], [""]):
            assert _as_dict(new_impl._compute_features_statistics_from_lines(iter(lines))) == \
                _as_dict(old_impl._compute_features_statistics_from_lines(iter(lines)))

    def test_exon_listed_before_its_transcript_and_duplicate_ids(self):
        lines = [
            "c1\ts\texon\t10\t20\t.\t+\t.\tID=e1;Parent=t1",
            "c1\ts\tmRNA\t10\t90\t.\t+\t.\tID=t1;Parent=g1;biotype=x",
            "c1\ts\tmRNA\t10\t60\t.\t+\t.\tID=t1;Parent=g1;biotype=y",  # duplicate id: last wins
            "c1\ts\tgene\t10\t90\t.\t+\t.\tID=g1",
            "c1\ts\tgene_segment\t10\t95\t.\t+\t.\tID=g1;biotype=zz",  # same id later: earliest eligible wins
        ]
        assert _as_dict(new_impl._compute_features_statistics_from_lines(iter(lines))) == \
            _as_dict(old_impl._compute_features_statistics_from_lines(iter(lines)))


class TestPerSeqidGrouping:
    """Genes/transcripts are grouped per seqid (a feature id never spans seqids), so ids reused
    in different seqids are counted separately and the unique-gene counts are summed per seqid."""

    @staticmethod
    def _lines(seqids=3, genes=4):
        lines = []
        for s in range(seqids):
            for g in range(genes):
                base = g * 1000 + 1
                lines.append(f"chr{s}\tsrc\tgene\t{base}\t{base + 900}\t.\t+\t.\tID=gene{g};biotype=protein_coding")
                lines.append(f"chr{s}\tsrc\tmRNA\t{base}\t{base + 800}\t.\t+\t.\tID=tx{g};Parent=gene{g}")
                lines.append(f"chr{s}\tsrc\texon\t{base}\t{base + 100}\t.\t+\t.\tID=ex{g};Parent=tx{g}")
        return lines

    def test_ids_reused_across_seqids_are_separate_features(self):
        stats = _as_dict(new_impl._compute_features_statistics_from_lines(iter(self._lines())))
        assert stats["gene_category_stats"]["coding"]["total_count"] == 12  # 3 seqids x 4 genes
        assert stats["transcript_type_stats"]["mRNA"]["total_count"] == 12
        assert stats["transcript_type_stats"]["mRNA"]["associated_genes"]["total_count"] == 12

    def test_distinct_ids_match_the_previous_implementation(self):
        lines = _gff_lines(11, seqids=6, genes_per_seqid=10)
        assert _as_dict(new_impl._compute_features_statistics_from_lines(iter(lines))) == \
            _as_dict(old_impl._compute_features_statistics_from_lines(iter(lines)))


def _big_single_seqid(genes=4000):
    for i in range(genes):
        base = i * 10000 + 1
        yield f"chr1\tsrc\tgene\t{base}\t{base + 9000}\t.\t+\t.\tID=gene{i};biotype=protein_coding"
        for t in range(2):
            tid = f"tx{i}.{t}"
            yield f"chr1\tsrc\tmRNA\t{base}\t{base + 8000}\t.\t+\t.\tID={tid};Parent=gene{i}"
            for e in range(8):
                start = base + e * 500
                yield f"chr1\tsrc\texon\t{start}\t{start + 300}\t.\t+\t.\tID=ex{tid}.{e};Parent={tid}"
                yield f"chr1\tsrc\tCDS\t{start}\t{start + 250}\t.\t+\t0\tID=cds{tid}.{e};Parent={tid}"


def _peak(func):
    tracemalloc.start()
    try:
        result = func()
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    return result, peak


class TestMemory:
    def test_one_huge_seqid_needs_far_less_memory_than_before(self):
        old_result, old_peak = _peak(lambda: old_impl._compute_features_statistics_from_lines(_big_single_seqid()))
        new_result, new_peak = _peak(lambda: new_impl._compute_features_statistics_from_lines(_big_single_seqid()))
        assert _as_dict(new_result) == _as_dict(old_result)
        # The old code kept every line of the seqid as a Python string; measured ratio is ~0.2-0.3.
        assert new_peak < old_peak * 0.5, (new_peak, old_peak)

    def test_memory_does_not_grow_with_the_number_of_exon_cds_lines(self):
        def run(exons):
            def gen():
                for i in range(300):
                    base = i * 100000 + 1
                    yield f"chr1\ts\tgene\t{base}\t{base + 90000}\t.\t+\t.\tID=g{i}"
                    yield f"chr1\ts\tmRNA\t{base}\t{base + 90000}\t.\t+\t.\tID=t{i};Parent=g{i}"
                    for e in range(exons):
                        yield f"chr1\ts\texon\t{base + e}\t{base + e + 50}\t.\t+\t.\tID=e{i}.{e};Parent=t{i}"
            return _peak(lambda: new_impl._compute_features_statistics_from_lines(gen()))[1]

        small, large = run(10), run(100)
        # 10x the exons is only ~4 extra bytes each (array('i')), nowhere near a full line each.
        assert large < small * 2.5, (small, large)
