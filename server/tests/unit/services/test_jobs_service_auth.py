import os
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from services import jobs_service

pytestmark = pytest.mark.unit

# Already covered in B1: export_flattened_taxonomy, track_unique_users_by_country
REMAINING_SIMPLE_TRIGGERS = [
    ("trigger_update_records", "services.jobs_service.update_records.delay"),
    ("trigger_import_annotations", "services.jobs_service.import_annotations.delay"),
    ("trigger_update_taxonomy_stats", "services.jobs_service.update_taxon_stats.delay"),
    ("trigger_backfill_taxon_parent_id", "services.jobs_service.backfill_taxon_parent_id.delay"),
    ("trigger_update_busco_scores", "services.jobs_service.update_busco_scores.delay"),
    (
        "trigger_update_taxons_busco_scores",
        "services.jobs_service.update_taxons_busco_scores_job.delay",
    ),
    (
        "trigger_remap_all_assemblies_and_annotations",
        "services.jobs_service.remap_all_assemblies_and_annotations.delay",
    ),
    (
        "trigger_backfill_placeholder_assembly_download_urls",
        "services.jobs_service.backfill_placeholder_assembly_download_urls.delay",
    ),
]


class TestJobsServiceAuth:
    def test_wrong_key_raises_401(self):
        with patch.dict(os.environ, {"AUTH_KEY": "secret"}):
            with pytest.raises(HTTPException) as ctx:
                jobs_service.trigger_export_flattened_taxonomy("wrong")
        assert ctx.value.status_code == 401

    def test_empty_key_raises_401_when_expected_set(self):
        with patch.dict(os.environ, {"AUTH_KEY": "secret"}):
            with pytest.raises(HTTPException) as ctx:
                jobs_service.trigger_export_flattened_taxonomy("")
        assert ctx.value.status_code == 401

    def test_valid_key_triggers_delay(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch("services.jobs_service.export_flattened_taxonomy.delay") as delay,
        ):
            result = jobs_service.trigger_export_flattened_taxonomy("secret")
        delay.assert_called_once_with()
        assert "message" in result

    def test_second_trigger_smoke(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch("services.jobs_service.track_unique_users_by_country.delay") as delay,
        ):
            result = jobs_service.trigger_track_unique_users_by_country("secret")
        delay.assert_called_once_with()
        assert "message" in result

    @pytest.mark.parametrize("fn_name,delay_path", REMAINING_SIMPLE_TRIGGERS)
    def test_remaining_triggers_auth_and_delay(self, fn_name, delay_path):
        fn = getattr(jobs_service, fn_name)
        with patch.dict(os.environ, {"AUTH_KEY": "secret"}):
            with pytest.raises(HTTPException) as ctx:
                fn("wrong")
            assert ctx.value.status_code == 401

            with patch(delay_path) as delay:
                result = fn("secret")
            delay.assert_called_once()
            assert "message" in result

    def test_prune_passes_dry_run(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch(
                "services.jobs_service.prune_annotations_missing_source_url.delay"
            ) as delay,
        ):
            jobs_service.trigger_prune_annotations_missing_source_url(
                "secret", dry_run=False
            )
        delay.assert_called_once_with(dry_run=False)

    def test_unset_passes_dry_run(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch(
                "services.jobs_service.unset_genome_annotation_mapped_regions_task.delay"
            ) as delay,
        ):
            jobs_service.trigger_unset_genome_annotation_mapped_regions(
                "secret", dry_run=True
            )
        delay.assert_called_once_with(dry_run=True)

    def test_repair_missing_annotation_files_passes_dry_run(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch(
                "services.jobs_service.repair_missing_annotation_files.delay"
            ) as delay,
        ):
            jobs_service.trigger_repair_missing_annotation_files(
                "secret", dry_run=False
            )
        delay.assert_called_once_with(dry_run=False)

    def test_sync_passes_accessions(self):
        with (
            patch.dict(os.environ, {"AUTH_KEY": "secret"}),
            patch(
                "services.jobs_service.sync_new_assemblies_from_summary.delay"
            ) as delay,
        ):
            jobs_service.trigger_sync_new_assemblies_from_summary(
                "secret", accessions=["GCA_1"]
            )
        delay.assert_called_once_with(accessions=["GCA_1"])
