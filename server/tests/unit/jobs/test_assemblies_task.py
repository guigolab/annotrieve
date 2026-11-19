from unittest.mock import patch

import pytest

from jobs.assemblies import sync_new_assemblies_from_summary

pytestmark = pytest.mark.unit


class TestAssembliesTask:
    def test_empty_accessions(self):
        with patch(
            "jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences"
        ) as sync:
            result = sync_new_assemblies_from_summary([])
        assert result == {"targets": 0}
        sync.assert_not_called()

    def test_delegates_to_sync(self):
        with patch(
            "jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences",
            return_value={"updated": 2},
        ) as sync:
            result = sync_new_assemblies_from_summary(["GCA_1"], chunk_size=10)
        sync.assert_called_once_with(accessions=["GCA_1"], chunk_size=10)
        assert result == {"updated": 2}


class TestPlaceholderBackfill:
    def test_empty(self):
        from jobs.assemblies import backfill_placeholder_assembly_paths

        with patch("jobs.assemblies.placeholder_assembly_accessions", return_value=[]), patch(
            "jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences"
        ) as sync:
            assert backfill_placeholder_assembly_paths() == {"targets": 0}
        sync.assert_not_called()

    def test_delegates_to_sync(self):
        from jobs.assemblies import backfill_placeholder_assembly_paths

        with patch("jobs.assemblies.placeholder_assembly_accessions", return_value=["GCA_1.1"]), patch(
            "jobs.assemblies.assembly_service.sync_assemblies_ftp_and_sequences",
            return_value={"ok": 1},
        ) as sync:
            assert backfill_placeholder_assembly_paths(chunk_size=5) == {"ok": 1}
        sync.assert_called_once_with(accessions=["GCA_1.1"], chunk_size=5)
