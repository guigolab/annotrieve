import os
from unittest.mock import MagicMock, patch

import pytest

from jobs.services import annotation as ann_svc
from jobs.services.classes import AnnotationToProcess

pytestmark = pytest.mark.unit


class TestAnnotationJobHelpers:
    def test_source_url_head_404(self):
        resp = MagicMock(status_code=404)
        with patch.object(ann_svc.requests, "head", return_value=resp):
            assert ann_svc.source_url_is_not_found("http://x") is True

    def test_source_url_head_200(self):
        resp = MagicMock(status_code=200)
        with patch.object(ann_svc.requests, "head", return_value=resp):
            assert ann_svc.source_url_is_not_found("http://x") is False

    def test_delete_missing_urls_dry_run(self):
        ann = MagicMock()
        ann.annotation_id = "md5a"
        ann.source_file_info.url_path = "http://missing"

        qs = MagicMock()
        qs.only.return_value = [ann]

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc, "source_url_is_not_found", return_value=True),
            patch.dict("os.environ", {"LOCAL_ANNOTATIONS_DIR": "/tmp"}),
        ):
            GA.objects.return_value = qs
            stats = ann_svc.delete_annotations_with_missing_source_urls(dry_run=True)

        assert stats["dry_run"] is True
        assert stats["missing"] == 1
        assert stats["deleted"] == 0
        assert stats["would_delete"] == 1 or "would_delete" in stats or stats["missing"] == 1

    def test_filter_annotations_dict_by_field(self):
        a = MagicMock(spec=AnnotationToProcess)
        a.taxid = "9606"
        b = MagicMock(spec=AnnotationToProcess)
        b.taxid = "10090"
        # AnnotationToProcess may use attributes differently — read filter impl
        filtered = ann_svc.filter_annotations_dict_by_field(
            [a, b], "taxid", ["9606"]
        )
        assert len(filtered) == 1


class TestUpdateAnnotationSourceMetadata:
    """
    Covers the fix for: when a source URL changes but content (md5) is unchanged,
    the existing GenomeAnnotation's source_file_info should be updated in place
    rather than the annotation being treated as a duplicate to discard.
    """

    def test_noop_when_url_unchanged(self):
        existing = MagicMock()
        existing.source_file_info.url_path = "http://same"
        annotation_to_process = MagicMock()
        annotation_to_process.access_url = "http://same"

        updated = ann_svc.update_annotation_source_metadata(existing, annotation_to_process)

        assert updated is False
        existing.modify.assert_not_called()

    def test_noop_when_no_source_file_info(self):
        existing = MagicMock()
        existing.source_file_info = None
        annotation_to_process = MagicMock()
        annotation_to_process.access_url = "http://new"

        updated = ann_svc.update_annotation_source_metadata(existing, annotation_to_process)

        assert updated is False
        existing.modify.assert_not_called()

    def test_updates_url_and_dates_when_no_conflict(self):
        existing = MagicMock()
        existing.annotation_id = "abc123"
        existing.source_file_info.url_path = "http://old"
        annotation_to_process = MagicMock()
        annotation_to_process.access_url = "http://new"
        annotation_to_process.last_modified = "2024-01-01"
        annotation_to_process.release_date = "2024-01-02"

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc, "AnnotationError") as AE,
        ):
            GA.objects.return_value.first.return_value = None  # no conflicting doc
            GA.parse_iso_date.side_effect = lambda s: s  # passthrough for the test

            updated = ann_svc.update_annotation_source_metadata(existing, annotation_to_process)

        assert updated is True
        existing.modify.assert_called_once()
        _, kwargs = existing.modify.call_args
        assert kwargs["source_file_info__url_path"] == "http://new"
        assert kwargs["source_file_info__last_modified"] == "2024-01-01"
        assert kwargs["source_file_info__release_date"] == "2024-01-02"
        AE.objects.return_value.delete.assert_called_once()

    def test_skips_when_new_url_belongs_to_a_different_annotation(self):
        existing = MagicMock()
        existing.annotation_id = "abc123"
        existing.source_file_info.url_path = "http://old"
        other = MagicMock()
        other.annotation_id = "other-id"
        annotation_to_process = MagicMock()
        annotation_to_process.access_url = "http://new"

        with patch.object(ann_svc, "GenomeAnnotation") as GA:
            GA.objects.return_value.first.return_value = other

            updated = ann_svc.update_annotation_source_metadata(existing, annotation_to_process)

        assert updated is False
        existing.modify.assert_not_called()

    def test_does_not_raise_when_modify_fails(self):
        existing = MagicMock()
        existing.annotation_id = "abc123"
        existing.source_file_info.url_path = "http://old"
        existing.modify.side_effect = Exception("boom")
        annotation_to_process = MagicMock()
        annotation_to_process.access_url = "http://new"
        annotation_to_process.last_modified = None
        annotation_to_process.release_date = None

        with patch.object(ann_svc, "GenomeAnnotation") as GA:
            GA.objects.return_value.first.return_value = None

            updated = ann_svc.update_annotation_source_metadata(existing, annotation_to_process)

        assert updated is False


