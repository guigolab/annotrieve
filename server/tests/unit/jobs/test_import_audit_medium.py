"""
Regression tests for the medium-severity issues of the import_annotations audit
(annotrieve/AUDIT.md items 7-16). One class per audit item.
"""

import fcntl
import importlib
import os
import threading
import time
from contextlib import ExitStack
from datetime import datetime
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from tests.unit.jobs.mongomock_helper import connect_mongomock
from mongoengine import connect, disconnect

from jobs.services import annotation as ann_svc
from jobs.services import feature_stats as stats_svc
from jobs.services import feature_summary as summary_svc
from jobs.services.classes import AnnotationToProcess
from jobs.services.utils import sanitize_counts, safe_dict_key
from helpers import file as file_helper
from tests.integration.factories import make_annotation

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


@pytest.fixture
def mongo():
    from db.models import AnnotationError, GenomeAnnotation

    disconnect(alias="default")
    connect_mongomock("audit_medium")
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    disconnect(alias="default")


def _row(**kwargs) -> AnnotationToProcess:
    defaults = dict(
        source_database="Ensembl",
        annotation_provider="Ensembl",
        release_date="2024-01-02",
        last_modified_date="2024-01-03",
        md5_checksum="src1",
        access_url="https://example.com/a.gff.gz",
        taxon_id="9606",
        organism_name="Homo sapiens",
        assembly_accession="GCA_1",
        assembly_name="GRCh38",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


# --------------------------------------------------------------------------- #
# Audit #7: DEV flag and sampling
# --------------------------------------------------------------------------- #
class TestDevMode:
    @pytest.mark.parametrize("value", ["0", "false", "False", "no", "off", "", "  "])
    def test_falsy_values_do_not_enable_dev(self, monkeypatch, value):
        monkeypatch.setenv("DEV", value)
        assert imp._env_flag("DEV") is False

    @pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on", " 1 "])
    def test_truthy_values_enable_dev(self, monkeypatch, value):
        monkeypatch.setenv("DEV", value)
        assert imp._env_flag("DEV") is True

    def test_unset_is_off(self, monkeypatch):
        monkeypatch.delenv("DEV", raising=False)
        assert imp._env_flag("DEV") is False

    def test_dev_sampling_does_not_crash_with_fewer_than_200_rows(self, monkeypatch):
        monkeypatch.setattr(imp, "DEV", True)
        rows = [_row(md5_checksum=f"m{i}", access_url=f"https://example.com/{i}.gff.gz") for i in range(3)]
        with (
            patch.object(imp.annotation_service, "fetch_from_url", return_value=rows),
            patch.object(imp.annotation_service, "filter_annotations_by_md5_checksum_and_url_path",
                         side_effect=lambda xs: xs),
            patch.object(imp.taxonomy_service, "handle_taxonomy", return_value={}) as tax,
        ):
            imp._run_import("/tmp")
        assert len(tax.call_args[0][0]) == 3  # all 3 kept, no ValueError from random.sample


# --------------------------------------------------------------------------- #
# Audit #8: lock, per-run work dir, stale leftovers
# --------------------------------------------------------------------------- #
class TestRunIsolation:
    @pytest.fixture(autouse=True)
    def _paths(self, tmp_path, monkeypatch):
        self.tmp = tmp_path / "tmp"
        self.tmp.mkdir()
        self.ann = tmp_path / "ann"
        self.ann.mkdir()
        monkeypatch.setattr(imp, "TMP_DIR", str(self.tmp))
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(self.ann))
        monkeypatch.setattr(imp, "LOCK_PATH", str(self.tmp / "import.lock"))

    def test_second_concurrent_run_is_skipped(self):
        holder = open(imp.LOCK_PATH, "w")
        fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with patch.object(imp, "_run_import") as run:
                assert imp.import_annotations() is None
            run.assert_not_called()
        finally:
            fcntl.flock(holder, fcntl.LOCK_UN)
            holder.close()

    def test_lock_is_released_after_a_run_even_when_it_fails(self):
        with patch.object(imp, "_run_import", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError):
                imp.import_annotations()
        with imp._exclusive_run() as acquired:
            assert acquired is True

    def test_each_run_gets_a_private_work_dir_that_is_removed(self):
        seen = {}

        def run(run_dir):
            seen["dir"] = run_dir
            assert os.path.isdir(run_dir)
            assert os.path.dirname(run_dir) == str(self.tmp)
            assert os.path.basename(run_dir).startswith(imp.RUN_DIR_PREFIX)
            (open(os.path.join(run_dir, "taxons_0_1.xml.gz"), "w")).close()

        with patch.object(imp, "_run_import", side_effect=run):
            imp.import_annotations()
        assert not os.path.exists(seen["dir"])

        with patch.object(imp, "_run_import", side_effect=lambda d: seen.update(second=d)):
            imp.import_annotations()
        assert seen["second"] != seen["dir"]

    def test_run_dir_is_removed_when_the_run_fails(self):
        seen = {}

        def run(run_dir):
            seen["dir"] = run_dir
            raise RuntimeError("boom")

        with patch.object(imp, "_run_import", side_effect=run):
            with pytest.raises(RuntimeError):
                imp.import_annotations()
        assert not os.path.exists(seen["dir"])

    def test_stale_leftovers_of_a_killed_run_are_swept(self):
        stale_dir = self.tmp / f"{imp.RUN_DIR_PREFIX}dead"
        stale_dir.mkdir()
        (stale_dir / "big.gff.gz").write_bytes(b"x")
        unrelated = self.tmp / "someone-elses-dir"
        unrelated.mkdir()
        sub = self.ann / "9606" / "GCA_1"
        sub.mkdir(parents=True)
        (sub / "Ensembl_m.gff.gz.part").write_bytes(b"x")
        (sub / "Ensembl_m.gff.gz.part.csi").write_bytes(b"x")
        live = sub / "Ensembl_ok.gff.gz"
        live.write_bytes(b"live")
        live_csi = sub / "Ensembl_ok.gff.gz.csi"
        live_csi.write_bytes(b"live")

        with patch.object(imp, "_run_import"):
            imp.import_annotations()

        assert not stale_dir.exists()
        assert unrelated.exists()
        assert sorted(os.listdir(sub)) == ["Ensembl_ok.gff.gz", "Ensembl_ok.gff.gz.csi"]
        assert live.read_bytes() == b"live"

    def test_taxonomy_and_assembly_steps_use_the_run_dir(self):
        rows = [_row()]
        with (
            patch.object(imp, "DEV", True),
            patch.object(imp.annotation_service, "fetch_from_url", return_value=rows),
            patch.object(imp.annotation_service, "filter_annotations_by_md5_checksum_and_url_path",
                         side_effect=lambda xs: xs),
            patch.object(imp.taxonomy_service, "handle_taxonomy", return_value={"9606": ["9606"]}) as tax,
            patch.object(imp.assembly_service, "handle_assemblies", return_value=([], [])) as asm,
            patch.object(imp.annotation_service, "handle_annotation_error"),
        ):
            imp.import_annotations()
        run_dir = tax.call_args[0][1]
        assert os.path.basename(run_dir).startswith(imp.RUN_DIR_PREFIX)
        assert asm.call_args[0][1] == run_dir


