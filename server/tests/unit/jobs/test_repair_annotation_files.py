import os
from unittest.mock import MagicMock, patch

import pytest

from jobs import repair_annotation_files as repair_job

pytestmark = pytest.mark.unit


def _fake_popen_factory(tmp_subdir_path, bgzipped_path, content_md5):
    """
    Fakes the sort|tee|bgzip stage (1st Popen call) and the tabix stage (2nd Popen
    call) without needing bgzip/tabix installed: writes the expected side-effect
    files directly, mirroring what the real shell pipeline would produce.
    """
    state = {"n": 0}

    def fake_popen(cmd, stdout=None, stderr=None):
        state["n"] += 1
        call_n = state["n"]
        proc = MagicMock()
        proc.returncode = 0

        def communicate():
            if call_n == 1:
                md5_path = os.path.join(tmp_subdir_path, "md5.txt")
                with open(md5_path, "w") as f:
                    f.write(content_md5 + "\n")
                with open(bgzipped_path, "wb") as f:
                    f.write(b"bgzip-bytes")
            else:
                with open(f"{bgzipped_path}.csi", "wb") as f:
                    f.write(b"csi-bytes")
            return (b"", b"")

        proc.communicate.side_effect = communicate
        return proc

    return fake_popen


def _fake_download(content=b"not-empty-source-content"):
    def _get(url, stream=True, timeout=None):
        cm = MagicMock()
        cm.__enter__.return_value = cm
        cm.__exit__.return_value = False
        cm.raise_for_status.return_value = None
        cm.iter_content.return_value = [content]
        return cm

    return _get


class TestFindAnnotationsWithMissingFiles:
    def test_flags_missing_bgzip_or_csi(self, tmp_path):
        present = MagicMock()
        present.annotation_id = "present"
        missing_bgzip = MagicMock()
        missing_bgzip.annotation_id = "missing-bgzip"
        missing_csi = MagicMock()
        missing_csi.annotation_id = "missing-csi"

        present_path = tmp_path / "present.gff.gz"
        present_path.write_text("x")
        (tmp_path / "present.gff.gz.csi").write_text("x")

        missing_bgzip_path = tmp_path / "missing-bgzip.gff.gz"
        (tmp_path / "missing-bgzip.gff.gz.csi").write_text("x")

        missing_csi_path = tmp_path / "missing-csi.gff.gz"
        missing_csi_path.write_text("x")

        path_map = {
            "present": str(present_path),
            "missing-bgzip": str(missing_bgzip_path),
            "missing-csi": str(missing_csi_path),
        }

        def fake_get_path(annotation):
            return path_map[annotation.annotation_id]

        with (
            patch.object(repair_job, "GenomeAnnotation") as GA,
            patch.object(repair_job.file_helper, "get_annotation_file_path", side_effect=fake_get_path),
        ):
            GA.objects.return_value = [present, missing_bgzip, missing_csi]

            missing, scanned_count, path_errors = repair_job.find_annotations_with_missing_files()

        assert scanned_count == 3
        assert path_errors == []
        assert {a.annotation_id for a in missing} == {"missing-bgzip", "missing-csi"}

    def test_records_path_resolution_errors(self):
        broken = MagicMock()
        broken.annotation_id = "broken"

        with (
            patch.object(repair_job, "GenomeAnnotation") as GA,
            patch.object(
                repair_job.file_helper,
                "get_annotation_file_path",
                side_effect=ValueError("no bgzipped_path"),
            ),
        ):
            GA.objects.return_value = [broken]

            missing, scanned_count, path_errors = repair_job.find_annotations_with_missing_files()

        assert scanned_count == 1
        assert missing == []
        assert path_errors == [{"annotation_id": "broken", "error": "no bgzipped_path"}]