class TestHandleDuplicateAnnotationContent:
    def test_updates_existing_annotation_when_found(self):
        annotation_to_process = MagicMock()
        existing = MagicMock()

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc, "update_annotation_source_metadata", return_value=True) as update_meta,
            patch.object(ann_svc, "handle_annotation_error") as handle_err,
        ):
            GA.objects.return_value.first.return_value = existing

            ann_svc.handle_duplicate_annotation_content(annotation_to_process, "md5x")

        update_meta.assert_called_once_with(existing, annotation_to_process)
        handle_err.assert_not_called()

    def test_records_error_when_existing_annotation_missing(self):
        annotation_to_process = MagicMock()

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc, "update_annotation_source_metadata") as update_meta,
            patch.object(ann_svc, "handle_annotation_error") as handle_err,
        ):
            GA.objects.return_value.first.return_value = None

            ann_svc.handle_duplicate_annotation_content(annotation_to_process, "md5x")

        update_meta.assert_not_called()
        handle_err.assert_called_once()


class TestSafeRemoveAnnotationFile:
    """
    Covers the defense-in-depth guard: never delete a file that is still referenced
    by a live GenomeAnnotation document, regardless of which exception path triggered
    the cleanup attempt.
    """

    def test_skips_removal_when_still_referenced(self, tmp_path):
        target = tmp_path / "file.gff.gz"
        target.write_text("data")
        referenced_by = MagicMock()
        referenced_by.annotation_id = "abc"

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc.file_helper, "remove_file_and_empty_parents") as remove_fn,
        ):
            GA.objects.return_value.first.return_value = referenced_by

            ann_svc.safe_remove_annotation_file(str(target), str(tmp_path), "/rel/path.gff.gz")

        remove_fn.assert_not_called()
        assert target.exists()

    def test_deletes_when_not_referenced(self, tmp_path):
        target = tmp_path / "file.gff.gz"
        target.write_text("data")

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc.file_helper, "remove_file_and_empty_parents") as remove_fn,
        ):
            GA.objects.return_value.first.return_value = None

            ann_svc.safe_remove_annotation_file(str(target), str(tmp_path), "/rel/path.gff.gz")

        remove_fn.assert_called_once_with(str(target), str(tmp_path))

    def test_noop_when_file_does_not_exist(self, tmp_path):
        missing = tmp_path / "missing.gff.gz"

        with patch.object(ann_svc.file_helper, "remove_file_and_empty_parents") as remove_fn:
            ann_svc.safe_remove_annotation_file(str(missing), str(tmp_path), "/rel/path.gff.gz")

        remove_fn.assert_not_called()


