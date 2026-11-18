"""Regression tests for the minor findings of the import_annotations audit."""

import ast
import importlib
import inspect
import os
import statistics
from unittest.mock import MagicMock, patch

import pytest

from jobs.services import annotation as ann_svc
from jobs.services import feature_summary as summary_svc
from jobs.services import stats as stats_svc
from jobs.services.classes import AnnotationToProcess
from tests.unit.jobs.test_taxon_stats_memory import _annotation, mongo  # noqa: F401  (fixture)
from tests.integration.factories import make_taxon

imp = importlib.import_module("jobs.import_annotations")

pytestmark = pytest.mark.unit


def _row(**kw) -> AnnotationToProcess:
    d = dict(source_database="Ensembl", md5_checksum="abc", taxon_id="9606", assembly_accession="GCA_1",
             access_url="https://example.com/a.gff.gz", organism_name="x", last_modified_date="2024-01-03",
             release_date="2024-01-02")
    d.update(kw)
    return AnnotationToProcess(**d)


class TestPathFieldValidation:
    @pytest.mark.parametrize("field", ["taxon_id", "assembly_accession", "source_database", "md5_checksum"])
    @pytest.mark.parametrize("bad", [".", "..", "../x", "a/b", "a\\b", "x\x00y", "/abs"])
    def test_unsafe_values_are_rejected(self, field, bad):
        with pytest.raises(ValueError):
            ann_svc.validate_path_fields(_row(**{field: bad}))

    @pytest.mark.parametrize("field", ["taxon_id", "assembly_accession", "md5_checksum"])
    @pytest.mark.parametrize("bad", [None, "", "  "])
    def test_missing_key_fields_are_rejected(self, field, bad):
        with pytest.raises(ValueError):
            ann_svc.validate_path_fields(_row(**{field: bad}))

    @pytest.mark.parametrize("blank", [None, "", "  "])
    def test_blank_source_database_is_still_accepted_as_before(self, blank):
        # it only prefixes the file name; rejecting it would drop rows that used to import
        ann_svc.validate_path_fields(_row(source_database=blank))

    @pytest.mark.parametrize("ok", ["9606", "GCA_000001405.29", "Ensembl", "a-b_c.d", "0123456789abcdef0123456789abcdef"])
    def test_ordinary_values_pass(self, ok):
        ann_svc.validate_path_fields(_row(taxon_id=ok, assembly_accession=ok, source_database=ok, md5_checksum=ok))

    def test_init_paths_refuses_unsafe_input_and_creates_nothing(self, tmp_path):
        with pytest.raises(ValueError):
            ann_svc.init_annotation_file_paths(str(tmp_path), _row(assembly_accession="../../escape"))
        assert os.listdir(tmp_path) == []

    def test_init_paths_returns_a_pair_and_says_so(self, tmp_path):
        full, rel = ann_svc.init_annotation_file_paths(str(tmp_path), _row())
        assert full == f"{tmp_path}/9606/GCA_1/Ensembl_abc.gff.gz"
        assert rel == "/9606/GCA_1/Ensembl_abc.gff.gz"
        assert "tuple[str, str]" in str(inspect.signature(ann_svc.init_annotation_file_paths).return_annotation)

    def test_pipeline_never_touches_directories_outside_the_work_dir(self, tmp_path, monkeypatch):
        work = tmp_path / "work"
        work.mkdir()
        sentinel = tmp_path / "sentinel"
        sentinel.mkdir()
        (sentinel / "keep.txt").write_text("precious")
        monkeypatch.setattr(imp, "ANNOTATIONS_PATH", str(tmp_path / "ann"))
        evil = _row(md5_checksum="../sentinel")
        with (
            patch.object(imp.annotation_service, "process_annotation_file") as process,
            patch.object(imp.annotation_service, "handle_annotation_error") as handle_err,
        ):
            assert imp.process_annotations_pipeline([evil], {}, set(), work_dir=str(work)) == []
        process.assert_not_called()
        handle_err.assert_called_once()
        assert "Unsafe md5_checksum" in handle_err.call_args[0][1]
        assert (sentinel / "keep.txt").read_text() == "precious"


