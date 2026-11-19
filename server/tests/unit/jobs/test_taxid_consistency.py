"""Fixes: importer uses the assembly's taxid, stale-annotation check is per assembly, no "None" taxid."""
import pytest

from db.models import GenomeAnnotation, GenomeAssembly
from jobs.services import annotation as annotation_service
from jobs.services import assembly as assembly_service
from jobs.services.classes import AnnotationToProcess
from tests.integration.factories import make_annotation, make_assembly
from tests.unit.jobs.mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

ACC = "GCA_949709995.1"
OLD, NEW, OTHER = "2219007", "3440260", "9606"


@pytest.fixture
def app():
    from mongoengine import disconnect

    connect_mongomock("taxid_consistency_test")
    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    disconnect(alias="default")


def _row(taxon):
    return AnnotationToProcess(
        taxon_id=taxon, assembly_accession=ACC, organism_name="tracker name", access_url="http://x/a.gff.gz",
        md5_checksum="a" * 32, source_database="Ensembl")


def test_normalize_taxid():
    assert assembly_service.normalize_taxid(9606) == "9606"
    assert assembly_service.normalize_taxid(" 12 ") == "12"
    for bad in (None, "None", "", "abc"):
        assert assembly_service.normalize_taxid(bad) is None


def test_missing_tax_id_keeps_stored_taxid(app):
    make_assembly(accession=ACC, taxid=OLD)
    assembly_service.update_assemblies_from_ncbi_report({"reports": [{
        "accession": ACC, "assembly_info": {"assembly_status": "current"}, "organism": {"organism_name": "x"},
    }]})
    assert GenomeAssembly.objects.get(assembly_accession=ACC).taxid == OLD


def test_parse_skips_assembly_without_tax_id():
    assert assembly_service.parse_assembly_from_ncbi(
        {"accession": ACC, "assembly_info": {}, "organism": {}}, {}, {}) is None


def test_import_uses_assembly_taxid(app):
    make_assembly(accession=ACC, taxid=NEW)
    GenomeAssembly.objects(assembly_accession=ACC).update_one(set__taxon_lineage=["1", NEW])
    rows, lineages = [_row(OLD)], {OLD: ["1", OLD]}
    assert annotation_service.align_annotations_with_assemblies(rows, lineages) == 1
    assert rows[0].taxon_id == NEW
    assert lineages[NEW] == ["1", NEW]
    path = annotation_service.init_annotation_file_paths("/tmp/ann_root_x", rows[0])[1]
    assert path.startswith(f"/{NEW}/{ACC}/")


def test_import_leaves_matching_or_unknown_assemblies(app):
    make_assembly(accession=ACC, taxid=NEW)
    same = [_row(NEW)]
    assert annotation_service.align_annotations_with_assemblies(same, {}) == 0
    unknown = _row(OLD)
    unknown.assembly_accession = "GCA_000000001.1"
    assert annotation_service.align_annotations_with_assemblies([unknown], {}) == 0
    assert unknown.taxon_id == OLD


def test_stale_annotation_found_even_if_old_taxid_used_by_another_assembly(app):
    make_assembly(accession=ACC, taxid=NEW)
    make_assembly(accession="GCA_000000002.1", taxid=OLD)  # OLD stays a valid assembly taxid
    make_annotation(annotation_id="b" * 32, assembly_accession=ACC, taxid=OLD, database="Ensembl")
    annotation_service.update_stale_annotations([NEW, OLD])
    assert GenomeAnnotation.objects.get(annotation_id="b" * 32).taxid == NEW


def test_missing_assembly_deleted_only_when_taxid_unknown(app, tmp_path, monkeypatch):
    monkeypatch.setenv("LOCAL_ANNOTATIONS_DIR", str(tmp_path))
    make_assembly(accession="GCA_000000002.1", taxid=OLD)
    make_annotation(annotation_id="c" * 32, assembly_accession="GCA_000000003.1", taxid=OLD, database="Ensembl")
    make_annotation(annotation_id="d" * 32, assembly_accession="GCA_000000004.1", taxid=OTHER, database="Ensembl")
    annotation_service.update_stale_annotations([OLD])
    ids = set(GenomeAnnotation.objects.scalar("annotation_id"))
    assert "c" * 32 in ids and "d" * 32 not in ids


def test_lineage_falls_back_to_the_organism(app):
    from db.models import Organism
    make_assembly(accession=ACC, taxid=NEW)
    GenomeAssembly.objects(assembly_accession=ACC).update_one(set__taxon_lineage=[])
    Organism(taxid=NEW, organism_name="o", taxon_lineage=["1", NEW]).save()
    lineages = {}
    annotation_service.align_annotations_with_assemblies([_row(OLD)], lineages)
    assert lineages[NEW] == ["1", NEW]


def test_existing_lineage_is_not_overwritten(app):
    make_assembly(accession=ACC, taxid=NEW)
    lineages = {NEW: ["kept"]}
    annotation_service.align_annotations_with_assemblies([_row(OLD)], lineages)
    assert lineages[NEW] == ["kept"]


def test_stale_update_is_idempotent_and_leaves_matching_annotations(app):
    make_assembly(accession=ACC, taxid=NEW)
    make_annotation(annotation_id="e" * 32, assembly_accession=ACC, taxid=NEW, database="Ensembl")
    annotation_service.update_stale_annotations()
    annotation_service.update_stale_annotations()
    assert GenomeAnnotation.objects.get(annotation_id="e" * 32).taxid == NEW


def test_stale_update_skips_assembly_with_broken_taxid(app):
    make_assembly(accession=ACC, taxid="None")
    make_annotation(annotation_id="f" * 32, assembly_accession=ACC, taxid=OLD, database="Ensembl")
    annotation_service.update_stale_annotations([OLD])
    assert GenomeAnnotation.objects.get(annotation_id="f" * 32).taxid == OLD


def test_lineage_drift_with_same_taxid_is_aligned(app):
    make_assembly(accession=ACC, taxid=NEW)
    GenomeAssembly.objects(assembly_accession=ACC).update_one(set__taxon_lineage=["1", "2", NEW])
    make_annotation(annotation_id="1" * 32, assembly_accession=ACC, taxid=NEW, database="Ensembl")
    make_annotation(annotation_id="2" * 32, assembly_accession=ACC, taxid=NEW, database="Ensembl")
    GenomeAnnotation.objects(annotation_id="1" * 32).update_one(set__taxon_lineage=["1", NEW])
    GenomeAnnotation.objects(annotation_id="2" * 32).update_one(set__taxon_lineage=["1", "2", NEW])
    annotation_service.update_stale_annotations()
    assert {a.annotation_id: a.taxon_lineage for a in GenomeAnnotation.objects} == {
        "1" * 32: ["1", "2", NEW], "2" * 32: ["1", "2", NEW]}


def test_empty_assembly_lineage_never_overwrites_annotations(app):
    make_assembly(accession=ACC, taxid=NEW)
    GenomeAssembly.objects(assembly_accession=ACC).update_one(set__taxon_lineage=[])
    make_annotation(annotation_id="3" * 32, assembly_accession=ACC, taxid=NEW, database="Ensembl")
    GenomeAnnotation.objects(annotation_id="3" * 32).update_one(set__taxon_lineage=["1", NEW])
    annotation_service.update_stale_annotations()
    assert GenomeAnnotation.objects.get(annotation_id="3" * 32).taxon_lineage == ["1", NEW]
