"""
Regression tests for the high-severity issues found in the import_annotations audit
(see annotrieve/AUDIT.md, items 1-6).

Each class maps to one audit item. DB-backed tests use an in-process mongomock
connection; shell-pipeline tests run the real bash/zcat/sort/md5sum with `cat` standing in
for bgzip (bgzip/tabix are not assumed to be installed).
"""

import gzip
import hashlib
import importlib
import os
import re
import subprocess
import time
from datetime import datetime
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from tests.unit.jobs.mongomock_helper import connect_mongomock
from mongoengine import connect, disconnect

from jobs.services import annotation as ann_svc
from jobs.services import assembly as asm_svc
from jobs.services.classes import AnnotationToProcess
from tests.integration.factories import make_annotation

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


@pytest.fixture
def mongo():
    """In-process mongomock connection (mongomock:// host works on every pinned mongoengine)."""
    from db.models import AnnotationError, GenomeAnnotation

    disconnect(alias="default")
    connect_mongomock("audit_regressions")
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    disconnect(alias="default")


def _to_process(**kwargs) -> AnnotationToProcess:
    defaults = dict(
        source_database="Ensembl",
        annotation_provider="Ensembl",
        release_date="2024-01-02",
        last_modified_date="2024-01-03",
        md5_checksum="src-md5-new",
        access_url="https://example.com/new/a.gff.gz",
        taxon_id="9606",
        organism_name="Homo sapiens",
        assembly_accession="GCA_000001405.29",
        assembly_name="GRCh38",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


def _stored(annotation_id="c" * 32, *, url, source_md5, assembly="GCA_000001405.29"):
    ann = make_annotation(
        annotation_id=annotation_id,
        assembly_accession=assembly,
        with_stats=False,
        with_busco=False,
    )
    ann.source_file_info.url_path = url
    ann.source_file_info.uncompressed_md5 = source_md5
    ann.save()
    return ann


# --------------------------------------------------------------------------- #
# Audit #1: reconcile must refresh the stored (url, source md5) pair
# --------------------------------------------------------------------------- #
class TestSourceMetadataReconcile:
    def test_same_url_new_source_md5_is_stored(self):
        existing = MagicMock()
        existing.annotation_id = "cid"
        existing.source_file_info.url_path = "https://example.com/a.gff.gz"
        existing.source_file_info.uncompressed_md5 = "old"
        incoming = MagicMock()
        incoming.access_url = "https://example.com/a.gff.gz"
        incoming.md5_checksum = "new"
        incoming.last_modified = None
        incoming.release_date = None

        with (
            patch.object(ann_svc, "GenomeAnnotation") as GA,
            patch.object(ann_svc, "AnnotationError"),
        ):
            GA.objects.return_value.first.return_value = None
            assert ann_svc.update_annotation_source_metadata(existing, incoming) is True

        _, kwargs = existing.modify.call_args
        assert kwargs == {"source_file_info__uncompressed_md5": "new"}

    def test_new_source_md5_owned_by_another_annotation_is_refused(self):
        existing = MagicMock()
        existing.annotation_id = "cid"
        existing.source_file_info.url_path = "https://example.com/a.gff.gz"
        existing.source_file_info.uncompressed_md5 = "old"
        incoming = MagicMock()
        incoming.access_url = "https://example.com/a.gff.gz"
        incoming.md5_checksum = "new"
        incoming.last_modified = None
        incoming.release_date = None

        with patch.object(ann_svc, "GenomeAnnotation") as GA:
            GA.objects.return_value.first.return_value = MagicMock(annotation_id="other")
            assert ann_svc.update_annotation_source_metadata(existing, incoming) is False
        existing.modify.assert_not_called()

    def test_same_url_changed_dates_only_is_stored(self, mongo):
        stored = _stored(url="https://example.com/a.gff.gz", source_md5="src1")
        incoming = _to_process(
            access_url="https://example.com/a.gff.gz",
            md5_checksum="src1",
            last_modified_date="2030-05-06",
            release_date="2030-05-01",
        )
        assert ann_svc.update_annotation_source_metadata(stored, incoming) is True
        stored.reload()
        assert stored.source_file_info.last_modified == datetime(2030, 5, 6)

    def test_identical_source_is_a_noop(self, mongo):
        stored = _stored(url="https://example.com/a.gff.gz", source_md5="src1")
        incoming = _to_process(
            access_url="https://example.com/a.gff.gz",
            md5_checksum="src1",
            last_modified_date=None,
            release_date=None,
        )
        assert ann_svc.update_annotation_source_metadata(stored, incoming) is False

    def test_after_reconcile_the_source_is_no_longer_reprocessed(self, mongo):
        """The core regression: previously the same URL+new md5 was reprocessed on every run."""
        stored = _stored(url="https://example.com/a.gff.gz", source_md5="src-old")
        incoming = _to_process(access_url="https://example.com/a.gff.gz", md5_checksum="src-new")

        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([incoming]) == [incoming]
        ann_svc.handle_duplicate_annotation_content(incoming, stored.annotation_id)
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([incoming]) == []

    def test_moved_url_and_md5_are_both_stored(self, mongo):
        stored = _stored(url="https://example.com/old.gff.gz", source_md5="src-old")
        incoming = _to_process(access_url="https://example.com/new.gff.gz", md5_checksum="src-new")
        ann_svc.handle_duplicate_annotation_content(incoming, stored.annotation_id)
        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/new.gff.gz"
        assert stored.source_file_info.uncompressed_md5 == "src-new"

    def test_identical_content_for_a_different_assembly_does_not_hijack_the_record(self, mongo):
        from db.models import AnnotationError

        stored = _stored(url="https://example.com/old.gff.gz", source_md5="src-old", assembly="GCA_000001405.29")
        incoming = _to_process(
            access_url="https://example.com/other.gff.gz",
            md5_checksum="src-other",
            assembly_accession="GCA_999999999.1",
        )
        ann_svc.handle_duplicate_annotation_content(incoming, stored.annotation_id)

        stored.reload()
        assert stored.source_file_info.url_path == "https://example.com/old.gff.gz"
        error = AnnotationError.objects(url_path="https://example.com/other.gff.gz").first()
        assert error is not None and "different assembly" in error.error_message


# --------------------------------------------------------------------------- #
# Audit #2: duplicate / failed runs must not leave or rewrite files
# --------------------------------------------------------------------------- #
class _PipelineFake:
    """Fake bash for process_annotation_file: writes where the command points."""

    def __init__(self, bgzipped_path, md5, *, fail_stream=False):
        self.part = f"{bgzipped_path}.part"
        self.md5 = md5
        self.fail_stream = fail_stream
        self.calls = 0
        self.md5_path = None

    def __call__(self, cmd, stdout=None, stderr=None, **popen_kwargs):
        self.calls += 1
        n = self.calls
        proc = MagicMock()
        proc.returncode = 0

        def communicate(**kwargs):
            if n == 1:
                if self.fail_stream:
                    proc.returncode = 1
                    # a real failing pipeline can leave a truncated output behind
                    with open(self.part, "wb") as fh:
                        fh.write(b"truncated")
                    return (b"", b"zcat: unexpected end of file")
                # the md5 path is embedded in the shell command
                md5_path = re.search(r"(\S+/md5\.txt)", cmd[2]).group(1).strip("'")
                with open(md5_path, "w") as fh:
                    fh.write(self.md5 + "\n")
                with open(self.part, "wb") as fh:
                    fh.write(b"bgzip-bytes")
            else:
                assert cmd[2].startswith("tabix") and cmd[2].rstrip("'").endswith(".part")
                with open(f"{self.part}.csi", "wb") as fh:
                    fh.write(b"csi-bytes")
            return (b"", b"")

        proc.communicate.side_effect = communicate
        return proc


def _run_process_file(tmp_path, existing_md5s, fake):
    work = tmp_path / "work"
    work.mkdir(exist_ok=True)
    out_dir = tmp_path / "ann"
    out_dir.mkdir(exist_ok=True)
    final = str(out_dir / "Ensembl_src.gff.gz")
    fake_instance = fake(final)
    ann = MagicMock(md5_checksum="src", access_url="http://x/a.gff.gz")

    def fake_download(_ann, path):
        with open(path, "wb") as fh:
            fh.write(b"source")

    def run():
        with (
            patch.object(ann_svc, "download_gff_file", side_effect=fake_download),
            patch.object(ann_svc.subprocess, "Popen", side_effect=fake_instance),
        ):
            return ann_svc.process_annotation_file(ann, str(work), final, existing_md5s)

    return final, run


class TestNoFilesLeftForDuplicatesOrFailures:
    def test_duplicate_content_leaves_no_files_at_all(self, tmp_path):
        final, run = _run_process_file(tmp_path, ["dup"], lambda f: _PipelineFake(f, "dup"))
        with pytest.raises(ann_svc.DuplicateAnnotationContentError):
            run()
        assert sorted(os.listdir(tmp_path / "ann")) == []

    def test_duplicate_content_does_not_touch_an_existing_live_file(self, tmp_path):
        final, run = _run_process_file(tmp_path, ["dup"], lambda f: _PipelineFake(f, "dup"))
        with open(final, "wb") as fh:
            fh.write(b"LIVE")
        with open(f"{final}.csi", "wb") as fh:
            fh.write(b"LIVE-CSI")
        with pytest.raises(ann_svc.DuplicateAnnotationContentError):
            run()
        assert open(final, "rb").read() == b"LIVE"
        assert open(f"{final}.csi", "rb").read() == b"LIVE-CSI"
        assert sorted(os.listdir(tmp_path / "ann")) == sorted(
            [os.path.basename(final), os.path.basename(final) + ".csi"]
        )

    def test_failed_pipeline_does_not_truncate_an_existing_file_or_leave_part_files(self, tmp_path):
        final, run = _run_process_file(
            tmp_path, [], lambda f: _PipelineFake(f, "m", fail_stream=True)
        )
        with open(final, "wb") as fh:
            fh.write(b"LIVE")
        with pytest.raises(Exception, match="unexpected end of file"):
            run()
        assert open(final, "rb").read() == b"LIVE"
        assert not [n for n in os.listdir(tmp_path / "ann") if n.endswith(".part")]

    def test_success_publishes_final_and_csi_and_removes_part_files(self, tmp_path):
        final, run = _run_process_file(tmp_path, [], lambda f: _PipelineFake(f, "newmd5"))
        md5, size = run()
        assert md5 == "newmd5"
        assert size == len(b"bgzip-bytes")
        assert open(final, "rb").read() == b"bgzip-bytes"
        assert open(f"{final}.csi", "rb").read() == b"csi-bytes"
        assert sorted(os.listdir(tmp_path / "ann")) == sorted(
            [os.path.basename(final), os.path.basename(final) + ".csi"]
        )


# --------------------------------------------------------------------------- #
# Audit #3: truncated / corrupt input must fail the pipeline
# --------------------------------------------------------------------------- #
GFF = (
    "##gff-version 3\n"
    "#!genome-build X\n"
    "chr2\tsrc\tgene\t50\t90\t.\t+\t.\tID=g3\n"
    "chr1\tsrc\tgene\t200\t300\t.\t+\t.\tID=g2\n"
    "chr1\tsrc\tgene\t10\t100\t.\t+\t.\tID=g1\n"
)
GFF_SORTED = (
    "##gff-version 3\n"
    "#!genome-build X\n"
    "chr1\tsrc\tgene\t10\t100\t.\t+\t.\tID=g1\n"
    "chr1\tsrc\tgene\t200\t300\t.\t+\t.\tID=g2\n"
    "chr2\tsrc\tgene\t50\t90\t.\t+\t.\tID=g3\n"
)


def _run_stream(tmp_path, gz_bytes):
    gz = tmp_path / "in.gff.gz"
    gz.write_bytes(gz_bytes)
    out = tmp_path / "out.gff"
    md5_path = tmp_path / "md5.txt"
    cmd = ann_svc.build_stream_cmd(str(gz), str(md5_path), str(out), compressor="cat")
    proc = subprocess.run(["bash", "-c", cmd], capture_output=True)
    md5 = None
    # `tee >(md5sum ...)` is not waited on by bash (audit item 10): poll briefly.
    for _ in range(40):
        if md5_path.exists() and md5_path.read_text().strip():
            md5 = md5_path.read_text().strip()
            break
        time.sleep(0.05)
    return proc, out, md5


class TestStreamPipelineIntegrity:
    def test_sorts_with_headers_first_and_md5_matches_output(self, tmp_path):
        proc, out, md5 = _run_stream(tmp_path, gzip.compress(GFF.encode()))
        assert proc.returncode == 0, proc.stderr
        assert out.read_text() == GFF_SORTED
        assert md5 == hashlib.md5(GFF_SORTED.encode()).hexdigest()

    def test_truncated_gzip_fails_the_pipeline(self, tmp_path):
        data = gzip.compress((GFF * 2000).encode())
        proc, _, _ = _run_stream(tmp_path, data[: len(data) // 2])
        assert proc.returncode != 0
        assert b"unexpected end of file" in proc.stderr

    def test_not_a_gzip_file_fails_the_pipeline(self, tmp_path):
        proc, _, _ = _run_stream(tmp_path, b"this is not gzip data")
        assert proc.returncode != 0

    def test_gff_without_any_comment_lines_is_accepted(self, tmp_path):
        body = "chr1\tsrc\tgene\t10\t100\t.\t+\t.\tID=g1\n"
        proc, out, _ = _run_stream(tmp_path, gzip.compress(body.encode()))
        assert proc.returncode == 0, proc.stderr
        assert out.read_text() == body

    def test_comment_only_file_is_accepted_by_the_pipeline_and_left_to_later_checks(self, tmp_path):
        proc, out, _ = _run_stream(tmp_path, gzip.compress(b"##gff-version 3\n"))
        assert proc.returncode == 0, proc.stderr
        assert out.read_text() == "##gff-version 3\n"


def _fake_response(headers, chunks):
    resp = MagicMock()
    resp.headers = headers
    resp.raise_for_status.return_value = None
    resp.iter_content.return_value = chunks
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    return resp


class TestDownloadIntegrity:
    HEADERS = {"Last-Modified": "Wed, 03 Jan 2024 00:00:00 GMT"}

    def _ann(self):
        return _to_process(last_modified_date="2024-01-03", access_url="https://example.com/a.gff.gz")

    def test_short_download_is_rejected(self, tmp_path):
        resp = _fake_response({**self.HEADERS, "Content-Length": "10"}, [b"abcd"])
        with patch.object(ann_svc.requests, "get", return_value=resp):
            with pytest.raises(Exception, match="Incomplete download"):
                ann_svc.download_gff_file(self._ann(), str(tmp_path / "o.gz"))

    def test_complete_download_is_accepted(self, tmp_path):
        resp = _fake_response({**self.HEADERS, "Content-Length": "6"}, [b"abc", b"def"])
        with patch.object(ann_svc.requests, "get", return_value=resp):
            ann_svc.download_gff_file(self._ann(), str(tmp_path / "o.gz"))
        assert (tmp_path / "o.gz").read_bytes() == b"abcdef"

    def test_content_length_ignored_when_transfer_is_content_encoded(self, tmp_path):
        headers = {**self.HEADERS, "Content-Length": "3", "Content-Encoding": "gzip"}
        resp = _fake_response(headers, [b"abcdef"])
        with patch.object(ann_svc.requests, "get", return_value=resp):
            ann_svc.download_gff_file(self._ann(), str(tmp_path / "o.gz"))

    def test_missing_content_length_is_accepted(self, tmp_path):
        resp = _fake_response(dict(self.HEADERS), [b"abc"])
        with patch.object(ann_svc.requests, "get", return_value=resp):
            ann_svc.download_gff_file(self._ann(), str(tmp_path / "o.gz"))

    def test_date_mismatch_still_rejected(self, tmp_path):
        resp = _fake_response({"Last-Modified": "Wed, 04 Jan 2023 00:00:00 GMT"}, [b"abc"])
        with patch.object(ann_svc.requests, "get", return_value=resp):
            with pytest.raises(Exception, match="Date mismatch"):
                ann_svc.download_gff_file(self._ann(), str(tmp_path / "o.gz"))


# --------------------------------------------------------------------------- #
# Audit #4: error cleanup must keep errors of failed *updates*
# --------------------------------------------------------------------------- #
class TestCleanUpAnnotationsWithErrors:
    def _error(self, url, source_md5):
        from db.models import AnnotationError

        return AnnotationError(
            assembly_accession="GCA_1",
            taxid="9606",
            organism_name="Homo sapiens",
            error_message="boom",
            url_path=url,
            source_md5=source_md5,
            release_date=datetime(2024, 1, 1),
            last_modified=datetime(2024, 1, 1),
            source_database="Ensembl",
        ).save()

    def test_stale_error_is_removed_but_failed_update_is_kept(self, mongo):
        from db.models import AnnotationError

        _stored(url="https://example.com/live.gff.gz", source_md5="live-md5")
        # the stored version itself once failed and later succeeded -> stale
        self._error("https://example.com/live.gff.gz", "live-md5")
        # same URL, but a *newer* version failed -> must be kept
        _stored(
            annotation_id="d" * 32,
            url="https://example.com/updating.gff.gz",
            source_md5="old-md5",
            assembly="GCA_2",
        )
        self._error("https://example.com/updating.gff.gz", "new-md5")
        # unrelated error
        self._error("https://example.com/never-imported.gff.gz", "x-md5")

        deleted = ann_svc.clean_up_annotations_with_errors()

        assert deleted == 1
        remaining = sorted(AnnotationError.objects.scalar("url_path"))
        assert remaining == [
            "https://example.com/never-imported.gff.gz",
            "https://example.com/updating.gff.gz",
        ]

    def test_works_across_batches(self, mongo):
        from db.models import AnnotationError

        for i in range(5):
            _stored(
                annotation_id=f"{i}" * 32,
                url=f"https://example.com/{i}.gff.gz",
                source_md5=f"md5-{i}",
                assembly=f"GCA_{i}",
            )
            self._error(f"https://example.com/{i}.gff.gz", f"md5-{i}")
        self._error("https://example.com/keep.gff.gz", "keep-md5")

        assert ann_svc.clean_up_annotations_with_errors(batch_size=2) == 5
        assert AnnotationError.objects.count() == 1

    def test_no_errors_is_a_noop(self, mongo):
        assert ann_svc.clean_up_annotations_with_errors() == 0


# --------------------------------------------------------------------------- #
# Audit #5: a BioProject failure must not strand newly saved assemblies
# --------------------------------------------------------------------------- #
class TestBioprojectFailureDoesNotLoseSavedAssemblies:
    def _run(self, tmp_path, bioproject_insert_side_effect):
        def parse(report, lineages, bioprojects):
            bioprojects["PRJ1"] = MagicMock(accession="PRJ1")
            bioprojects["PRJ2"] = MagicMock(accession="PRJ2")
            return MagicMock(assembly_accession=report["accession"])

        with (
            patch.object(asm_svc.ncbi_datasets_client, "get_data_from_ncbi",
                         return_value={"reports": [{"accession": "GCA_1"}, {"accession": "GCA_2"}]}),
            patch.object(asm_svc, "parse_assembly_from_ncbi", side_effect=parse),
            patch.object(asm_svc, "GenomeAssembly") as GAsm,
            patch.object(asm_svc, "BioProject") as BP,
        ):
            BP.objects.return_value.scalar.return_value = []
            BP.objects.return_value.first.return_value = None
            BP.objects.insert.side_effect = bioproject_insert_side_effect
            saved = asm_svc.fetch_new_assemblies_and_bioprojects(
                ["GCA_1", "GCA_2"], str(tmp_path), {}, batch_size=10
            )
            return saved, BP, GAsm

    def test_bulk_failure_falls_back_to_one_by_one_and_returns_saved(self, tmp_path):
        saved, BP, _ = self._run(tmp_path, [Exception("bulk"), None, None])
        assert saved == ["GCA_1", "GCA_2"]
        assert BP.objects.insert.call_count == 3  # 1 bulk + 2 singles

    def test_total_bioproject_failure_still_returns_saved_and_never_raises(self, tmp_path):
        saved, _, GAsm = self._run(tmp_path, Exception("always"))
        assert saved == ["GCA_1", "GCA_2"]
        # the already-persisted assemblies must not be rolled back
        GAsm.objects.assert_not_called()

    def test_one_bad_bioproject_does_not_drop_the_others(self, tmp_path):
        saved, BP, _ = self._run(tmp_path, [Exception("bulk"), Exception("bad"), None])
        assert saved == ["GCA_1", "GCA_2"]
        assert BP.objects.insert.call_count == 3


# --------------------------------------------------------------------------- #
# Audit #6: setup failures are isolated per annotation
# --------------------------------------------------------------------------- #
class TestPipelineSetupIsolation:
    def _ok_services(self):
        summary = MagicMock(types=["gene"], sources=["x"])
        return (
            patch.object(imp.annotation_service, "process_annotation_file", return_value=("md5", 10)),
            patch.object(imp.annotation_service, "init_indexed_file_info", return_value=MagicMock()),
            patch.object(imp.feature_summary_service, "compute_features_summary", return_value=summary),
            patch.object(imp.seq_files, "write_contigs_from_tabix"),
            patch.object(imp.feature_stats_service, "compute_features_statistics", return_value=MagicMock()),
        )

    def test_path_init_failure_is_recorded_and_the_batch_continues(self, tmp_path, monkeypatch):
        monkeypatch.setattr(imp, "TMP_DIR", str(tmp_path))
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(tmp_path / "ann"))
        bad = _to_process(md5_checksum="bad", access_url="https://e/bad.gff.gz")
        good = _to_process(md5_checksum="good", access_url="https://e/good.gff.gz")
        good.to_genome_annotation = MagicMock(return_value="PARSED")

        def init_paths(_root, ann):
            if ann.md5_checksum == "bad":
                raise PermissionError("cannot create dir")
            return "/ann/good.gff.gz", "/good.gff.gz"

        p = self._ok_services()
        with (
            p[0], p[1], p[2], p[3], p[4],
            patch.object(imp.annotation_service, "init_annotation_file_paths", side_effect=init_paths),
            patch.object(imp.annotation_service, "handle_annotation_error") as handle_err,
            patch.object(imp.annotation_service, "safe_remove_annotation_file") as safe_remove,
        ):
            result = imp.process_annotations_pipeline([bad, good], {}, [])

        assert result == ["PARSED"]
        handle_err.assert_called_once()
        assert handle_err.call_args[0][0] is bad
        assert "cannot create dir" in handle_err.call_args[0][1]
        # no output paths were ever known for the failed one -> nothing to remove
        safe_remove.assert_not_called()
        assert not (tmp_path / "bad").exists() and not (tmp_path / "good").exists()

    def test_tmp_dir_creation_failure_is_recorded_not_raised(self, monkeypatch):
        ann = _to_process()
        with (
            patch.object(imp.file_helper, "create_dir_path", side_effect=OSError("disk full")),
            patch.object(imp.annotation_service, "handle_annotation_error") as handle_err,
        ):
            assert imp.process_annotations_pipeline([ann], {}, []) == []
        handle_err.assert_called_once()

    def test_rmtree_failure_does_not_discard_processed_annotations(self, tmp_path, monkeypatch):
        monkeypatch.setattr(imp, "TMP_DIR", str(tmp_path))
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(tmp_path / "ann"))
        good = _to_process(md5_checksum="good")
        good.to_genome_annotation = MagicMock(return_value="PARSED")
        real_rmtree = imp.shutil.rmtree
        seen = {}

        def rmtree(path, **kwargs):
            seen.update(kwargs)
            return real_rmtree(path, **kwargs)

        p = self._ok_services()
        with (
            p[0], p[1], p[2], p[3], p[4],
            patch.object(imp.annotation_service, "init_annotation_file_paths",
                         return_value=("/ann/g.gff.gz", "/g.gff.gz")),
            patch.object(imp.shutil, "rmtree", side_effect=rmtree),
        ):
            assert imp.process_annotations_pipeline([good], {}, []) == ["PARSED"]
        assert seen.get("ignore_errors") is True

    def test_cleanup_failure_inside_error_handler_does_not_abort_the_batch(self, tmp_path, monkeypatch):
        monkeypatch.setattr(imp, "TMP_DIR", str(tmp_path))
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(tmp_path / "ann"))
        first = _to_process(md5_checksum="first")
        second = _to_process(md5_checksum="second")
        second.to_genome_annotation = MagicMock(return_value="PARSED")
        calls = {"n": 0}

        def process_file(ann, *_a):
            if ann.md5_checksum == "first":
                raise Exception("boom")
            return ("md5", 10)

        p = self._ok_services()
        with (
            p[1], p[2], p[3], p[4],
            patch.object(imp.annotation_service, "process_annotation_file", side_effect=process_file),
            patch.object(imp.annotation_service, "init_annotation_file_paths",
                         return_value=("/ann/g.gff.gz", "/g.gff.gz")),
            patch.object(imp.annotation_service, "handle_annotation_error"),
            patch.object(imp.annotation_service, "safe_remove_annotation_file",
                         side_effect=OSError("read-only fs")) as safe_remove,
        ):
            result = imp.process_annotations_pipeline([first, second], {}, [])
        assert result == ["PARSED"]
        assert safe_remove.call_count == 3  # every target attempted despite failures


