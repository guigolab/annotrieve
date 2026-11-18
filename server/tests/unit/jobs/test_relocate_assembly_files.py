"""Files follow the assembly's taxid: live hooks and the relocate_misplaced_assembly_files backfill."""
from pathlib import Path

import pytest

from db.models import GenomeAnnotation
from jobs import relocate_assembly_files as backfill
from jobs.services import file_layout
from tests.integration.factories import make_annotation, make_assembly
from tests.unit.jobs.mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

ACC = "GCA_949709995.1"
OLD, NEW = "2219007", "3440260"
MD5 = "b" * 32


@pytest.fixture
def app():
    """In-process mongomock database (the name `app` keeps the test signatures short)."""
    from mongoengine import disconnect

    connect_mongomock("relocate_assembly_files_test")
    from db.models import GenomeAssembly

    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    GenomeAssembly.objects.delete()
    disconnect(alias="default")


@pytest.fixture
def annotations_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    import helpers.assembly_sequence_files as seq_files

    root = tmp_path / "annotations"
    root.mkdir()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(root))
    return root


def _write(root: Path, rel: str, content: str = "x") -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


def _annotation_in(root: Path, folder: str, *, taxid: str = NEW, md5: str = MD5):
    """An annotation whose files and database paths sit under `folder`."""
    name = f"Ensembl_{md5}.gff.gz"
    for suffix in ("", ".csi", ".contigs.txt"):
        _write(root, f"{folder}/{ACC}/{name}{suffix}", "gff" if not suffix else suffix)
    doc = make_annotation(annotation_id=md5, assembly_accession=ACC, taxid=taxid, database="Ensembl")
    GenomeAnnotation.objects(annotation_id=md5).update_one(
        set__indexed_file_info__bgzipped_path=f"/{folder}/{ACC}/{name}",
        set__indexed_file_info__csi_path=f"/{folder}/{ACC}/{name}.csi",
    )
    return name, doc


def _db_paths(md5: str = MD5):
    info = GenomeAnnotation.objects.get(annotation_id=md5).indexed_file_info
    return info.bgzipped_path, info.csi_path


class TestRelocateAssembly:
    def test_moves_annotation_and_assembly_files_and_repoints_the_database(self, app, annotations_dir):
        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(annotations_dir, OLD)
        _write(annotations_dir, f"{NEW}/{ACC}/chromosomes.json", "[]")      # already under the new taxid

        stats = file_layout.relocate_assembly(ACC, NEW)

        assert stats["moved"] == 3 and stats["repointed"] == 1 and not stats["errors"]
        for suffix in ("", ".csi", ".contigs.txt"):
            assert (annotations_dir / NEW / ACC / f"{name}{suffix}").is_file()
        assert (annotations_dir / NEW / ACC / "chromosomes.json").is_file()
        assert not (annotations_dir / OLD).exists()                       # empty old folders are removed
        assert _db_paths() == (f"/{NEW}/{ACC}/{name}", f"/{NEW}/{ACC}/{name}.csi")

    def test_assembly_level_file_already_in_target_wins_and_other_differences_are_conflicts(
        self, app, annotations_dir
    ):
        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(annotations_dir, OLD)
        _write(annotations_dir, f"{OLD}/{ACC}/chromosomes.json", "old")
        _write(annotations_dir, f"{NEW}/{ACC}/chromosomes.json", "new, regenerated")
        _write(annotations_dir, f"{NEW}/{ACC}/{name}.contigs.txt", "a different contigs file")

        stats = file_layout.relocate_assembly(ACC, NEW)

        assert (annotations_dir / NEW / ACC / "chromosomes.json").read_text() == "new, regenerated"
        assert not (annotations_dir / OLD / ACC / "chromosomes.json").exists()
        assert [c for c in stats["conflicts"] if name in c]                  # same name, different size
        assert (annotations_dir / OLD / ACC / f"{name}.contigs.txt").is_file()  # conflict stays put

    def test_database_is_not_repointed_to_a_file_that_is_not_there(self, app, annotations_dir):
        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(annotations_dir, OLD)
        (annotations_dir / OLD / ACC / name).unlink()

        stats = file_layout.relocate_assembly(ACC, NEW)

        assert stats["repointed"] == 0 and stats["missing"]
        assert _db_paths()[0] == f"/{OLD}/{ACC}/{name}"

    def test_repoints_when_files_were_already_moved_by_hand(self, app, annotations_dir):
        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(annotations_dir, NEW)
        GenomeAnnotation.objects(annotation_id=MD5).update_one(
            set__indexed_file_info__bgzipped_path=f"/{OLD}/{ACC}/{name}",
            set__indexed_file_info__csi_path=f"/{OLD}/{ACC}/{name}.csi",
        )

        stats = file_layout.relocate_assembly(ACC, NEW)

        assert stats["moved"] == 0 and stats["repointed"] == 1
        assert _db_paths()[0] == f"/{NEW}/{ACC}/{name}"

    def test_unsafe_values_never_build_a_path(self, app, annotations_dir):
        stats = file_layout.relocate_assembly("../../etc", "3440260")
        assert stats["errors"] and stats["moved"] == 0
        assert file_layout.move_assembly_files("1/../..", "2", ACC) == {"moved": 0, "deduped": 0, "conflicts": []}