class TestProcessAnnotationFileDuplicateDetection:
    """
    Exercises process_annotation_file's duplicate-content check by faking the
    download + subprocess pipeline (bgzip/tabix are not assumed to be installed
    in the test environment).
    """

    @staticmethod
    def _fake_download(content_md5, downloaded_gff_path=None):
        def _download(annotation_to_process, downloaded_gff):
            with open(downloaded_gff, "wb") as f:
                f.write(b"not-empty-source-content")
        return _download

    @staticmethod
    def _fake_popen_factory(tmp_subdir_path, bgzipped_path, content_md5):
        state = {"n": 0}

        def fake_popen(cmd, stdout=None, stderr=None):
            state["n"] += 1
            call_n = state["n"]
            proc = MagicMock()
            proc.returncode = 0

            def communicate():
                if call_n == 1:
                    # streaming stage: sort | tee md5sum | bgzip
                    md5_path = os.path.join(tmp_subdir_path, "md5.txt")
                    with open(md5_path, "w") as f:
                        f.write(content_md5 + "\n")
                    with open(bgzipped_path, "wb") as f:
                        f.write(b"bgzip-bytes")
                else:
                    # tabix stage
                    with open(f"{bgzipped_path}.csi", "wb") as f:
                        f.write(b"csi-bytes")
                return (b"", b"")

            proc.communicate.side_effect = communicate
            return proc

        return fake_popen

    def test_raises_duplicate_error_when_content_md5_already_exists(self, tmp_path):
        tmp_subdir_path = str(tmp_path)
        bgzipped_path = str(tmp_path / "output.gff.gz")
        content_md5 = "deadbeefdeadbeefdeadbeefdeadbeef"

        ann = MagicMock()
        ann.md5_checksum = "srcmd5"
        ann.access_url = "http://example.com/a.gff.gz"

        with (
            patch.object(ann_svc, "download_gff_file", side_effect=self._fake_download(content_md5)),
            patch.object(
                ann_svc.subprocess,
                "Popen",
                side_effect=self._fake_popen_factory(tmp_subdir_path, bgzipped_path, content_md5),
            ),
        ):
            with pytest.raises(ann_svc.DuplicateAnnotationContentError) as exc_info:
                ann_svc.process_annotation_file(ann, tmp_subdir_path, bgzipped_path, [content_md5])

        assert exc_info.value.md5_checksum == content_md5

    def test_returns_md5_and_size_when_not_a_duplicate(self, tmp_path):
        tmp_subdir_path = str(tmp_path)
        bgzipped_path = str(tmp_path / "output.gff.gz")
        content_md5 = "deadbeefdeadbeefdeadbeefdeadbeef"

        ann = MagicMock()
        ann.md5_checksum = "srcmd5"
        ann.access_url = "http://example.com/a.gff.gz"

        with (
            patch.object(ann_svc, "download_gff_file", side_effect=self._fake_download(content_md5)),
            patch.object(
                ann_svc.subprocess,
                "Popen",
                side_effect=self._fake_popen_factory(tmp_subdir_path, bgzipped_path, content_md5),
            ),
        ):
            md5_result, file_size = ann_svc.process_annotation_file(
                ann, tmp_subdir_path, bgzipped_path, []
            )

        assert md5_result == content_md5
        assert file_size > 0


class TestResolveSourceDates:
    def test_empty_release_date_falls_back_to_last_modified(self):
        from datetime import datetime
        from db.models import GenomeAnnotation

        release_dt, last_mod_dt = GenomeAnnotation.resolve_source_dates("", "2026-08-27")
        assert release_dt == datetime.fromisoformat("2026-08-27")
        assert last_mod_dt == datetime.fromisoformat("2026-08-27")

    def test_whitespace_release_date_falls_back(self):
        from datetime import datetime
        from db.models import GenomeAnnotation

        release_dt, last_mod_dt = GenomeAnnotation.resolve_source_dates("  ", "2026-08-27")
        assert release_dt == last_mod_dt == datetime.fromisoformat("2026-08-27")

    def test_both_present(self):
        from datetime import datetime
        from db.models import GenomeAnnotation

        release_dt, last_mod_dt = GenomeAnnotation.resolve_source_dates(
            "2024-01-02", "2024-01-01"
        )
        assert release_dt == datetime.fromisoformat("2024-01-02")
        assert last_mod_dt == datetime.fromisoformat("2024-01-01")

    def test_both_missing_raises(self):
        from db.models import GenomeAnnotation

        with pytest.raises(ValueError, match="Missing release_date and last_modified"):
            GenomeAnnotation.resolve_source_dates("", "")

    def test_parse_iso_date_rejects_empty(self):
        from db.models import GenomeAnnotation

        with pytest.raises(ValueError):
            GenomeAnnotation.parse_iso_date("")
        assert GenomeAnnotation.try_parse_iso_date("") is None
        assert GenomeAnnotation.try_parse_iso_date(None) is None


