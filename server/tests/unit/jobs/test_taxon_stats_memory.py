"""Audit OOM section: update_taxon_gene_and_transcript_stats must stay light and correct."""

import tracemalloc
from unittest.mock import patch

import mongomock
import pytest
from mongoengine import connect, disconnect

from db.embedded_documents import (
    AssociatedGenesStats,
    GeneCategoryFeatureStats,
    GenericLengthStats,
    GenericTranscriptTypeStats,
    GFFStats,
    TaxonAnnotationStats,
    TaxonBuscoScore,
)
from jobs.services import stats as stats_svc
from tests.integration.factories import make_annotation, make_taxon

pytestmark = pytest.mark.unit


@pytest.fixture
def mongo():
    from db.models import GenomeAnnotation, TaxonNode

    disconnect(alias="default")
    connect(db="taxon_stats", alias="default", mongo_client_class=mongomock.MongoClient)
    GenomeAnnotation.objects.delete()
    TaxonNode.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    TaxonNode.objects.delete()
    disconnect(alias="default")


_LEN = GenericLengthStats(min=1, max=2, mean=1.5)


def _gene(n):
    return GeneCategoryFeatureStats(total_count=n, length_stats=_LEN)


def _tx(n):
    return GenericTranscriptTypeStats(
        total_count=n, length_stats=_LEN, associated_genes=AssociatedGenesStats(total_count=1))


def _annotation(annotation_id, taxid, *, genes=None, transcripts=None):
    ann = make_annotation(
        annotation_id=annotation_id, taxid=taxid, assembly_accession=f"GCA_{annotation_id[:4]}",
        with_stats=False, with_busco=False)
    ann.features_statistics = GFFStats(
        gene_category_stats={k: _gene(v) for k, v in (genes or {}).items()},
        transcript_type_stats={k: _tx(v) for k, v in (transcripts or {}).items()},
    )
    ann.save()
    return ann


class TestTaxonStats:
    def test_counts_roll_up_to_ancestors_and_empty_taxa_get_zeroes(self, mongo):
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", genes={"coding": 100, "pseudogene": 7}, transcripts={"mRNA": 80, "tRNA": 5})
        _annotation("2" * 32, "9607", genes={"coding": 300}, transcripts={"mRNA": 120})
        for taxid in ("9606", "9607", "9605", "1", "777"):
            make_taxon(taxid=taxid, scientific_name=f"t{taxid}")

        stats_svc.update_taxon_gene_and_transcript_stats()

        shared = TaxonNode.objects.get(taxid="9605").stats
        assert shared.genes.coding.count.n == 2
        assert shared.genes.coding.count.mean == 200
        assert shared.genes.coding.count.median == 200
        assert shared.genes.coding.count.min == 100 and shared.genes.coding.count.max == 300
        assert shared.genes.coding.count.std == 100
        assert shared.genes.pseudogene.count.n == 1
        assert shared.genes.non_coding.count.n == 0
        assert shared.transcripts.mRNA.count.n == 2 and shared.transcripts.mRNA.count.mean == 100
        assert shared.transcripts.tRNA.count.n == 1

        species = TaxonNode.objects.get(taxid="9606").stats
        assert species.genes.coding.count.n == 1 and species.genes.coding.count.mean == 100
        assert TaxonNode.objects.get(taxid="1").stats.genes.coding.count.n == 2

        untouched = TaxonNode.objects.get(taxid="777").stats
        assert untouched.genes.coding.count.n == 0
        assert untouched.transcripts.mRNA.count.n == 0

    def test_both_lncrna_spellings_are_counted(self, mongo):
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", transcripts={"lnc_RNA": 10})
        _annotation("2" * 32, "9607", transcripts={"lncRNA": 30})
        make_taxon(taxid="9605", scientific_name="g")

        stats_svc.update_taxon_gene_and_transcript_stats()

        lnc = TaxonNode.objects.get(taxid="9605").stats.transcripts.lncRNA.count
        assert lnc.n == 2 and lnc.mean == 20

    def test_busco_and_other_node_fields_are_preserved(self, mongo):
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", genes={"coding": 5})
        node = make_taxon(taxid="9606", scientific_name="Homo sapiens", children=["a", "b"], rank="species")
        busco = TaxonBuscoScore(busco_lineage="eukaryota_odb12", total_count=255)
        TaxonNode.objects(taxid="9606").update_one(set__stats=TaxonAnnotationStats(busco=busco))

        stats_svc.update_taxon_gene_and_transcript_stats()

        node = TaxonNode.objects.get(taxid="9606")
        assert node.stats.busco.busco_lineage == "eukaryota_odb12"
        assert node.stats.busco.total_count == 255
        assert node.stats.genes.coding.count.n == 1
        assert node.children == ["a", "b"] and node.rank == "species"

    def test_rerun_is_idempotent(self, mongo):
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", genes={"coding": 5})
        make_taxon(taxid="9606", scientific_name="x")
        stats_svc.update_taxon_gene_and_transcript_stats()
        first = TaxonNode.objects.get(taxid="9606").stats.to_mongo().to_dict()
        stats_svc.update_taxon_gene_and_transcript_stats()
        assert TaxonNode.objects.get(taxid="9606").stats.to_mongo().to_dict() == first

    def test_no_data_at_all(self, mongo):
        make_taxon(taxid="9606", scientific_name="x")
        stats_svc.update_taxon_gene_and_transcript_stats()  # must not raise


class TestPipelineShape:
    def test_pipeline_projects_small_documents_and_never_unwinds_the_lineage(self):
        captured = {}

        class FakeQS:
            def aggregate(self, *pipeline):
                captured["pipeline"] = pipeline
                return iter([])

        with patch.object(stats_svc.GenomeAnnotation, "objects", FakeQS()), \
                patch.object(stats_svc, "TaxonNode") as node:
            node.objects.no_cache.return_value.scalar.return_value = []
            stats_svc.update_taxon_gene_and_transcript_stats()

        stages = [next(iter(stage)) for stage in captured["pipeline"]]
        assert "$unwind" not in stages
        projection = captured["pipeline"][stages.index("$project")]["$project"]
        # counts only, never the whole transcript_type_stats / gene_category_stats sub-documents
        assert all(
            key in ("_id", "taxon_lineage") or str(value).endswith(".total_count")
            for key, value in projection.items()
        )


class TestMemory:
    def test_counts_are_stored_compactly(self):
        lineage = [str(i) for i in range(30)]  # a deep lineage, like a real species
        rows = (
            {"taxon_lineage": lineage, "g_coding": 1000 + i, "g_non_coding": 2000 + i,
             "g_pseudogene": 3000 + i, "t_mRNA": 4000 + i, "t_lnc_RNA": 5000 + i,
             "t_miRNA": 6000 + i, "t_tRNA": 7000 + i}
            for i in range(10_000)
        )

        class FakeQS:
            def aggregate(self, *pipeline):
                return rows

        tracemalloc.start()
        try:
            with patch.object(stats_svc.GenomeAnnotation, "objects", FakeQS()), \
                    patch.object(stats_svc, "TaxonNode") as node:
                node.objects.no_cache.return_value.scalar.return_value = []
                stats_svc.update_taxon_gene_and_transcript_stats()
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        # 10k annotations x 30 taxa x 7 values = 2.1M values. Measured: ~8.6 MB as array('i'),
        # ~20 MB as a list of references to shared ints (and ~36 bytes/value, i.e. ~75 MB, when
        # every lineage copy decodes its own int, as the old $unwind pipeline did).
        assert peak < 13 * 1024 * 1024, peak
