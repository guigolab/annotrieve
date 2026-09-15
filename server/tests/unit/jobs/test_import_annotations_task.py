import importlib
from unittest.mock import MagicMock, patch

import pytest

from jobs.services.classes import AnnotationToProcess

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


def _ann(**kwargs):
    defaults = dict(
        md5_checksum="m1",
        taxon_id="9606",
        assembly_accession="GCA_1",
        access_url="https://example.com/a.gff",
    )
    defaults.update(kwargs)
    return AnnotationToProcess(**defaults)


class TestImportAnnotationsTask:
    def test_early_exit_after_empty_lineage_filter(self, monkeypatch):
        monkeypatch.setattr(imp, "DEV", "1")
        with (
            patch.object(imp.annotation_service, "fetch_from_url", return_value=[_ann()]),
            patch.object(
                imp.annotation_service,
                "filter_annotations_by_md5_checksum_and_url_path",
                side_effect=lambda xs: xs,
            ),
            patch.object(imp, "random") as rnd,
            patch.object(
                imp.taxonomy_service, "handle_taxonomy", return_value={}
            ) as tax,
            patch.object(
                imp.annotation_service,
                "filter_annotations_dict_by_field",
                return_value=[],
            ) as filt,
            patch.object(imp.assembly_service, "handle_assemblies") as assemblies,
        ):
            rnd.sample.side_effect = lambda xs, n: xs
            result = imp.import_annotations()
        tax.assert_called_once()
        filt.assert_called_once()
        assemblies.assert_not_called()
        assert result is None

    def test_early_exit_after_empty_assembly_filter(self, monkeypatch):
        monkeypatch.setattr(imp, "DEV", "1")
        anns = [_ann()]
        with (
            patch.object(imp.annotation_service, "fetch_from_url", return_value=anns),
            patch.object(
                imp.annotation_service,
                "filter_annotations_by_md5_checksum_and_url_path",
                side_effect=lambda xs: xs,
            ),
            patch.object(imp, "random") as rnd,
            patch.object(
                imp.taxonomy_service,
                "handle_taxonomy",
                return_value={"9606": ["1", "9606"]},
            ),
            patch.object(
                imp.annotation_service,
                "filter_annotations_dict_by_field",
                side_effect=[anns, []],
            ),
            patch.object(
                imp.assembly_service,
                "handle_assemblies",
                return_value=(["GCA_1"], []),
            ) as assemblies,
            patch.object(imp, "GenomeAnnotation") as GA,
        ):
            rnd.sample.side_effect = lambda xs, n: xs
            result = imp.import_annotations()
        assemblies.assert_called_once()
        GA.objects.assert_not_called()
        assert result is None

    def test_pipeline_smoke_saves_and_delays(self, monkeypatch):
        monkeypatch.setattr(imp, "DEV", "1")
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", "/ann")
        monkeypatch.setattr(imp, "BATCH_SIZE", 10)
        anns = [_ann()]
        processed = [MagicMock(name="GenomeAnnotation")]

        with (
            patch.object(imp.annotation_service, "fetch_from_url", return_value=anns),
            patch.object(
                imp.annotation_service,
                "filter_annotations_by_md5_checksum_and_url_path",
                side_effect=lambda xs: xs,
            ),
            patch.object(imp, "random") as rnd,
            patch.object(
                imp.taxonomy_service,
                "handle_taxonomy",
                return_value={"9606": ["1", "9606"]},
            ),
            patch.object(
                imp.annotation_service,
                "filter_annotations_dict_by_field",
                side_effect=[anns, anns],
            ),
            patch.object(
                imp.assembly_service,
                "handle_assemblies",
                return_value=(["GCA_1"], ["GCA_1"]),
            ),
            patch.object(imp, "GenomeAnnotation") as GA,
            patch.object(
                imp, "process_annotations_pipeline", return_value=processed
            ) as pipeline,
            patch.object(imp.annotation_service, "save_annotations") as save,
            patch.object(imp.annotation_service, "clean_up_annotations_with_errors"),
            patch.object(imp.annotation_service, "delete_annotations"),
            patch.object(imp.stats_service, "update_db_stats"),
            patch.object(imp.stats_service, "update_taxon_gene_and_transcript_stats"),
            patch(
                "jobs.assemblies.sync_new_assemblies_from_summary.delay"
            ) as sync_delay,
            patch("jobs.taxonomy.export_flattened_taxonomy.delay") as export_delay,
        ):
            rnd.sample.side_effect = lambda xs, n: xs
            GA.objects.return_value.scalar.return_value = []
            imp.import_annotations()

        pipeline.assert_called_once()
        save.assert_called_once_with(processed, "/ann")
        sync_delay.assert_called_once_with(accessions=["GCA_1"])
        export_delay.assert_called_once()