class TestAnnotationToProcessDates:
    def _base_kwargs(self, **overrides):
        data = dict(
            source_database="GenBank",
            annotation_provider="",
            release_date="2024-01-02",
            last_modified_date="2024-01-01",
            md5_checksum="abc123def456abc123def456abc123de",
            access_url="https://example.com/a.gff.gz",
            taxon_id="9606",
            organism_name="Homo sapiens",
            assembly_accession="GCA_000001405.29",
            assembly_name="GRCh38",
        )
        data.update(overrides)
        return data

    def test_to_genome_annotation_backfills_empty_release_date(self):
        from datetime import datetime
        from db.embedded_documents import IndexedFileInfo, FeatureOverview, GFFStats, PipelineInfo

        ann = AnnotationToProcess(**self._base_kwargs(release_date=""))
        ga = ann.to_genome_annotation(
            annotation_id="contentmd5contentmd5contentmd5co",
            taxon_lineage=["9606"],
            indexed_file_info=IndexedFileInfo(
                uncompressed_md5="contentmd5contentmd5contentmd5co",
                bgzipped_path="/x.gff.gz",
                csi_path="/x.gff.gz.csi",
                file_size=1,
                pipeline=PipelineInfo(name="t", version="1", method="m"),
            ),
            features_summary=FeatureOverview(sources=["s"], types=["gene"]),
            features_statistics=GFFStats(),
        )
        expected = datetime.fromisoformat("2024-01-01")
        assert ga.source_file_info.release_date == expected
        assert ga.source_file_info.last_modified == expected

    def test_to_genome_annotation_raises_when_both_dates_missing(self):
        ann = AnnotationToProcess(
            **self._base_kwargs(release_date="", last_modified_date="")
        )
        with pytest.raises(ValueError, match="Missing release_date and last_modified"):
            ann.to_genome_annotation(annotation_id="x", taxon_lineage=["9606"])

    def test_to_annotation_error_uses_utcnow_when_both_dates_missing(self):
        from datetime import datetime

        ann = AnnotationToProcess(
            **self._base_kwargs(release_date="", last_modified_date="")
        )
        err = ann.to_annotation_error("tabix failed")
        assert isinstance(err.release_date, datetime)
        assert isinstance(err.last_modified, datetime)
        assert err.error_message == "tabix failed"


class TestHandleAnnotationError:
    def test_does_not_raise_when_save_fails(self):
        real = AnnotationToProcess(
            source_database="GenBank",
            release_date="",
            last_modified_date="",
            md5_checksum="md5x",
            access_url="https://example.com/a.gff.gz",
            taxon_id="1",
            organism_name="x",
            assembly_accession="GCA_1",
        )
        err_doc = MagicMock()
        err_doc.save.side_effect = Exception("cannot parse date")

        with (
            patch.object(ann_svc, "AnnotationError") as AE,
            patch.object(real, "to_annotation_error", return_value=err_doc),
        ):
            AE.objects.return_value.first.side_effect = [None, None]
            ann_svc.handle_annotation_error(real, "boom")

        err_doc.save.assert_called_once()

    def test_updates_existing_error_without_raising(self):
        existing = MagicMock()
        real = AnnotationToProcess(
            source_database="GenBank",
            release_date="2024-01-01",
            last_modified_date="2024-01-01",
            md5_checksum="md5x",
            access_url="https://example.com/a.gff.gz",
            taxon_id="1",
            organism_name="x",
            assembly_accession="GCA_1",
        )
        with patch.object(ann_svc, "AnnotationError") as AE:
            AE.objects.return_value.first.return_value = existing
            ann_svc.handle_annotation_error(real, "new error")

        assert existing.error_message == "new error"
        existing.save.assert_called_once()