# --------------------------------------------------------------------------- #
# Audit #9: timeouts
# --------------------------------------------------------------------------- #
class TestTimeouts:
    def test_tsv_fetch_uses_a_request_timeout(self):
        resp = MagicMock()
        resp.__enter__.return_value = resp
        resp.iter_lines.return_value = []
        with patch.object(ann_svc.requests, "get", return_value=resp) as get:
            ann_svc.fetch_from_url("https://example.com/x.tsv")
        assert get.call_args.kwargs["timeout"] == ann_svc.REQUEST_TIMEOUT

    def test_gff_download_uses_a_request_timeout(self, tmp_path):
        resp = MagicMock()
        resp.__enter__.return_value = resp
        resp.headers = {"Last-Modified": "Wed, 03 Jan 2024 00:00:00 GMT"}
        resp.iter_content.return_value = [b"abc"]
        with patch.object(ann_svc.requests, "get", return_value=resp) as get:
            ann_svc.download_gff_file(_row(last_modified_date="2024-01-03"), str(tmp_path / "o.gz"))
        assert get.call_args.kwargs["timeout"] == ann_svc.REQUEST_TIMEOUT

    def test_download_that_takes_too_long_is_aborted(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ann_svc, "DOWNLOAD_TIMEOUT", -1)
        resp = MagicMock()
        resp.__enter__.return_value = resp
        resp.headers = {"Last-Modified": "Wed, 03 Jan 2024 00:00:00 GMT"}
        resp.iter_content.return_value = [b"abc"] * 3
        with patch.object(ann_svc.requests, "get", return_value=resp):
            with pytest.raises(Exception, match="Download exceeded"):
                ann_svc.download_gff_file(_row(last_modified_date="2024-01-03"), str(tmp_path / "o.gz"))

    def test_hung_shell_command_is_killed_with_its_children(self, tmp_path):
        marker = tmp_path / "survivor"
        started = time.monotonic()
        with pytest.raises(Exception, match="timed out"):
            # the sleeping grandchild would write the marker if it survived the group kill
            ann_svc._run_shell(f"(sleep 3; touch {marker}) & sleep 30", timeout=1)
        assert time.monotonic() - started < 10
        time.sleep(3.5)
        assert not marker.exists()

    def test_shell_command_result_is_returned(self):
        code, err = ann_svc._run_shell("echo oops >&2; exit 3", timeout=10)
        assert code == 3 and err.strip() == b"oops"

    def test_stderr_is_truncated(self):
        code, err = ann_svc._run_shell("head -c 100000 /dev/zero | tr '\\0' 'e' >&2; exit 1", timeout=10)
        assert code == 1 and len(err) == 4000