class TestLastModifiedDate:
    @pytest.mark.parametrize("header,expected", [
        ("Wed, 03 Jan 2024 00:00:00 GMT", "2024-01-03"),
        ("Wed, 03 Jan 2024 23:59:59 GMT", "2024-01-03"),
        ("Wed, 03 Jan 2024 00:00:00 UTC", "2024-01-03"),
    ])
    def test_parses_http_dates(self, header, expected):
        assert ann_svc.get_last_modified_date({"Last-Modified": header}) == expected

    @pytest.mark.parametrize("header,expected", [
        ("Wed, 03 Jan 2024 01:00:00 +0200", "2024-01-02"),  # converted to UTC
        ("Wed, 03 Jan 2024 00:00:00 +0000", "2024-01-03"),
    ])
    def test_numeric_offsets_are_converted_to_utc(self, header, expected):
        assert ann_svc.get_last_modified_date({"Last-Modified": header}) == expected

    @pytest.mark.parametrize("headers", [{}, {"Last-Modified": ""}, {"Last-Modified": "yesterday-ish"}, {"Last-Modified": None}])
    def test_missing_or_garbage_gives_none(self, headers):
        assert ann_svc.get_last_modified_date(headers) is None


class TestDistributionStats:
    def test_std_uses_the_exact_mean(self):
        values = [5, 13, 6, 10, 14, 0, 15, 3, 26, 20, 12]  # the rounded-mean formula gives a different std here
        result = stats_svc.compute_distribution_stats(values)
        assert result.std == round(statistics.pstdev(values), 2)
        assert result.mean == round(statistics.mean(values), 2)

    def test_matches_statistics_module_on_random_data(self):
        import random

        rnd = random.Random(7)
        for _ in range(500):
            values = [rnd.randint(0, 40) for _ in range(rnd.randint(1, 15))]
            r = stats_svc.compute_distribution_stats(values)
            assert r.std == round(statistics.pstdev(values), 2)
            assert r.median == round(statistics.median(values), 2)
            assert (r.min, r.max, r.n) == (min(values), max(values), len(values))

    def test_empty(self):
        assert stats_svc.compute_distribution_stats([]).n == 0


class TestLncRnaMerge:
    def test_both_spellings_in_one_annotation_are_summed(self, mongo):  # noqa: F811
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", transcripts={"lnc_RNA": 10, "lncRNA": 5})
        _annotation("2" * 32, "9607", transcripts={"lncRNA": 7})
        make_taxon(taxid="9605", scientific_name="g")
        stats_svc.update_taxon_gene_and_transcript_stats()
        lnc = TaxonNode.objects.get(taxid="9605").stats.transcripts.lncRNA.count
        assert lnc.n == 2 and lnc.mean == 11 and lnc.min == 7 and lnc.max == 15

    def test_one_spelling_per_annotation_is_unchanged(self, mongo):  # noqa: F811
        from db.models import TaxonNode

        _annotation("1" * 32, "9606", transcripts={"lnc_RNA": 10})
        _annotation("2" * 32, "9607", transcripts={"lncRNA": 7})
        make_taxon(taxid="9605", scientific_name="g")
        stats_svc.update_taxon_gene_and_transcript_stats()
        lnc = TaxonNode.objects.get(taxid="9605").stats.transcripts.lncRNA.count
        assert lnc.n == 2 and lnc.mean == 8.5 and lnc.min == 7 and lnc.max == 10


class TestSummaryKeyNormalisation:
    def test_keys_and_values_are_stripped_like_feature_stats(self):
        lines = ["c\ts\tgene\t1\t2\t.\t+\t.\tID=g1; biotype = protein_coding ;Name=x"]
        summary = summary_svc._compute_features_summary_from_lines(lines)
        assert sorted(summary.attribute_keys) == ["ID", "Name", "biotype"]
        assert summary.biotypes == ["protein_coding"]
        assert summary.types_missing_id == []


