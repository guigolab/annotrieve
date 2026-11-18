"""Remaining audit OOM-section items: sort limits, RAM-backed tmp, streamed deletes, capped sets."""

import gzip
import importlib
import subprocess
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from mongoengine import connect, disconnect

from helpers import file as file_helper
from jobs.services import annotation as ann_svc
from jobs.services import feature_summary as summary_svc
from tests.integration.factories import make_annotation

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


class TestSortIsMemoryBounded:
    def test_buffer_and_spill_dir_are_in_the_command(self):
        cmd = ann_svc.build_stream_cmd("/work/dir one/in.gff.gz", "/work/md5.txt", "/out/x.part")
        assert f"-S {ann_svc.SORT_BUFFER_SIZE}" in cmd
        assert f"--parallel={ann_svc.SORT_THREADS}" in cmd
        assert "-T '/work/dir one'" in cmd  # spill next to the per-annotation work dir, quoted

    def test_repair_job_signature_still_works_without_a_spill_dir(self):
        cmd = ann_svc._sorted_gff_stream_cmd("/work/in.gff.gz")
        assert "-T" not in cmd and "-S " in cmd

    @pytest.mark.parametrize("value,expected", [
        ("512M", "512M"), ("2G", "2G"), ("50%", "50%"), ("1024", "1024"),
        ("512M; rm -rf /", "512M"), ("$(id)", "512M"), ("", "512M"), ("abc", "512M"),
    ])
    def test_buffer_size_from_the_environment_is_validated(self, value, expected):
        assert ann_svc._valid_sort_size(value, "512M") == expected

    def test_output_is_identical_with_a_tiny_buffer_that_forces_spilling(self, tmp_path, monkeypatch):
        rows = [f"chr{(i * 7) % 5}\ts\tgene\t{(i * 7919) % 100000}\t{i + 100000}\t.\t+\t.\tID=g{i}" for i in range(20000)]
        gz = tmp_path / "in.gff.gz"
        gz.write_bytes(gzip.compress(("##gff-version 3\n" + "\n".join(rows) + "\n").encode()))

        def run(buffer_size):
            monkeypatch.setattr(ann_svc, "SORT_BUFFER_SIZE", buffer_size)
            out = tmp_path / f"out_{buffer_size}.gff"
            cmd = ann_svc.build_stream_cmd(str(gz), str(tmp_path / f"md5_{buffer_size}"), str(out), compressor="cat")
            assert subprocess.run(["bash", "-c", cmd], capture_output=True).returncode == 0
            return out.read_bytes()

        assert run("1K") == run("512M")


class TestRamBackedTmp:
    MOUNTS = (
        "overlay / overlay rw 0 0\n"
        "tmpfs /tmp tmpfs rw,nosuid 0 0\n"
        "/dev/sda1 /data ext4 rw 0 0\n"
        "tmpfs /data/ram tmpfs rw 0 0\n"
        "/dev/sdb1 /with\\040space ext4 rw 0 0\n"
    )

    @pytest.mark.parametrize("path,expected", [
        ("/tmp", "tmpfs"), ("/tmp/job/x", "tmpfs"), ("/data", "ext4"), ("/data/sub/dir", "ext4"),
        ("/data/ram/x", "tmpfs"), ("/var/lib", "overlay"), ("/tmpfoo", "overlay"),
        ("/with space/x", "ext4"),
    ])
    def test_longest_mount_point_wins(self, tmp_path, path, expected, monkeypatch):
        mounts = tmp_path / "mounts"
        mounts.write_text(self.MOUNTS)
        monkeypatch.setattr(imp.os.path, "realpath", lambda p: p)
        assert imp._filesystem_type(path, str(mounts)) == expected

    def test_unreadable_mounts_file_is_not_fatal(self, tmp_path):
        assert imp._filesystem_type("/tmp", str(tmp_path / "missing")) is None

    @pytest.mark.parametrize("fs,warns", [("tmpfs", True), ("ramfs", True), ("ext4", False), (None, False)])
    def test_warning_only_for_ram_backed_filesystems(self, fs, warns, caplog, monkeypatch):
        monkeypatch.setattr(imp, "_filesystem_type", lambda path: fs)
        with caplog.at_level("WARNING", logger=imp.logger.name):
            imp._warn_if_ram_backed("/tmp")
        assert ("IMPORT_TMP_DIR" in caplog.text) is warns

    def test_tmp_dir_is_configurable(self, monkeypatch):
        monkeypatch.setenv("IMPORT_TMP_DIR", "/var/tmp/annotrieve")
        try:
            reloaded = importlib.reload(imp)
            assert reloaded.TMP_DIR == "/var/tmp/annotrieve"
            assert reloaded.LOCK_PATH.startswith("/var/tmp/annotrieve/")
        finally:
            monkeypatch.delenv("IMPORT_TMP_DIR")
            importlib.reload(imp)


