import json
import unittest
from datetime import date, datetime

from fastapi import HTTPException

from helpers import constants as constants_helper
from helpers import tsv_fields as tsv_fields_helper


class ResolveTsvFieldMapTests(unittest.TestCase):
    def test_none_returns_frozen_default_map(self):
        result = tsv_fields_helper.resolve_tsv_field_map(None)
        self.assertEqual(result, constants_helper.FIELD_TSV_MAP)
        self.assertEqual(list(result.keys()), list(constants_helper.FIELD_TSV_MAP.keys()))

    def test_empty_string_returns_default_map(self):
        result = tsv_fields_helper.resolve_tsv_field_map("")
        self.assertEqual(result, constants_helper.FIELD_TSV_MAP)

    def test_appends_extended_fields_in_definition_order(self):
        result = tsv_fields_helper.resolve_tsv_field_map("busco_complete,taxon_lineage")
        default_keys = list(constants_helper.FIELD_TSV_MAP.keys())
        self.assertEqual(list(result.keys())[: len(default_keys)], default_keys)
        self.assertIn("taxon_lineage", result)
        self.assertIn("busco_complete", result)
        taxon_index = list(result.keys()).index("taxon_lineage")
        busco_index = list(result.keys()).index("busco_complete")
        self.assertLess(taxon_index, busco_index)

    def test_rejects_unknown_field(self):
        with self.assertRaises(HTTPException) as ctx:
            tsv_fields_helper.resolve_tsv_field_map("not_a_real_field")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_rejects_default_field_in_selected_fields(self):
        with self.assertRaises(HTTPException) as ctx:
            tsv_fields_helper.resolve_tsv_field_map("annotation_id,release_date")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("annotation_id", ctx.exception.detail)

    def test_ignores_duplicate_tokens(self):
        result = tsv_fields_helper.resolve_tsv_field_map("release_date,release_date")
        self.assertEqual(list(result.keys()).count("release_date"), 1)


class DigMongoValueTests(unittest.TestCase):
    def test_top_level_present(self):
        self.assertEqual(
            tsv_fields_helper.dig_mongo_value({"annotation_id": "abc"}, "annotation_id"),
            "abc",
        )

    def test_top_level_missing(self):
        self.assertIsNone(tsv_fields_helper.dig_mongo_value({}, "annotation_id"))

    def test_nested_missing_middle_key(self):
        doc = {"source_file_info": {"database": "GenBank"}}
        self.assertIsNone(
            tsv_fields_helper.dig_mongo_value(doc, "source_file_info__pipeline__name")
        )

    def test_nested_none_middle(self):
        doc = {"source_file_info": {"pipeline": None}}
        self.assertIsNone(
            tsv_fields_helper.dig_mongo_value(doc, "source_file_info__pipeline__name")
        )

    def test_nested_fully_present(self):
        doc = {"source_file_info": {"pipeline": {"name": "BRAKER3"}}}
        self.assertEqual(
            tsv_fields_helper.dig_mongo_value(doc, "source_file_info__pipeline__name"),
            "BRAKER3",
        )

    def test_list_and_dict_leaves_pass_through(self):
        doc = {
            "taxon_lineage": ["9606", "9605"],
            "features_summary": {"root_type_counts": {"gene": 3}},
        }
        self.assertEqual(
            tsv_fields_helper.dig_mongo_value(doc, "taxon_lineage"),
            ["9606", "9605"],
        )
        self.assertEqual(
            tsv_fields_helper.dig_mongo_value(
                doc, "features_summary__root_type_counts"
            ),
            {"gene": 3},
        )


class FormatTsvCellTests(unittest.TestCase):
    def test_default_path_matches_str_behavior(self):
        self.assertEqual(tsv_fields_helper.format_tsv_cell(None), "")
        self.assertEqual(tsv_fields_helper.format_tsv_cell("value"), "value")
        self.assertEqual(tsv_fields_helper.format_tsv_cell(42), "42")

    def test_extended_path_formats_complex_values(self):
        self.assertEqual(tsv_fields_helper.format_tsv_cell(True, extended=True), "true")
        self.assertEqual(tsv_fields_helper.format_tsv_cell(False, extended=True), "false")
        self.assertEqual(
            tsv_fields_helper.format_tsv_cell(["gene", "exon"], extended=True),
            "gene;exon",
        )
        self.assertEqual(
            tsv_fields_helper.format_tsv_cell({"gene": 3}, extended=True),
            json.dumps({"gene": 3}, separators=(",", ":")),
        )
        dt = datetime(2024, 5, 1, 12, 30, 0)
        self.assertEqual(tsv_fields_helper.format_tsv_cell(dt, extended=True), dt.isoformat())
        self.assertEqual(
            tsv_fields_helper.format_tsv_cell(date(2024, 5, 1), extended=True),
            "2024-05-01",
        )
        self.assertEqual(tsv_fields_helper.format_tsv_cell(None, extended=True), "")


if __name__ == "__main__":
    unittest.main()