# --------------------------------------------------------------------------- #
# Audit #10: md5 file written by an un-awaited process substitution
# --------------------------------------------------------------------------- #
class TestMd5FileRace:
    def test_md5_that_appears_late_is_picked_up(self, tmp_path):
        path = tmp_path / "md5.txt"
        path.write_text("")  # redirect creates the file empty first

        def writer():
            time.sleep(0.3)
            path.write_text("abc123\n")

        threading.Thread(target=writer).start()
        assert ann_svc._read_md5_file(str(path), wait=5) == "abc123"

    def test_md5_that_never_appears_returns_none(self, tmp_path):
        assert ann_svc._read_md5_file(str(tmp_path / "missing.txt"), wait=0.2) is None

    def test_process_annotation_file_fails_cleanly_when_md5_is_never_produced(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ann_svc, "MD5_WAIT_SECONDS", 0.1)
        out = tmp_path / "Ensembl_src.gff.gz"

        def fake_run_shell(cmd, timeout=None):
            if cmd.startswith("tabix"):
                open(f"{out}.part.csi", "wb").write(b"csi")
            else:
                open(f"{out}.part", "wb").write(b"bgzip")
            return 0, b""

        ann = MagicMock(md5_checksum="src", access_url="http://x")
        with (
            patch.object(ann_svc, "download_gff_file", side_effect=lambda a, p: open(p, "wb").write(b"x")),
            patch.object(ann_svc, "_run_shell", side_effect=fake_run_shell),
        ):
            with pytest.raises(Exception, match="MD5 was not produced"):
                ann_svc.process_annotation_file(ann, str(tmp_path), str(out), [])
        assert not any(n.endswith(".part") or n.endswith(".part.csi") for n in os.listdir(tmp_path))