class TestProcessAnnotationsPipeline:
    """
    Regression coverage for the bug where content that already exists in the
    database (source URL changed but md5 unchanged) caused the pipeline to delete
    the still-valid on-disk files backing the existing GenomeAnnotation, without
    touching that document's row.
    """

    def _patch_common(self, full_bgzipped_path, relative_bgzipped_path):
        return (
            patch.object(imp.file_helper, "create_dir_path", return_value="/tmp/fake-work"),
            patch.object(imp.shutil, "rmtree"),
            patch.object(
                imp.annotation_service,
                "init_annotation_file_paths",
                return_value=(full_bgzipped_path, relative_bgzipped_path),
            ),
        )

    def test_duplicate_content_error_reconciles_metadata_without_deleting_files(self, monkeypatch):
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", "/ann")
        ann = _ann(md5_checksum="m1", taxon_id="9606", assembly_accession="GCA_1")
        full_path = "/ann/9606/GCA_1/Ensembl_m1.gff.gz"
        relative_path = "/9606/GCA_1/Ensembl_m1.gff.gz"
        dup_err = imp.annotation_service.DuplicateAnnotationContentError("content-md5")

        p1, p2, p3 = self._patch_common(full_path, relative_path)
        with (
            p1, p2, p3,
            patch.object(imp.annotation_service, "process_annotation_file", side_effect=dup_err),
            patch.object(imp.annotation_service, "handle_duplicate_annotation_content") as handle_dup,
            patch.object(imp.annotation_service, "handle_annotation_error") as handle_err,
            patch.object(imp.annotation_service, "safe_remove_annotation_file") as safe_remove,
        ):
            result = imp.process_annotations_pipeline([ann], {}, ["content-md5"])

        assert result == []
        handle_dup.assert_called_once_with(ann, "content-md5")
        handle_err.assert_not_called()
        safe_remove.assert_not_called()

    def test_generic_error_uses_safe_remove_for_bgzip_and_csi(self, monkeypatch):
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", "/ann")
        ann = _ann(md5_checksum="m2", taxon_id="9606", assembly_accession="GCA_1")
        full_path = "/ann/9606/GCA_1/Ensembl_m2.gff.gz"
        relative_path = "/9606/GCA_1/Ensembl_m2.gff.gz"

        p1, p2, p3 = self._patch_common(full_path, relative_path)
        with (
            p1, p2, p3,
            patch.object(imp.annotation_service, "process_annotation_file", side_effect=Exception("boom")),
            patch.object(imp.annotation_service, "handle_duplicate_annotation_content") as handle_dup,
            patch.object(imp.annotation_service, "handle_annotation_error") as handle_err,
            patch.object(imp.annotation_service, "safe_remove_annotation_file") as safe_remove,
        ):
            result = imp.process_annotations_pipeline([ann], {}, [])

        assert result == []
        handle_dup.assert_not_called()
        handle_err.assert_called_once()
        assert safe_remove.call_count == 2
        safe_remove.assert_any_call(full_path, "/ann", relative_path)
        safe_remove.assert_any_call(f"{full_path}.csi", "/ann", f"{relative_path}.csi")
