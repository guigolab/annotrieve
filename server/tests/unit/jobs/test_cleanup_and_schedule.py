"""Leftovers of interrupted writes are cleaned; the misplaced-files check is scheduled as a dry run."""
import logging

import pytest

import helpers.assembly_sequence_files as seq_files
from celery_app.celery_config import beat_schedule
from jobs.services import annotation as annotation_service

pytestmark = pytest.mark.unit


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    return tmp_path


def _touch(root, *parts, age=7200):
    import os, time
    path = root.joinpath(*parts)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x")
    old = time.time() - age
    os.utime(path, (old, old))
    return path


def test_delete_assembly_files_removes_every_transient_leftover(root):
    leftovers = ["a.gff.gz.part", "a.gff.gz.part.csi", "a.gff.gz.contigs.txt.tmp",
                 "chromosomes.json.tmp", "assembly_report.txt.tmp", "a.gff.gz.moving"]
    for name in leftovers + ["chromosomes.json"]:
        _touch(root, "9", "GCA_1.1", name)
    seq_files.delete_assembly_files("9", "GCA_1.1")
    assert not (root / "9" / "GCA_1.1").exists()


def test_delete_assembly_files_keeps_published_annotation_files(root):
    keep = [_touch(root, "9", "GCA_1.1", n) for n in ("E_x.gff.gz", "E_x.gff.gz.csi", "E_x.gff.gz.contigs.txt")]
    _touch(root, "9", "GCA_1.1", "E_x.gff.gz.part")
    seq_files.delete_assembly_files("9", "GCA_1.1")
    assert all(p.is_file() for p in keep)
    assert not (root / "9" / "GCA_1.1" / "E_x.gff.gz.part").exists()


def test_annotation_removal_also_removes_part_leftovers(root, monkeypatch):
    from helpers import file as file_helper
    monkeypatch.setattr(file_helper, "ANNOTATIONS_PATH", str(root))
    class Ann:  # minimal stand-in for a GenomeAnnotation
        annotation_id = "x"
        class indexed_file_info:
            bgzipped_path = "/9/GCA_1.1/E_x.gff.gz"
    names = ["E_x.gff.gz", "E_x.gff.gz.csi", "E_x.gff.gz.contigs.txt",
             "E_x.gff.gz.part", "E_x.gff.gz.part.csi", "E_x.gff.gz.contigs.txt.tmp"]
    for n in names:
        _touch(root, "9", "GCA_1.1", n)
    annotation_service.remove_files_from_annotations([Ann()], str(root))
    assert not (root / "9" / "GCA_1.1").exists()


def test_misplaced_check_is_scheduled_as_dry_run():
    entry = beat_schedule["check-misplaced-assembly-files-monthly"]
    assert entry["task"] == "relocate_misplaced_assembly_files"
    assert entry["kwargs"] == {"dry_run": True}


def test_dry_run_warns_when_misplaced(monkeypatch, caplog):
    from jobs import relocate_assembly_files as job
    monkeypatch.setattr(job, "relocate_all", lambda dry_run=True: {"misplaced_assemblies": 3, "conflicts": [], "errors": []})
    with caplog.at_level(logging.WARNING):
        job.relocate_misplaced_assembly_files(dry_run=True)
    assert "3 assemblies have files outside" in caplog.text


def test_young_leftover_of_a_running_write_is_kept(root):
    live = _touch(root, "9", "GCA_1.1", "E_x.gff.gz.part", age=5)
    old = _touch(root, "9", "GCA_1.1", "E_y.gff.gz.part")
    seq_files.delete_assembly_files("9", "GCA_1.1")
    assert live.is_file() and not old.exists()