class _JobHarness:
    """Patches every collaborator of the import job so its orchestration can be asserted."""

    def _job(self, rows, lineages, valid_accessions):
        stack = ExitStack()
        stack.enter_context(patch.object(imp, "DEV", True))
        stack.enter_context(patch.object(imp.annotation_service, "fetch_from_url", return_value=rows))
        stack.enter_context(patch.object(
            imp.annotation_service, "filter_annotations_by_md5_checksum_and_url_path", side_effect=lambda xs: xs))
        stack.enter_context(patch.object(imp.taxonomy_service, "handle_taxonomy", return_value=lineages))
        stack.enter_context(patch.object(
            imp.assembly_service, "handle_assemblies", return_value=(valid_accessions, [])))
        stack.enter_context(patch.object(imp, "process_annotations_pipeline", return_value=[]))
        stack.enter_context(patch.object(imp.annotation_service, "clean_up_annotations_with_errors"))
        stack.enter_context(patch.object(imp.annotation_service, "delete_annotations"))
        stack.enter_context(patch.object(imp.stats_service, "update_db_stats"))
        stack.enter_context(patch.object(imp.stats_service, "update_taxon_gene_and_transcript_stats"))
        stack.enter_context(patch.object(imp, "GenomeAnnotation"))
        stack.enter_context(patch("jobs.taxonomy.export_flattened_taxonomy.delay"))
        return stack


