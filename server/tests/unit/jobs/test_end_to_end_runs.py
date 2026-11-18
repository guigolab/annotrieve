"""
Whole import cycles (filter -> reconcile -> download/sort/index -> save) over a mock database and a
real bash pipeline. `bgzip` and `tabix` are replaced by tiny shims (gzip / touch .csi) so the test
needs no bioinformatics tools; downloads and the pysam-based statistics are faked.
"""

import gzip
import hashlib
import importlib
import os
import stat
from pathlib import Path
from unittest.mock import MagicMock, patch

import mongomock
import pytest
from tests.unit.jobs.mongomock_helper import connect_mongomock
from mongoengine import connect, disconnect

from db.embedded_documents import FeatureOverview, GFFStats
from jobs.services import annotation as ann_svc
from jobs.services.classes import AnnotationToProcess

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit

CONTENT_1 = b"##gff-version 3\nchr2\ts\tgene\t5\t9\t.\t+\t.\tID=b\nchr1\ts\tgene\t1\t4\t.\t+\t.\tID=a\n"
CONTENT_2 = CONTENT_1 + b"chr1\ts\tgene\t10\t14\t.\t+\t.\tID=c\n"
# same records in another order: other source md5, identical sorted content
CONTENT_1_REORDERED = b"##gff-version 3\nchr1\ts\tgene\t1\t4\t.\t+\t.\tID=a\nchr2\ts\tgene\t5\t9\t.\t+\t.\tID=b\n"