class TestBackfillJob:
    def _drifted(self, root: Path):
        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(root, OLD, taxid=OLD)                        # annotation also still on the old taxid
        _write(root, f"{NEW}/{ACC}/chromosomes.json", "[]")
        return name

    def test_dry_run_reports_and_changes_nothing(self, app, annotations_dir):
        name = self._drifted(annotations_dir)

        stats = backfill.relocate_misplaced_assembly_files(dry_run=True)

        assert stats["misplaced_assemblies"] == 1 and stats["files_moved"] == 3
        assert stats["annotations_repointed"] == 1 and stats["annotation_taxid_mismatch"] == 1
        assert (annotations_dir / OLD / ACC / name).is_file()
        assert _db_paths()[0] == f"/{OLD}/{ACC}/{name}"

    def test_apply_moves_everything_and_a_second_run_finds_nothing(self, app, annotations_dir):
        name = self._drifted(annotations_dir)

        stats = backfill.relocate_misplaced_assembly_files(dry_run=False)

        assert stats["files_moved"] == 3 and stats["annotations_repointed"] == 1 and not stats["errors"]
        assert (annotations_dir / NEW / ACC / name).is_file()
        assert not (annotations_dir / OLD).exists()
        assert _db_paths()[0] == f"/{NEW}/{ACC}/{name}"
        # the annotation's own taxid belongs to update_records: reported, not changed here
        assert GenomeAnnotation.objects.get(annotation_id=MD5).taxid == OLD

        again = backfill.relocate_misplaced_assembly_files(dry_run=False)
        assert again["misplaced_assemblies"] == 0 and again["files_moved"] == 0

    def test_finds_an_old_folder_holding_only_assembly_files(self, app, annotations_dir):
        make_assembly(accession=ACC, taxid=NEW)
        _write(annotations_dir, f"{OLD}/{ACC}/assembly_report.txt", "report")

        stats = backfill.relocate_misplaced_assembly_files(dry_run=False)

        assert stats["misplaced_assemblies"] == 1
        assert (annotations_dir / NEW / ACC / "assembly_report.txt").read_text() == "report"
        assert not (annotations_dir / OLD).exists()

    def test_leaves_directories_of_unknown_assemblies_alone(self, app, annotations_dir):
        _write(annotations_dir, f"{OLD}/GCA_000000001.1/chromosomes.json", "[]")

        stats = backfill.relocate_misplaced_assembly_files(dry_run=False)

        assert stats["misplaced_assemblies"] == 0
        assert (annotations_dir / OLD / "GCA_000000001.1" / "chromosomes.json").is_file()

    def test_refuses_to_apply_while_the_import_job_holds_the_lock(self, app, annotations_dir, monkeypatch):
        from contextlib import contextmanager

        name = self._drifted(annotations_dir)

        @contextmanager
        def busy():
            yield False

        monkeypatch.setattr(backfill, "_exclusive_run", busy)
        stats = backfill.relocate_misplaced_assembly_files(dry_run=False)

        assert "import job is running" in stats["skipped"]
        assert (annotations_dir / OLD / ACC / name).is_file()


class TestLiveHooks:
    def test_assembly_taxid_change_moves_the_files(self, app, annotations_dir):
        from jobs.services import assembly as assembly_service

        make_assembly(accession=ACC, taxid=OLD)
        name, _ = _annotation_in(annotations_dir, OLD, taxid=OLD)

        assembly_service.update_assemblies_from_ncbi_report({"reports": [{
            "accession": ACC,
            "assembly_info": {"assembly_status": "current"},
            "organism": {"tax_id": int(NEW), "organism_name": "Araneus"},
        }]})

        assert (annotations_dir / NEW / ACC / name).is_file()
        assert not (annotations_dir / OLD).exists()
        assert _db_paths()[0] == f"/{NEW}/{ACC}/{name}"

    def test_stale_annotation_update_moves_the_files(self, app, annotations_dir):
        from jobs.services import annotation as annotation_service

        make_assembly(accession=ACC, taxid=NEW)
        name, _ = _annotation_in(annotations_dir, OLD, taxid=OLD)

        annotation_service.update_stale_annotations([NEW])

        assert GenomeAnnotation.objects.get(annotation_id=MD5).taxid == NEW
        assert (annotations_dir / NEW / ACC / name).is_file()
        assert _db_paths()[0] == f"/{NEW}/{ACC}/{name}"