class TestRecreateAnnotationFile:
    def test_success_moves_verified_file_into_place_and_writes_contigs(self, tmp_path):
        content_md5 = "deadbeefdeadbeefdeadbeefdeadbeef"
        final_bgzipped_path = str(tmp_path / "final" / "Ensembl_x.gff.gz")
        tmp_root = str(tmp_path / "tmp")

        annotation = MagicMock()
        annotation.annotation_id = content_md5

        # tmp_subdir_path is fully deterministic (create_dir_path(tmp_dir, f"repair_{annotation_id}")),
        # so we can precompute exactly where the fake Popen should write its files.
        tmp_subdir_path = os.path.join(tmp_root, f"repair_{content_md5}")
        tmp_bgzipped_path = os.path.join(tmp_subdir_path, "output.gff.gz")
        fake_popen = _fake_popen_factory(tmp_subdir_path, tmp_bgzipped_path, content_md5)

        with (
            patch.object(repair_job.file_helper, "get_annotation_file_path", return_value=final_bgzipped_path),
            patch.object(repair_job.requests, "get", side_effect=_fake_download()),
            patch.object(repair_job, "seq_files") as seq_files_mock,
            patch.object(repair_job.subprocess, "Popen", side_effect=fake_popen),
        ):
            md5_result, file_size = repair_job.recreate_annotation_file(
                annotation, tmp_root, "http://example.com/a.gff.gz"
            )

        assert md5_result == content_md5
        assert file_size > 0
        assert os.path.exists(final_bgzipped_path)
        assert os.path.exists(f"{final_bgzipped_path}.csi")
        # the temp working directory should be cleaned up afterwards
        assert not os.path.exists(tmp_subdir_path)
        seq_files_mock.write_contigs_from_tabix.assert_called_once_with(final_bgzipped_path)

    def test_content_mismatch_does_not_touch_final_path(self, tmp_path):
        expected_md5 = "expectedmd5expectedmd5expected1"
        recreated_md5 = "differentmd5differentmd5differe2"
        final_bgzipped_path = str(tmp_path / "final" / "Ensembl_x.gff.gz")
        tmp_root = str(tmp_path / "tmp")

        annotation = MagicMock()
        annotation.annotation_id = expected_md5

        tmp_subdir_path = os.path.join(tmp_root, f"repair_{expected_md5}")
        tmp_bgzipped_path = os.path.join(tmp_subdir_path, "output.gff.gz")
        fake_popen = _fake_popen_factory(tmp_subdir_path, tmp_bgzipped_path, recreated_md5)

        with (
            patch.object(repair_job.file_helper, "get_annotation_file_path", return_value=final_bgzipped_path),
            patch.object(repair_job.requests, "get", side_effect=_fake_download()),
            patch.object(repair_job.subprocess, "Popen", side_effect=fake_popen),
        ):
            with pytest.raises(repair_job.ContentMismatchError):
                repair_job.recreate_annotation_file(
                    annotation, tmp_root, "http://example.com/a.gff.gz"
                )

        assert not os.path.exists(final_bgzipped_path)
        assert not os.path.exists(f"{final_bgzipped_path}.csi")
        # temp working dir cleaned up even on failure
        assert not os.path.exists(tmp_subdir_path)


