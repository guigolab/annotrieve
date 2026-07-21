import unittest

from helpers import parameters as parameters_helper
from helpers import annotation as annotation_helper


class SplitStringParamTests(unittest.TestCase):
    def test_simple_multi(self):
        self.assertEqual(
            parameters_helper.split_string_param("NCBI,Ensembl"),
            ["NCBI", "Ensembl"],
        )

    def test_spaces_after_commas(self):
        self.assertEqual(
            parameters_helper.split_string_param("NCBI, Ensembl"),
            ["NCBI", "Ensembl"],
        )

    def test_quoted_comma_value(self):
        self.assertEqual(
            parameters_helper.split_string_param(
                '"Hiller Lab, Senckenberg Research Institute"'
            ),
            ["Hiller Lab, Senckenberg Research Institute"],
        )

    def test_mixed_quoted_and_unquoted(self):
        self.assertEqual(
            parameters_helper.split_string_param(
                '"Hiller Lab, Senckenberg Research Institute",NCBI'
            ),
            ["Hiller Lab, Senckenberg Research Institute", "NCBI"],
        )

    def test_slash_no_comma(self):
        self.assertEqual(
            parameters_helper.split_string_param("HHMI/UCSF"),
            ["HHMI/UCSF"],
        )

    def test_quoted_value_with_slash_and_comma(self):
        self.assertEqual(
            parameters_helper.split_string_param('"INRA/CNRS, France"'),
            ["INRA/CNRS, France"],
        )

    def test_embedded_quotes(self):
        self.assertEqual(
            parameters_helper.split_string_param('"Foo ""Bar"", Baz"'),
            ['Foo "Bar", Baz'],
        )

    def test_empty_string(self):
        self.assertEqual(parameters_helper.split_string_param(""), [])

    def test_list_passthrough(self):
        values = ["A, B", "C"]
        self.assertEqual(parameters_helper.split_string_param(values), values)


class NormalizeToListTests(unittest.TestCase):
    def test_none(self):
        self.assertEqual(parameters_helper.normalize_to_list(None), [])

    def test_empty_string(self):
        self.assertEqual(parameters_helper.normalize_to_list(""), [])

    def test_simple_multi(self):
        self.assertEqual(
            parameters_helper.normalize_to_list("NCBI,Ensembl"),
            ["NCBI", "Ensembl"],
        )

    def test_spaces_after_commas(self):
        self.assertEqual(
            parameters_helper.normalize_to_list("NCBI, Ensembl"),
            ["NCBI", "Ensembl"],
        )

    def test_quoted_comma_value(self):
        self.assertEqual(
            parameters_helper.normalize_to_list(
                '"Hiller Lab, Senckenberg Research Institute"'
            ),
            ["Hiller Lab, Senckenberg Research Institute"],
        )

    def test_mixed_quoted_and_unquoted(self):
        self.assertEqual(
            parameters_helper.normalize_to_list(
                '"Hiller Lab, Senckenberg Research Institute",NCBI'
            ),
            ["Hiller Lab, Senckenberg Research Institute", "NCBI"],
        )

    def test_slash_no_comma(self):
        self.assertEqual(
            parameters_helper.normalize_to_list("HHMI/UCSF"),
            ["HHMI/UCSF"],
        )

    def test_quoted_value_with_slash_and_comma(self):
        self.assertEqual(
            parameters_helper.normalize_to_list('"INRA/CNRS, France"'),
            ["INRA/CNRS, France"],
        )

    def test_embedded_quotes(self):
        self.assertEqual(
            parameters_helper.normalize_to_list('"Foo ""Bar"", Baz"'),
            ['Foo "Bar", Baz'],
        )

    def test_list_passthrough_no_resplit(self):
        self.assertEqual(
            parameters_helper.normalize_to_list(["A, B", "C"]),
            ["A, B", "C"],
        )

    def test_dedup(self):
        self.assertEqual(parameters_helper.normalize_to_list("A,A"), ["A"])

    def test_trims_and_drops_empty(self):
        self.assertEqual(
            parameters_helper.normalize_to_list(" A , ,B "),
            ["A", "B"],
        )


class ProvidersMongoQueryTests(unittest.TestCase):
    def test_quoted_provider_not_split_in_query(self):
        provider = "Hiller Lab, Senckenberg Research Institute"
        query = annotation_helper.query_params_to_mongoengine_query(
            providers=f'"{provider}"'
        )
        self.assertEqual(
            query.get("source_file_info__provider__in"),
            [provider],
        )

    def test_unquoted_multi_providers(self):
        query = annotation_helper.query_params_to_mongoengine_query(
            providers="NCBI,Ensembl"
        )
        self.assertEqual(
            query.get("source_file_info__provider__in"),
            ["NCBI", "Ensembl"],
        )

    def test_slash_provider(self):
        query = annotation_helper.query_params_to_mongoengine_query(
            providers="HHMI/UCSF"
        )
        self.assertEqual(
            query.get("source_file_info__provider__in"),
            ["HHMI/UCSF"],
        )


if __name__ == "__main__":
    unittest.main()