def md5(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def sorted_md5(data: bytes) -> str:
    lines = data.decode().splitlines()
    header = [l for l in lines if l.startswith("#")]
    body = sorted((l for l in lines if not l.startswith("#")), key=lambda l: (l.split("\t")[0], int(l.split("\t")[3])))
    return md5(("\n".join(header + body) + "\n").encode())


@pytest.fixture
def world(tmp_path, monkeypatch):
    from db.models import AnnotationError, GenomeAnnotation

    shims = tmp_path / "bin"
    shims.mkdir()
    (shims / "bgzip").write_text("#!/bin/sh\nexec gzip -c\n")
    (shims / "tabix").write_text('#!/bin/sh\nfor last; do :; done\nprintf csi > "$last.csi"\n')
    for name in ("bgzip", "tabix"):
        (shims / name).chmod((shims / name).stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{shims}:{os.environ['PATH']}")

    root = tmp_path / "ann"
    root.mkdir()
    monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(root))
    from helpers import file as file_helper

    monkeypatch.setattr(file_helper, "ANNOTATIONS_PATH", str(root))

    disconnect(alias="default")
    connect_mongomock("e2e")
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()

    class World:
        files = {}          # url -> bytes served
        downloads = []      # urls actually downloaded
        annotations_root = root
        work = tmp_path / "work"

    World.work.mkdir()

    def fake_download(annotation, destination):
        World.downloads.append(annotation.access_url)
        Path(destination).write_bytes(gzip.compress(World.files[annotation.access_url]))

    summary = FeatureOverview(types=["gene"], sources=["s"], attribute_keys=["ID"], biotypes=[])
    patches = [
        patch.object(ann_svc, "download_gff_file", side_effect=fake_download),
        patch.object(imp.feature_summary_service, "compute_features_summary", return_value=summary),
        patch.object(imp.feature_stats_service, "compute_features_statistics", return_value=GFFStats()),
        patch.object(imp.seq_files, "write_contigs_from_tabix"),
    ]
    for p in patches:
        p.start()
    yield World
    for p in patches:
        p.stop()
    GenomeAnnotation.objects.delete()
    AnnotationError.objects.delete()
    disconnect(alias="default")


def row(url, content, **kwargs):
    defaults = dict(
        source_database="Ensembl", annotation_provider="Ensembl", release_date="2024-01-02",
        last_modified_date="2024-01-03", md5_checksum=md5(content), access_url=url, taxon_id="9606",
        organism_name="Homo sapiens", assembly_accession="GCA_1", assembly_name="GRCh38",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


def run_cycle(world, rows, listed=None):
    """What _run_import does between 'fetch' and 'save', for already-fetched rows."""
    from db.models import GenomeAnnotation

    listed = {r.access_url for r in rows} if listed is None else listed
    new = ann_svc.filter_annotations_by_md5_checksum_and_url_path(rows)
    new = ann_svc.skip_known_conflicts(new)
    new, _ = ann_svc.dedupe_annotations(new)
    new, _moved = ann_svc.reconcile_moved_sources(new, listed_urls=listed)
    if not new:
        return []
    known = set(GenomeAnnotation.objects().no_cache().scalar("annotation_id"))
    mismatches = []
    processed = []
    for batch in [new[i:i + 10] for i in range(0, len(new), 10)]:
        processed = imp.process_annotations_pipeline(batch, {"9606": ["9606", "1"]}, known,
                                                      work_dir=str(world.work), md5_mismatches=mismatches)
        if processed:
            saved = ann_svc.save_annotations(processed, str(world.annotations_root))
            imp._record_md5_mismatches(mismatches, processed, saved)
    return processed


def stored():
    from db.models import GenomeAnnotation

    return {a.annotation_id: a for a in GenomeAnnotation.objects}


def files_under(root):
    return sorted(str(p.relative_to(root)) for p in Path(root).rglob("*") if p.is_file())


class TestCycles:
    def test_first_import_stores_the_sorted_md5_as_identity_and_publishes_files(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_1)])
        annotations = stored()
        assert list(annotations) == [sorted_md5(CONTENT_1)]
        doc = annotations[sorted_md5(CONTENT_1)]
        assert doc.source_file_info.uncompressed_md5 == md5(CONTENT_1)
        assert doc.indexed_file_info.uncompressed_md5 == sorted_md5(CONTENT_1)
        name = f"Ensembl_{md5(CONTENT_1)}.gff.gz"
        assert files_under(world.annotations_root) == [f"9606/GCA_1/{name}", f"9606/GCA_1/{name}.csi"]
        assert gzip.decompress((world.annotations_root / "9606/GCA_1" / name).read_bytes()).decode().startswith(
            "##gff-version 3\nchr1")

    def test_rerun_with_the_same_listing_does_nothing(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        rows = [row("https://e.org/a.gff.gz", CONTENT_1)]
        run_cycle(world, rows)
        world.downloads.clear()
        before = files_under(world.annotations_root)
        run_cycle(world, rows)
        assert world.downloads == [] and files_under(world.annotations_root) == before

    def test_moved_url_is_reconciled_without_downloading_and_then_skipped(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_1)])
        world.downloads.clear()
        before = files_under(world.annotations_root)
        moved = [row("https://e.org/v2/a.gff.gz", CONTENT_1, last_modified_date="2025-05-05")]
        run_cycle(world, moved)
        assert world.downloads == []
        doc = stored()[sorted_md5(CONTENT_1)]
        assert doc.source_file_info.url_path == "https://e.org/v2/a.gff.gz"
        assert files_under(world.annotations_root) == before
        run_cycle(world, moved)
        assert world.downloads == []

    def test_a_second_listing_of_the_same_file_does_not_flip_the_record(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        old = row("https://e.org/a.gff.gz", CONTENT_1)
        run_cycle(world, [old])
        both = [old, row("https://e.org/copy/a.gff.gz", CONTENT_1)]
        for _ in range(3):
            run_cycle(world, both)
            assert stored()[sorted_md5(CONTENT_1)].source_file_info.url_path == "https://e.org/a.gff.gz"
        assert world.downloads == ["https://e.org/a.gff.gz"]

    def test_changed_content_at_the_same_url_replaces_record_and_files(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_1)])
        world.files["https://e.org/a.gff.gz"] = CONTENT_2
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_2)])
        assert list(stored()) == [sorted_md5(CONTENT_2)]
        name = f"Ensembl_{md5(CONTENT_2)}.gff.gz"
        assert files_under(world.annotations_root) == [f"9606/GCA_1/{name}", f"9606/GCA_1/{name}.csi"]

    def test_new_release_url_with_new_content_adds_a_record_and_keeps_the_old_one(self, world):
        world.files["https://e.org/2023/a.gff.gz"] = CONTENT_1
        run_cycle(world, [row("https://e.org/2023/a.gff.gz", CONTENT_1)])
        world.files["https://e.org/2024/a.gff.gz"] = CONTENT_2
        run_cycle(world, [row("https://e.org/2024/a.gff.gz", CONTENT_2)])
        assert set(stored()) == {sorted_md5(CONTENT_1), sorted_md5(CONTENT_2)}

    def test_same_sorted_content_with_another_source_md5_updates_the_source_and_leaves_no_orphan_file(self, world):
        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_1)])
        before = files_under(world.annotations_root)
        world.files["https://e.org/a.gff.gz"] = CONTENT_1_REORDERED
        assert md5(CONTENT_1) != md5(CONTENT_1_REORDERED)
        assert sorted_md5(CONTENT_1) == sorted_md5(CONTENT_1_REORDERED)
        run_cycle(world, [row("https://e.org/a.gff.gz", CONTENT_1_REORDERED)])
        docs = stored()
        assert list(docs) == [sorted_md5(CONTENT_1)]
        assert docs[sorted_md5(CONTENT_1)].source_file_info.uncompressed_md5 == md5(CONTENT_1_REORDERED)
        assert files_under(world.annotations_root) == before

    def test_tracker_md5_that_does_not_match_the_download_is_recorded_and_survives_reruns(self, world):
        from db.models import AnnotationError

        world.files["https://e.org/a.gff.gz"] = CONTENT_1
        stale = row("https://e.org/a.gff.gz", CONTENT_1, md5_checksum="f" * 32)
        run_cycle(world, [stale])
        assert stored()[sorted_md5(CONTENT_1)].source_file_info.uncompressed_md5 == "f" * 32
        error = AnnotationError.objects.get(url_path="https://e.org/a.gff.gz")
        assert error.error_kind == ann_svc.ERROR_KIND_MD5_MISMATCH and md5(CONTENT_1) in error.error_message
        world.downloads.clear()
        run_cycle(world, [stale])  # nothing new: skipped, and the cleanup must not erase the note
        assert world.downloads == []
        ann_svc.clean_up_annotations_with_errors()
        assert AnnotationError.objects(url_path="https://e.org/a.gff.gz").count() == 1
        # the tracker catches up: new md5 -> reprocessed -> record healed, error cleared
        fresh = row("https://e.org/a.gff.gz", CONTENT_1)
        run_cycle(world, [fresh])
        assert AnnotationError.objects(url_path="https://e.org/a.gff.gz").count() == 0
        assert list(stored()) == [sorted_md5(CONTENT_1)]

    def test_truncated_download_is_an_error_and_publishes_nothing(self, world):
        from db.models import AnnotationError

        data = gzip.compress(CONTENT_2 * 500)
        world.files["https://e.org/t.gff.gz"] = CONTENT_1

        def truncated(annotation, destination):
            Path(destination).write_bytes(data[: len(data) // 2])

        with patch.object(ann_svc, "download_gff_file", side_effect=truncated):
            run_cycle(world, [row("https://e.org/t.gff.gz", CONTENT_1)])
        assert stored() == {}
        assert files_under(world.annotations_root) == []
        assert AnnotationError.objects(url_path="https://e.org/t.gff.gz").count() == 1
