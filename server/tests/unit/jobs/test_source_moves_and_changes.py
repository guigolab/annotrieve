"""
How the importer reacts when the tracker reports a moved url and/or changed content.

Tracker facts (genome-annotation-tracker): `md5_checksum` is the md5 of the UNCOMPRESSED published
file; NCBI rows are keyed by assembly accession, Ensembl/community rows by url (a new release is a
new url); the md5 is refreshed only when the HTTP Last-Modified changed (or after 14 days).
"""

import gzip
import hashlib
import importlib
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import mongomock
import pytest
from mongoengine import connect, disconnect

from jobs.services import annotation as ann_svc
from jobs.services.classes import AnnotationToProcess
from tests.integration.factories import make_annotation

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


@pytest.fixture
def mongo():
    from db.models import AnnotationError, GenomeAnnotation

    disconnect(alias="default")
    connect(db="moves", alias="default", mongo_client_class=mongomock.MongoClient)
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    disconnect(alias="default")


def _row(**kwargs) -> AnnotationToProcess:
    defaults = dict(
        source_database="Ensembl", annotation_provider="Ensembl", release_date="2024-01-02",
        last_modified_date="2024-01-03", md5_checksum="src1", access_url="https://example.com/a.gff.gz",
        taxon_id="9606", organism_name="Homo sapiens", assembly_accession="GCA_1", assembly_name="GRCh38",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


def _store(annotation_id="a" * 32, url="https://example.com/a.gff.gz", md5="src1", assembly="GCA_1"):
    ann = make_annotation(annotation_id=annotation_id, assembly_accession=assembly, with_stats=False, with_busco=False)
    ann.source_file_info.url_path = url
    ann.source_file_info.uncompressed_md5 = md5
    ann.save()
    return ann


def _errors():
    from db.models import AnnotationError

    return {e.url_path: e for e in AnnotationError.objects}


class TestUrlMovesWithoutDownload:
    def test_moved_file_is_reconciled_and_skipped_next_run(self, mongo):
        stored = _store()
        moved = _row(access_url="https://example.com/v2/a.gff.gz", last_modified_date="2025-02-02")
        with patch.object(ann_svc, "download_gff_file") as download:
            remaining, handled = ann_svc.reconcile_moved_sources([moved])
        download.assert_not_called()
        assert remaining == [] and handled == [moved]
        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/v2/a.gff.gz"
        assert stored.source_file_info.uncompressed_md5 == "src1"
        assert stored.source_file_info.last_modified == datetime(2025, 2, 2)
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([moved]) == []

    def test_unknown_md5_and_unchanged_rows_go_on_to_processing(self, mongo):
        _store()
        new = _row(md5_checksum="other", access_url="https://example.com/new.gff.gz")
        same = _row()  # already stored exactly like this
        remaining, handled = ann_svc.reconcile_moved_sources([new, same])
        assert remaining == [new, same] and handled == []

    def test_same_file_listed_for_another_assembly_is_a_recorded_conflict(self, mongo):
        stored = _store()
        other = _row(access_url="https://example.com/other.gff.gz", assembly_accession="GCA_2")
        remaining, handled = ann_svc.reconcile_moved_sources([other])
        assert remaining == [] and handled == [other]
        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/a.gff.gz"
        error = _errors()["https://example.com/other.gff.gz"]
        assert error.error_kind == ann_svc.ERROR_KIND_CONFLICT and "different assembly" in error.error_message

    def test_new_url_owned_by_another_annotation_is_a_recorded_conflict(self, mongo):
        stored = _store()
        _store(annotation_id="b" * 32, url="https://example.com/taken.gff.gz", md5="src2", assembly="GCA_2")
        moved = _row(access_url="https://example.com/taken.gff.gz")
        remaining, handled = ann_svc.reconcile_moved_sources([moved])
        assert remaining == [] and handled == [moved]
        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/a.gff.gz"
        assert _errors()["https://example.com/taken.gff.gz"].error_kind == ann_svc.ERROR_KIND_CONFLICT

    def test_conflict_errors_survive_the_stale_error_cleanup(self, mongo):
        """The error's url is another annotation's stored url; only the md5 tells it is not stale."""
        _store()
        _store(annotation_id="b" * 32, url="https://example.com/taken.gff.gz", md5="src2", assembly="GCA_2")
        ann_svc.reconcile_moved_sources([_row(access_url="https://example.com/taken.gff.gz")])
        assert ann_svc.clean_up_annotations_with_errors() == 0
        assert "https://example.com/taken.gff.gz" in _errors()

    def test_second_listing_of_a_still_listed_file_is_left_alone(self, mongo):
        stored = _store()
        copy = _row(access_url="https://example.com/copy/a.gff.gz")
        listed = {"https://example.com/a.gff.gz", copy.access_url}
        assert ann_svc.reconcile_moved_sources([copy], listed_urls=listed) == ([], [copy])
        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/a.gff.gz"
        assert _errors() == {}

    def test_lookup_failure_processes_everything_as_before(self, mongo):
        rows = [_row()]
        with patch.object(ann_svc.GenomeAnnotation, "objects", side_effect=RuntimeError("db down")):
            assert ann_svc.reconcile_moved_sources(rows) == (rows, [])


class TestConflictsAreRetriedMonthly:
    def _conflict(self, age_days):
        _store()
        row = _row(access_url="https://example.com/other.gff.gz", assembly_accession="GCA_2")
        ann_svc.reconcile_moved_sources([row])
        from db.models import AnnotationError

        AnnotationError.objects(url_path=row.access_url).update(
            set__recorded_at=datetime.utcnow() - timedelta(days=age_days))
        return row

    def test_recent_conflict_is_skipped(self, mongo):
        row = self._conflict(2)
        assert ann_svc.skip_known_conflicts([row]) == []

    def test_old_conflict_is_retried(self, mongo):
        row = self._conflict(31)
        assert ann_svc.skip_known_conflicts([row]) == [row]

    def test_changed_md5_is_not_skipped(self, mongo):
        row = self._conflict(2)
        changed = _row(access_url=row.access_url, assembly_accession="GCA_2", md5_checksum="different")
        assert ann_svc.skip_known_conflicts([changed]) == [changed]

    def test_plain_processing_errors_are_still_retried_every_run(self, mongo):
        row = _row(access_url="https://example.com/broken.gff.gz", md5_checksum="b1")
        ann_svc.handle_annotation_error(row, "download failed")
        assert ann_svc.skip_known_conflicts([row]) == [row]

    def test_failure_to_read_errors_skips_nothing(self):
        rows = [_row()]
        with patch.object(ann_svc.AnnotationError, "objects", side_effect=RuntimeError("db down")):
            assert ann_svc.skip_known_conflicts(rows) == rows

    def test_retry_window_is_configurable(self, mongo):
        row = self._conflict(2)
        assert ann_svc.skip_known_conflicts([row], retry_days=1) == [row]


class TestContentChangesAndTrackerLag:
    def test_changed_tracker_md5_for_a_stored_url_is_reprocessed(self, mongo):
        _store()
        changed = _row(md5_checksum="src2")  # same url, tracker refreshed the md5
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([changed]) == [changed]
        assert ann_svc.reconcile_moved_sources([changed]) == ([changed], [])

    def test_lagging_tracker_heals_when_it_catches_up(self, mongo):
        """Tracker md5 stale -> stored under it; once the tracker refreshes, the new pair is processed again."""
        _store(md5="stale")
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([_row(md5_checksum="stale")]) == []
        fresh = _row(md5_checksum="fresh")
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([fresh]) == [fresh]

    def test_new_release_url_with_new_content_is_a_new_annotation_and_the_old_one_stays(self, mongo):
        from db.models import GenomeAnnotation

        _store(url="https://example.com/2023_03/genes.gff3.gz")
        new_release = _row(access_url="https://example.com/2024_01/genes.gff3.gz", md5_checksum="rel2")
        remaining, handled = ann_svc.reconcile_moved_sources([new_release])
        assert remaining == [new_release] and handled == []
        _store(annotation_id="c" * 32, url=new_release.access_url, md5="rel2", assembly="GCA_1")
        assert GenomeAnnotation.objects.count() == 2  # removal is left to the 404 pruning


class TestSourceMd5Verification:
    def test_md5_of_the_uncompressed_content(self, tmp_path):
        content = b"##gff-version 3\nchr1\ts\tgene\t1\t2\t.\t+\t.\tID=a\n"
        path = tmp_path / "a.gff.gz"
        path.write_bytes(gzip.compress(content))
        assert ann_svc.compute_source_md5(str(path)) == hashlib.md5(content).hexdigest()

    def test_trailing_garbage_is_tolerated_like_the_import_pipeline(self, tmp_path):
        content = b"chr1\ts\tgene\t1\t2\t.\t+\t.\tID=a\n"
        path = tmp_path / "a.gff.gz"
        path.write_bytes(gzip.compress(content) + b"\x00junk")
        assert ann_svc.compute_source_md5(str(path)) == hashlib.md5(content).hexdigest()

    def test_unreadable_file_gives_none(self, tmp_path):
        assert ann_svc.compute_source_md5(str(tmp_path / "missing.gff.gz")) is None

    def test_pipeline_collects_a_mismatch_and_still_processes(self, tmp_path):
        content = b"chr1\ts\tgene\t1\t2\t.\t+\t.\tID=a\n"
        row = _row(md5_checksum="tracker-md5")
        work = tmp_path / "work"

        def fake_process(annotation, tmp_subdir, out, known):
            tmp_dir = Path(tmp_subdir)
            tmp_dir.mkdir(parents=True, exist_ok=True)
            (tmp_dir / "tracker-md5.gff.gz").write_bytes(gzip.compress(content))
            return "sorted-md5", 10

        from unittest.mock import MagicMock

        produced = MagicMock()
        row.to_genome_annotation = MagicMock(return_value=produced)
        mismatches = []
        with (
            patch.object(imp, "ANNOTATIONS_PATH", str(tmp_path / "ann")),
            patch.object(imp.annotation_service, "process_annotation_file", side_effect=fake_process),
            patch.object(imp.feature_summary_service, "compute_features_summary",
                         return_value=MagicMock(types=["gene"], sources=["s"])),
            patch.object(imp.seq_files, "write_contigs_from_tabix"),
            patch.object(imp.feature_stats_service, "compute_features_statistics", return_value=MagicMock()),
            patch.object(imp.annotation_service, "init_indexed_file_info", return_value=MagicMock()),
        ):
            result = imp.process_annotations_pipeline([row], {}, set(), work_dir=str(work), md5_mismatches=mismatches)
        assert result == [produced]
        assert len(mismatches) == 1 and mismatches[0][0] is row
        assert hashlib.md5(content).hexdigest() in mismatches[0][1]

    def test_mismatch_is_recorded_after_the_save_and_survives_the_cleanup(self, mongo):
        stored = _store(md5="tracker-md5")
        row = _row(md5_checksum="tracker-md5")
        mismatches = [(row, "Downloaded content md5 x differs from the tracker md5 tracker-md5")]
        imp._record_md5_mismatches(mismatches, [stored], [stored.annotation_id])
        error = _errors()[row.access_url]
        assert error.error_kind == ann_svc.ERROR_KIND_MD5_MISMATCH
        assert mismatches == []
        # the stored pair equals the error's pair, which would normally make the error "stale"...
        assert ann_svc.clean_up_annotations_with_errors() == 0
        assert row.access_url in _errors()

    def test_nothing_is_recorded_for_annotations_that_were_not_stored(self, mongo):
        row = _row(md5_checksum="tracker-md5")
        stored = _store(annotation_id="d" * 32, md5="other", url="https://example.com/z.gff.gz")
        imp._record_md5_mismatches([(row, "m")], [stored], [])
        assert _errors() == {}


class TestJobWiring:
    def _run(self, rows, moved_result):
        from tests.unit.jobs.test_import_audit_medium import _JobHarness

        with _JobHarness()._job(rows, {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error"), \
                patch.object(imp.annotation_service, "skip_known_conflicts", side_effect=lambda xs: xs) as skip, \
                patch.object(imp.annotation_service, "reconcile_moved_sources", return_value=moved_result) as moved, \
                patch.object(imp, "process_annotations_pipeline", return_value=[]) as pipeline:
            imp._run_import("/tmp")
        return skip, moved, pipeline

    def test_conflicts_are_skipped_and_moved_files_are_not_processed(self):
        row = _row()
        skip, moved, pipeline = self._run([row], ([], [row]))
        skip.assert_called_once()
        moved.assert_called_once()
        pipeline.assert_not_called()

    def test_remaining_rows_still_go_through_the_pipeline(self):
        row = _row()
        _, _, pipeline = self._run([row], ([row], []))
        pipeline.assert_called_once()