@pytest.fixture
def mongo():
    from db.models import GenomeAnnotation

    disconnect(alias="default")
    connect(db="audit_oom", alias="default", mongo_client_class=mongomock.MongoClient)
    GenomeAnnotation.objects.delete()
    yield
    GenomeAnnotation.objects.delete()
    disconnect(alias="default")


class TestDeletesAreStreamed:
    def test_delete_annotations_removes_documents_and_files(self, mongo, tmp_path, monkeypatch):
        from db.models import GenomeAnnotation

        monkeypatch.setattr(file_helper, "ANNOTATIONS_PATH", str(tmp_path))
        ids = []
        for i in range(3):
            ann = make_annotation(annotation_id=f"{i}" * 32, assembly_accession=f"GCA_{i}")
            base = tmp_path / ann.indexed_file_info.bgzipped_path
            base.parent.mkdir(parents=True, exist_ok=True)
            for suffix in ("", ".csi", ".contigs.txt"):
                (base.parent / f"{base.name}{suffix}").write_bytes(b"x")
            ids.append(ann.annotation_id)

        ann_svc.delete_annotations({"annotation_id__in": ids[:2]}, str(tmp_path))

        assert list(GenomeAnnotation.objects.scalar("annotation_id")) == [ids[2]]
        remaining = sorted(p.name for p in tmp_path.rglob("*") if p.is_file())
        assert len(remaining) == 3 and all(ids[2] in name for name in remaining)

    def test_only_path_fields_are_loaded_and_results_are_not_cached(self):
        qs = MagicMock()
        qs.count.return_value = 1
        qs.only.return_value.no_cache.return_value = []
        with patch.object(ann_svc, "GenomeAnnotation") as GA:
            GA.objects.return_value = qs
            ann_svc.delete_annotations({"annotation_id": "x"}, "/ann")
        qs.only.assert_called_once_with("annotation_id", "indexed_file_info")
        qs.only.return_value.no_cache.assert_called_once()
        qs.delete.assert_called_once()


class TestSummarySetsAreCapped:
    def test_unbounded_attribute_keys_and_biotypes_are_capped(self, monkeypatch):
        monkeypatch.setattr(summary_svc, "MAX_DISTINCT_VALUES", 50)
        lines = [f"c\ts\tgene\t1\t2\t.\t+\t.\tID=g{i};key{i}=1;biotype=b{i}" for i in range(500)]
        summary = summary_svc._compute_features_summary_from_lines(lines)
        assert len(summary.attribute_keys) == 50
        assert len(summary.biotypes) == 50
        assert "ID" in summary.attribute_keys  # the first (real) keys are kept
        assert summary.types == ["gene"] and summary.has_biotype is True

    def test_normal_files_are_unaffected(self):
        lines = ["c\ts\tgene\t1\t2\t.\t+\t.\tID=g1;biotype=protein_coding;Name=x",
                 "c\ts\tmRNA\t1\t2\t.\t+\t.\tID=t1;Parent=g1"]
        summary = summary_svc._compute_features_summary_from_lines(lines)
        assert sorted(summary.attribute_keys) == ["ID", "Name", "Parent", "biotype"]
        assert summary.biotypes == ["protein_coding"]
