"""Sweep skips folders annotations still use; restore_missing_assemblies brings assemblies back."""
from unittest.mock import patch

import pytest

from db.models import GenomeAnnotation, GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from jobs import assemblies as assemblies_job
from jobs import restore_assemblies as restore
from tests.integration.factories import make_annotation, make_assembly
from tests.unit.jobs.mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

KNOWN, DANGLING, ORPHAN = "GCA_000000001.1", "GCA_000000002.1", "GCA_000000003.1"


@pytest.fixture
def world(tmp_path, monkeypatch):
    from mongoengine import disconnect

    connect_mongomock("restore_and_sweep")
    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    make_assembly(accession=KNOWN, taxid="9")
    make_annotation(annotation_id="a" * 32, assembly_accession=DANGLING, taxid="77", database="GenBank")
    GenomeAnnotation.objects(annotation_id="a" * 32).update_one(set__taxon_lineage=["1", "77"])
    for acc, tx in ((KNOWN, "9"), (DANGLING, "77"), (ORPHAN, "5")):
        d = tmp_path / tx / acc
        d.mkdir(parents=True)
        (d / "chromosomes.json").write_text("x")
    (tmp_path / "77" / DANGLING / "GenBank_x.gff.gz").write_text("gff")
    yield tmp_path
    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    disconnect(alias="default")


def test_sweep_leaves_folders_that_annotations_still_use(world):
    stats = assemblies_job.sweep_orphan_assembly_files(dry_run=False)
    assert stats["referenced_dirs"] == [f"77/{DANGLING}"] and stats["referenced"] == 1
    assert stats["orphan_dirs"] == [f"5/{ORPHAN}"]
    assert (world / "77" / DANGLING / "chromosomes.json").is_file()   # untouched
    assert (world / "77" / DANGLING / "GenBank_x.gff.gz").is_file()
    assert not (world / "5" / ORPHAN).exists()                         # real orphan cleaned
    assert (world / "9" / KNOWN / "chromosomes.json").is_file()


def test_sweep_dry_run_changes_nothing(world):
    stats = assemblies_job.sweep_orphan_assembly_files(dry_run=True)
    assert stats["files_removed"] == 0 and (world / "5" / ORPHAN / "chromosomes.json").is_file()


def test_find_missing_assemblies(world):
    assert restore.find_missing_assemblies() == [DANGLING]


def test_restore_dry_run_changes_nothing(world):
    with patch.object(restore.assembly_service, "fetch_new_assemblies_and_bioprojects") as fetch:
        stats = restore.restore_missing_assemblies(dry_run=True)
    fetch.assert_not_called()
    assert stats["missing"] == 1 and stats["missing_sample"] == [DANGLING]


def test_restore_fetches_with_annotation_lineage_and_queues_sync(world):
    with patch.object(restore.assembly_service, "fetch_new_assemblies_and_bioprojects",
                      return_value=[DANGLING]) as fetch, \
         patch("jobs.assemblies.sync_new_assemblies_from_summary") as sync:
        stats = restore.restore_missing_assemblies(dry_run=False)
    args = fetch.call_args.args
    assert args[0] == [DANGLING] and args[2] == {"77": ["1", "77"]}
    sync.delay.assert_called_once_with(accessions=[DANGLING])
    assert stats["restored"] == 1 and stats["not_restored"] == 0


def test_restore_reports_accessions_ncbi_did_not_return_and_deletes_nothing(world):
    with patch.object(restore.assembly_service, "fetch_new_assemblies_and_bioprojects", return_value=[]), \
         patch("jobs.assemblies.sync_new_assemblies_from_summary") as sync:
        stats = restore.restore_missing_assemblies(dry_run=False)
    sync.delay.assert_not_called()
    assert stats["not_restored_sample"] == [DANGLING]
    assert GenomeAnnotation.objects.count() == 1


def test_restore_skips_while_the_import_runs(world):
    from contextlib import contextmanager

    @contextmanager
    def busy():
        yield False

    with patch.object(restore, "_exclusive_run", busy), \
         patch.object(restore.assembly_service, "fetch_new_assemblies_and_bioprojects") as fetch:
        stats = restore.restore_missing_assemblies(dry_run=False)
    fetch.assert_not_called()
    assert "import job is running" in stats["skipped"]