class TestJobLevelGuards:
    def test_refuses_to_run_without_annotations_dir(self, monkeypatch):
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", None)
        with patch.object(imp.annotation_service, "fetch_from_url") as fetch:
            with pytest.raises(RuntimeError, match="LOCAL_ANNOTATIONS_DIR"):
                imp.import_annotations()
        fetch.assert_not_called()

    def _job(self, monkeypatch, *, assembly_filter, stats_error=None):
        monkeypatch.setattr(imp, "DEV", "1")
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", "/ann")
        anns = [_to_process()]
        stack = [
            patch.object(imp.annotation_service, "fetch_from_url", return_value=anns),
            patch.object(imp.annotation_service, "filter_annotations_by_md5_checksum_and_url_path",
                         side_effect=lambda xs: xs),
            patch.object(imp, "random"),
            patch.object(imp.taxonomy_service, "handle_taxonomy", return_value={"9606": ["9606"]}),
            patch.object(imp.annotation_service, "filter_annotations_dict_by_field",
                         side_effect=[anns, assembly_filter(anns)]),
            patch.object(imp.assembly_service, "handle_assemblies",
                         return_value=(["GCA_000001405.29"], ["GCA_000001405.29"])),
            patch.object(imp, "GenomeAnnotation"),
            patch.object(imp, "process_annotations_pipeline", return_value=[]),
            patch.object(imp.annotation_service, "clean_up_annotations_with_errors"),
            patch.object(imp.annotation_service, "delete_annotations"),
            patch.object(imp.stats_service, "update_db_stats", side_effect=stats_error),
            patch.object(imp.stats_service, "update_taxon_gene_and_transcript_stats"),
        ]
        return stack

    def test_new_assemblies_are_synced_even_when_a_later_step_fails(self, monkeypatch):
        from contextlib import ExitStack

        stack = self._job(monkeypatch, assembly_filter=lambda a: a, stats_error=RuntimeError("stats down"))
        with ExitStack() as es:
            mocks = [es.enter_context(c) for c in stack]
            mocks[2].sample.side_effect = lambda xs, n: xs
            mocks[6].objects.return_value.scalar.return_value = []
            sync = es.enter_context(patch("jobs.assemblies.sync_new_assemblies_from_summary.delay"))
            export = es.enter_context(patch("jobs.taxonomy.export_flattened_taxonomy.delay"))
            with pytest.raises(RuntimeError, match="stats down"):
                imp.import_annotations()
        sync.assert_called_once_with(accessions=["GCA_000001405.29"])
        export.assert_not_called()

    def test_new_assemblies_are_synced_on_the_early_exit_after_assembly_filter(self, monkeypatch):
        from contextlib import ExitStack

        stack = self._job(monkeypatch, assembly_filter=lambda a: [])
        with ExitStack() as es:
            mocks = [es.enter_context(c) for c in stack]
            mocks[2].sample.side_effect = lambda xs, n: xs
            sync = es.enter_context(patch("jobs.assemblies.sync_new_assemblies_from_summary.delay"))
            export = es.enter_context(patch("jobs.taxonomy.export_flattened_taxonomy.delay"))
            assert imp.import_annotations() is None
        sync.assert_called_once_with(accessions=["GCA_000001405.29"])
        export.assert_not_called()