# --------------------------------------------------------------------------- #
# Audit #12: repeated rows / repeated content inside one run
# --------------------------------------------------------------------------- #
class TestInRunDeduplication:
    def test_dedupe_by_url_and_by_source_md5_first_wins(self):
        a = _row(md5_checksum="m1", access_url="https://example.com/1")
        same_url = _row(md5_checksum="m2", access_url="https://example.com/1")
        same_md5 = _row(md5_checksum="m1", access_url="https://example.com/3")
        other = _row(md5_checksum="m4", access_url="https://example.com/4")
        kept, dropped = ann_svc.dedupe_annotations([a, same_url, same_md5, other])
        assert kept == [a, other]
        assert dropped == [same_url, same_md5]

    def _pipeline(self, rows, known):
        def process_file(ann, tmp, out, existing):
            md5 = "same-content"
            if md5 in existing:
                raise ann_svc.DuplicateAnnotationContentError(md5)
            return md5, 10

        summary = MagicMock(types=["gene"], sources=["x"])
        for row in rows:
            row.to_genome_annotation = MagicMock(
                side_effect=lambda **kw: MagicMock(annotation_id=kw["annotation_id"]))
        return (
            patch.object(imp.file_helper, "create_dir_path", return_value="/tmp/x"),
            patch.object(imp.shutil, "rmtree"),
            patch.object(imp.annotation_service, "init_annotation_file_paths", return_value=("/a/f.gff.gz", "/f.gff.gz")),
            patch.object(imp.annotation_service, "process_annotation_file", side_effect=process_file),
            patch.object(imp.annotation_service, "init_indexed_file_info", return_value=MagicMock()),
            patch.object(imp.feature_summary_service, "compute_features_summary", return_value=summary),
            patch.object(imp.seq_files, "write_contigs_from_tabix"),
            patch.object(imp.feature_stats_service, "compute_features_statistics", return_value=MagicMock()),
        )

    def test_identical_content_twice_in_one_batch_yields_one_annotation_and_no_error(self):
        rows = [_row(md5_checksum="s1", access_url="https://example.com/1"), _row(md5_checksum="s2", access_url="https://example.com/2")]
        known = set()
        with ExitStack() as es:
            for p in self._pipeline(rows, known):
                es.enter_context(p)
            handle_err = es.enter_context(patch.object(imp.annotation_service, "handle_annotation_error"))
            handle_dup = es.enter_context(patch.object(imp.annotation_service, "handle_duplicate_annotation_content"))
            result = imp.process_annotations_pipeline(rows, {}, known)
        assert len(result) == 1
        assert known == {"same-content"}
        handle_err.assert_not_called()
        handle_dup.assert_not_called()  # nothing in the DB to reconcile yet

    def test_content_already_stored_is_still_reconciled(self):
        rows = [_row(md5_checksum="s1")]
        known = {"same-content"}
        with ExitStack() as es:
            for p in self._pipeline(rows, known):
                es.enter_context(p)
            handle_dup = es.enter_context(patch.object(imp.annotation_service, "handle_duplicate_annotation_content"))
            assert imp.process_annotations_pipeline(rows, {}, known) == []
        handle_dup.assert_called_once()

    def test_job_dedupes_before_processing(self):
        rows = [_row(md5_checksum="m1", access_url="https://example.com/1"),
                _row(md5_checksum="m1", access_url="https://example.com/2")]
        helper = _JobHarness()
        with helper._job(rows, {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error"), \
                patch.object(imp, "process_annotations_pipeline", return_value=[]) as pipeline:
            imp._run_import("/tmp")
        processed = pipeline.call_args[0][0]
        assert len(processed) == 1


# --------------------------------------------------------------------------- #
# Audit #13: replacing a stored annotation must be safe
# --------------------------------------------------------------------------- #
class TestSaveAnnotationsReplacement:
    @pytest.fixture(autouse=True)
    def _root(self, tmp_path, monkeypatch, mongo):
        self.root = tmp_path / "annotations"
        self.root.mkdir()
        monkeypatch.setattr(file_helper, "ANNOTATIONS_PATH", str(self.root))

    def _make(self, annotation_id, *, url, source_md5, with_files=True, assembly="GCA_1", stored=True):
        """stored=True -> a document already in the DB; stored=False -> a fresh, unsaved one
        (what the pipeline hands to save_annotations)."""
        import uuid

        from db.models import GenomeAnnotation

        ann = make_annotation(
            annotation_id=annotation_id if stored else uuid.uuid4().hex,
            assembly_accession=assembly, with_stats=False, with_busco=False)
        if stored:
            ann.source_file_info.url_path = url
            ann.source_file_info.uncompressed_md5 = source_md5
            ann.save()
        else:
            data = ann.to_mongo().to_dict()
            ann.delete()
            data.pop("_id")
            ann = GenomeAnnotation._from_son(data, created=True)
            rel = f"{ann.taxid}/{assembly}/refseq_{annotation_id}.gff.gz"
            ann.annotation_id = annotation_id
            ann.indexed_file_info.bgzipped_path = rel
            ann.indexed_file_info.csi_path = f"{rel}.csi"
            ann.indexed_file_info.uncompressed_md5 = annotation_id
            ann.source_file_info.url_path = url
            ann.source_file_info.uncompressed_md5 = source_md5
        if with_files:
            gz = self.root / ann.indexed_file_info.bgzipped_path
            gz.parent.mkdir(parents=True, exist_ok=True)
            gz.write_bytes(b"gz")
            (self.root / f"{ann.indexed_file_info.bgzipped_path}.csi").write_bytes(b"csi")
            (self.root / f"{ann.indexed_file_info.bgzipped_path}.contigs.txt").write_text("chr1\n")
        return ann

    def _files(self, ann):
        from pathlib import Path

        base = self.root / ann.indexed_file_info.bgzipped_path
        return [base, Path(f"{base}.csi"), Path(f"{base}.contigs.txt")]

    def test_replacement_saved_old_document_and_files_are_removed(self):
        from db.models import GenomeAnnotation

        old = self._make("a" * 32, url="https://example.com/x.gff.gz", source_md5="old")
        old.save()
        new = self._make("b" * 32, url="https://example.com/x.gff.gz", source_md5="new", stored=False)

        saved = ann_svc.save_annotations([new], str(self.root))

        assert saved == ["b" * 32]
        assert GenomeAnnotation.objects.scalar("annotation_id") and \
            list(GenomeAnnotation.objects.scalar("annotation_id")) == ["b" * 32]
        assert not any(p.exists() for p in self._files(old))
        assert all(p.exists() for p in self._files(new))

    def test_replacement_that_cannot_be_saved_restores_the_old_annotation(self):
        from db.models import AnnotationError, GenomeAnnotation

        old = self._make("a" * 32, url="https://example.com/x.gff.gz", source_md5="old")
        old.save()
        # unrelated stored document owning the md5 the replacement wants -> unique index violation
        blocker = self._make("c" * 32, url="https://example.com/other.gff.gz", source_md5="taken", assembly="GCA_2")
        blocker.save()
        new = self._make("b" * 32, url="https://example.com/x.gff.gz", source_md5="taken", stored=False)

        saved = ann_svc.save_annotations([new], str(self.root))

        assert saved == []
        ids = sorted(GenomeAnnotation.objects.scalar("annotation_id"))
        assert ids == ["a" * 32, "c" * 32]  # old one is back
        assert all(p.exists() for p in self._files(old))  # its files were never touched
        assert not any(p.exists() for p in self._files(new))  # the failed replacement's files are gone
        error = AnnotationError.objects(url_path="https://example.com/x.gff.gz").first()
        assert error is not None and "Could not save" in error.error_message

    def test_new_files_are_kept_when_they_share_the_path_of_the_restored_document(self):
        old = self._make("a" * 32, url="https://example.com/x.gff.gz", source_md5="old")
        old.save()
        blocker = self._make("c" * 32, url="https://example.com/other.gff.gz", source_md5="taken", assembly="GCA_2")
        blocker.save()
        new = self._make("a" * 32, url="https://example.com/x.gff.gz", source_md5="taken", stored=False)  # same id -> same path

        ann_svc.save_annotations([new], str(self.root))

        assert all(p.exists() for p in self._files(old))

    def test_plain_insert_without_old_documents(self):
        from db.models import AnnotationError

        new = self._make("b" * 32, url="https://example.com/x.gff.gz", source_md5="new", stored=False)
        AnnotationError(
            assembly_accession="GCA_1", taxid="9606", organism_name="x", error_message="old failure",
            url_path="https://example.com/x.gff.gz", source_md5="new", release_date=datetime(2024, 1, 1),
            last_modified=datetime(2024, 1, 1), source_database="Ensembl").save()

        assert ann_svc.save_annotations([new], str(self.root)) == ["b" * 32]
        assert AnnotationError.objects.count() == 0
        assert all(p.exists() for p in self._files(new))


# --------------------------------------------------------------------------- #
# Audit #14: the "corrupted annotations" cleanup is scoped to this run
# --------------------------------------------------------------------------- #
class TestScopedCorruptedCleanup:
    def test_cleanup_query_is_limited_to_the_ids_saved_by_this_run(self):
        helper = _JobHarness()
        with helper._job([_row()], {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error"), \
                patch.object(imp, "process_annotations_pipeline", return_value=[MagicMock()]), \
                patch.object(imp.annotation_service, "save_annotations", return_value=["id1", "id2"]), \
                patch.object(imp.annotation_service, "delete_annotations") as delete:
            imp._run_import("/tmp")
        delete.assert_called_once()
        from db.models import GenomeAnnotation

        query = delete.call_args[0][0].to_query(GenomeAnnotation)
        assert query["annotation_id"] == {"$in": ["id1", "id2"]}

    def test_nothing_is_deleted_when_nothing_was_saved(self):
        helper = _JobHarness()
        with helper._job([_row()], {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error"), \
                patch.object(imp.annotation_service, "delete_annotations") as delete:
            imp._run_import("/tmp")
        delete.assert_not_called()


class TestDroppedRowsAreRecorded:
    def test_record_dropped_reports_only_the_filtered_rows(self):
        a, b = _row(md5_checksum="a"), _row(md5_checksum="b", taxon_id="42")
        with patch.object(imp.annotation_service, "handle_annotation_error") as handle:
            imp._record_dropped([a, b], [a], lambda r: f"no lineage for {r.taxon_id}")
        handle.assert_called_once_with(b, "no lineage for 42")

    def test_unresolved_taxon_is_recorded(self):
        rows = [_row(md5_checksum="ok", taxon_id="9606"), _row(md5_checksum="bad", taxon_id="0", access_url="https://example.com/2")]
        with _JobHarness()._job(rows, {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error") as handle:
            imp._run_import("/tmp")
        assert [c.args[0].md5_checksum for c in handle.call_args_list] == ["bad"]
        assert "lineage" in handle.call_args_list[0].args[1]

    def test_missing_assembly_is_recorded(self):
        rows = [_row(md5_checksum="ok", assembly_accession="GCA_1"),
                _row(md5_checksum="gone", assembly_accession="GCA_404", access_url="https://example.com/2")]
        with _JobHarness()._job(rows, {"9606": ["9606"]}, ["GCA_1"]), \
                patch.object(imp.annotation_service, "handle_annotation_error") as handle:
            imp._run_import("/tmp")
        assert [c.args[0].md5_checksum for c in handle.call_args_list] == ["gone"]
        assert "GCA_404" in handle.call_args_list[0].args[1]


# --------------------------------------------------------------------------- #
# Audit #15: skip filter is chunked but selects exactly what the original query selected
# --------------------------------------------------------------------------- #
class TestSkipFilterPairs:
    def _stored(self, annotation_id, url, md5, assembly):
        ann = make_annotation(annotation_id=annotation_id, assembly_accession=assembly,
                              with_stats=False, with_busco=False)
        ann.source_file_info.url_path = url
        ann.source_file_info.uncompressed_md5 = md5
        ann.save()

    def test_exact_pair_is_skipped_others_are_kept(self, mongo):
        self._stored("a" * 32, "https://example.com/A", "X", "GCA_1")
        exact = _row(access_url="https://example.com/A", md5_checksum="X")
        changed = _row(access_url="https://example.com/A", md5_checksum="Y")
        # same md5 as the stored one but at another URL: previously skipped by mistake
        elsewhere = _row(access_url="https://example.com/B", md5_checksum="X")
        kept = ann_svc.filter_annotations_by_md5_checksum_and_url_path([exact, changed, elsewhere])
        assert kept == [changed, elsewhere]

    def test_chunking_gives_the_same_result(self, mongo):
        for i in range(5):
            self._stored(f"{i}" * 32, f"https://example.com/{i}", f"m{i}", f"GCA_{i}")
        rows = [_row(access_url=f"https://example.com/{i}", md5_checksum=f"m{i}") for i in range(5)]
        rows.append(_row(access_url="https://example.com/new", md5_checksum="new"))
        kept = ann_svc.filter_annotations_by_md5_checksum_and_url_path(rows, chunk_size=2)
        assert [r.md5_checksum for r in kept] == ["new"]

    def test_empty_input(self, mongo):
        assert ann_svc.filter_annotations_by_md5_checksum_and_url_path([]) == []

    def test_dict_field_filter_accepts_any_collection_and_keeps_order(self):
        rows = [_row(taxon_id="1"), _row(taxon_id="2"), _row(taxon_id="3")]
        assert ann_svc.filter_annotations_dict_by_field(rows, "taxon_id", {"1": [], "3": []}.keys()) == [rows[0], rows[2]]
        assert ann_svc.filter_annotations_dict_by_field(rows, "taxon_id", iter(["2"])) == [rows[1]]


# --------------------------------------------------------------------------- #
# Audit #16: dict keys starting with '$' are rejected by mongoengine
# --------------------------------------------------------------------------- #
GFF_DOLLAR = [
    "chr1\tsrc\tgene\t1\t100\t.\t+\t.\tID=g1;biotype=$odd",
    "chr1\tsrc\t$tx\t1\t100\t.\t+\t.\tID=t1;Parent=g1;biotype=$odd",
    "chr1\tsrc\texon\t1\t100\t.\t+\t.\tID=e1;Parent=t1",
    "chr1\tsrc\t$root\t5\t6\t.\t+\t.\tID=r1",
]


class TestMongoSafeKeys:
    def test_helpers(self):
        assert safe_dict_key("$x") == "_x"
        assert safe_dict_key("a.b") == "a.b"
        assert sanitize_counts({"$a": 1, "_a": 2, "b": 3}) == {"_a": 3, "b": 3}
        assert list(sanitize_counts({"b": 1, "a": 2})) == ["a", "b"]

    def test_feature_summary_with_dollar_type_is_storable(self):
        summary = summary_svc._compute_features_summary_from_lines(GFF_DOLLAR)
        summary.validate()
        assert "_root" in summary.root_type_counts

    def test_feature_statistics_with_dollar_names_are_storable(self):
        stats = stats_svc._compute_features_statistics_from_lines(GFF_DOLLAR)
        stats.validate()
        assert "_tx" in stats.transcript_type_stats
        coding_or_not = {k: v for k, v in stats.gene_category_stats.items()}
        assert coding_or_not  # the gene was categorised