class TestRepairMissingAnnotationFiles:
    def test_dry_run_reports_without_repairing(self):
        missing_ann = MagicMock()
        missing_ann.annotation_id = "m1"

        with (
            patch.object(
                repair_job,
                "find_annotations_with_missing_files",
                return_value=([missing_ann], 5, []),
            ),
            patch.object(repair_job, "recreate_annotation_file") as recreate,
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=True)

        assert stats["dry_run"] is True
        assert stats["scanned"] == 5
        assert stats["missing_files"] == 1
        assert stats["would_repair"] == ["m1"]
        recreate.assert_not_called()

    def test_recreates_from_original_url_when_reachable(self):
        ann = MagicMock()
        ann.annotation_id = "m1"
        ann.source_file_info.url_path = "http://old-but-works"

        with (
            patch.object(
                repair_job, "find_annotations_with_missing_files", return_value=([ann], 1, [])
            ),
            patch.object(repair_job.annotation_service, "source_url_is_not_found", return_value=False),
            patch.object(repair_job, "recreate_annotation_file", return_value=("md5", 100)) as recreate,
            patch.object(repair_job, "_build_tracker_lookup_by_content", return_value={}) as build_lookup,
            patch.object(repair_job.annotation_service, "update_annotation_source_metadata") as update_meta,
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=False)

        recreate.assert_called_once_with(ann, repair_job.TMP_DIR, "http://old-but-works")
        assert stats["recreated_from_original_url"] == 1
        assert stats["recreated_from_new_url"] == 0
        update_meta.assert_not_called()
        # Reachable original url succeeded, so the tracker lookup should never even
        # be needed for this annotation (still built once up-front though).
        build_lookup.assert_called_once()

    def test_falls_back_to_tracker_url_when_original_is_dead(self):
        ann = MagicMock()
        ann.annotation_id = "m1"
        ann.source_file_info.url_path = "http://dead-url"
        ann.source_file_info.database = "Ensembl"
        ann.source_file_info.uncompressed_md5 = "srcmd5"
        ann.taxid = "9606"
        ann.assembly_accession = "GCA_1"

        match = MagicMock()
        match.access_url = "http://new-url"

        key = ("Ensembl", "9606", "GCA_1", "srcmd5")

        with (
            patch.object(
                repair_job, "find_annotations_with_missing_files", return_value=([ann], 1, [])
            ),
            patch.object(repair_job.annotation_service, "source_url_is_not_found", return_value=True),
            patch.object(repair_job, "recreate_annotation_file", return_value=("md5", 100)) as recreate,
            patch.object(repair_job, "_build_tracker_lookup_by_content", return_value={key: match}),
            patch.object(repair_job.annotation_service, "update_annotation_source_metadata") as update_meta,
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=False)

        recreate.assert_called_once_with(ann, repair_job.TMP_DIR, "http://new-url")
        assert stats["recreated_from_new_url"] == 1
        assert stats["recreated_from_original_url"] == 0
        update_meta.assert_called_once_with(ann, match)

    def test_marks_unrecoverable_when_no_match_found(self):
        ann = MagicMock()
        ann.annotation_id = "m1"
        ann.source_file_info.url_path = "http://dead-url"
        ann.source_file_info.database = "Ensembl"
        ann.source_file_info.uncompressed_md5 = "srcmd5"
        ann.taxid = "9606"
        ann.assembly_accession = "GCA_1"

        with (
            patch.object(
                repair_job, "find_annotations_with_missing_files", return_value=([ann], 1, [])
            ),
            patch.object(repair_job.annotation_service, "source_url_is_not_found", return_value=True),
            patch.object(repair_job, "recreate_annotation_file") as recreate,
            patch.object(repair_job, "_build_tracker_lookup_by_content", return_value={}),
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=False)

        recreate.assert_not_called()
        assert len(stats["unrecoverable"]) == 1
        assert stats["unrecoverable"][0]["annotation_id"] == "m1"

    def test_content_mismatch_on_original_url_does_not_fall_back(self):
        ann = MagicMock()
        ann.annotation_id = "m1"
        ann.source_file_info.url_path = "http://reused-url-different-content"
        ann.source_file_info.database = "Ensembl"
        ann.source_file_info.uncompressed_md5 = "srcmd5"
        ann.taxid = "9606"
        ann.assembly_accession = "GCA_1"

        with (
            patch.object(
                repair_job, "find_annotations_with_missing_files", return_value=([ann], 1, [])
            ),
            patch.object(repair_job.annotation_service, "source_url_is_not_found", return_value=False),
            patch.object(
                repair_job,
                "recreate_annotation_file",
                side_effect=repair_job.ContentMismatchError("mismatch"),
            ) as recreate,
            patch.object(repair_job, "_build_tracker_lookup_by_content", return_value={}) as build_lookup,
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=False)

        # Only the original url should have been attempted; no fallback attempt.
        recreate.assert_called_once_with(ann, repair_job.TMP_DIR, "http://reused-url-different-content")
        assert len(stats["content_mismatch"]) == 1
        assert stats["content_mismatch"][0]["annotation_id"] == "m1"
        assert stats["unrecoverable"] == []
        # The tracker lookup is still built up-front regardless (cheap: only fetched
        # once per job run), but it must not be consulted to retry this annotation.
        build_lookup.assert_called_once()

    def test_no_missing_files_short_circuits(self):
        with (
            patch.object(
                repair_job, "find_annotations_with_missing_files", return_value=([], 3, [])
            ),
            patch.object(repair_job, "_build_tracker_lookup_by_content") as build_lookup,
        ):
            stats = repair_job.repair_missing_annotation_files(dry_run=False)

        assert stats["missing_files"] == 0
        build_lookup.assert_not_called()