class TestEarlyExitsRefreshWhenTaxonomyChanged:
    def test_refresh_runs_only_when_taxon_nodes_were_added(self):
        for before, after, runs in [(5, 6, True), (5, 5, False), (None, 6, False), (5, None, False)]:
            with (
                patch.object(imp, "_taxon_node_count", return_value=after),
                patch.object(imp.stats_service, "update_db_stats") as stats,
                patch("jobs.taxonomy.export_flattened_taxonomy.delay") as export,
            ):
                imp._refresh_if_taxonomy_changed(before)
            assert stats.called is runs and export.called is runs, (before, after)

    @pytest.mark.parametrize("assembly_stage", [False, True])
    def test_both_early_exits_refresh_after_new_taxa(self, assembly_stage):
        from contextlib import ExitStack

        row = _row()
        valid = ["GCA_1"] if assembly_stage else []
        filter_results = [[row], []] if assembly_stage else [[]]
        with ExitStack() as es:
            es.enter_context(patch.object(imp, "DEV", True))
            es.enter_context(patch.object(imp.annotation_service, "fetch_from_url", return_value=[row]))
            es.enter_context(patch.object(imp.annotation_service, "filter_annotations_by_md5_checksum_and_url_path", side_effect=lambda xs: xs))
            es.enter_context(patch.object(imp.taxonomy_service, "handle_taxonomy", return_value={"9606": ["9606"]}))
            es.enter_context(patch.object(imp.annotation_service, "filter_annotations_dict_by_field", side_effect=filter_results))
            es.enter_context(patch.object(imp.assembly_service, "handle_assemblies", return_value=(valid, [])))
            es.enter_context(patch.object(imp.annotation_service, "handle_annotation_error"))
            es.enter_context(patch.object(imp, "_taxon_node_count", side_effect=[10, 12]))
            stats = es.enter_context(patch.object(imp.stats_service, "update_db_stats"))
            export = es.enter_context(patch("jobs.taxonomy.export_flattened_taxonomy.delay"))
            imp._run_import("/tmp")
        stats.assert_called_once()
        export.assert_called_once()


class TestTimeLimitsAndLogging:
    @pytest.mark.parametrize("value,expected", [("30", 30), (" 7200 ", 7200), ("", None), ("0", None), ("abc", None), ("-5", None)])
    def test_limits_are_opt_in_integers(self, monkeypatch, value, expected):
        monkeypatch.setenv("SOME_LIMIT", value)
        assert imp._int_env("SOME_LIMIT") == expected

    def test_task_picks_up_the_configured_limits(self, monkeypatch):
        monkeypatch.setenv("IMPORT_ANNOTATIONS_SOFT_TIME_LIMIT", "3000")
        monkeypatch.setenv("IMPORT_ANNOTATIONS_TIME_LIMIT", "3600")
        captured = {}

        def fake_shared_task(*args, **kwargs):
            captured.update(kwargs)
            return lambda func: func

        try:
            with patch("celery.shared_task", fake_shared_task):
                importlib.reload(imp)  # celery caches tasks by name, so inspect the decorator call
        finally:
            monkeypatch.delenv("IMPORT_ANNOTATIONS_SOFT_TIME_LIMIT")
            monkeypatch.delenv("IMPORT_ANNOTATIONS_TIME_LIMIT")
            importlib.reload(imp)
        assert captured["soft_time_limit"] == 3000 and captured["time_limit"] == 3600
        assert captured["name"] == "import_annotations"

    def test_limits_default_to_unset(self):
        captured = {}
        with patch("celery.shared_task", lambda *a, **k: (captured.update(k), (lambda f: f))[1]):
            importlib.reload(imp)
        importlib.reload(imp)
        assert captured["soft_time_limit"] is None and captured["time_limit"] is None

    @pytest.mark.parametrize("module", [imp, ann_svc])
    def test_modules_log_instead_of_printing(self, module):
        tree = ast.parse(inspect.getsource(module))
        prints = [n.lineno for n in ast.walk(tree)
                  if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "print"]
        assert prints == []

    def test_failures_are_logged_as_warnings(self, caplog):
        with patch.object(ann_svc, "AnnotationError") as AE:
            AE.objects.side_effect = RuntimeError("db down")
            with caplog.at_level("INFO", logger=ann_svc.logger.name):
                ann_svc.handle_annotation_error(_row(), "boom")
        assert any(r.levelname == "WARNING" and "Failed to look up" in r.getMessage() for r in caplog.records)


class TestRemovedDeadCode:
    def test_unused_and_broken_helpers_are_gone_but_live_ones_remain(self):
        for name in ("fetch_annotations", "bgzip_gff_file", "tabix_gff_file", "get_sources_and_types"):
            assert not hasattr(ann_svc, name), name
        assert not hasattr(stats_svc, "_extract_transcript_counts")
        for name in ("sort_gff_file", "fetch_from_url", "process_annotation_file", "download_gff_file"):
            assert callable(getattr(ann_svc, name)), name
