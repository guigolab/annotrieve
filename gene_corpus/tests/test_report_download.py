"""Annotation report POST download filters."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from gene_corpus.catalog.report import (
    API_DB_SOURCES,
    REPORT_SELECTED_FIELDS,
    download_annotation_report,
    load_report_rows,
)


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size: int = -1) -> bytes:
        if size < 0:
            data, self._body = self._body, b""
            return data
        data, self._body = self._body[:size], self._body[size:]
        return data


def test_download_posts_db_sources_and_ids() -> None:
    captured: dict = {}

    def opener(request, timeout=None):
        captured["url"] = request.full_url
        captured["method"] = request.get_method()
        captured["body"] = json.loads(request.data.decode("utf-8"))
        header = (
            "annotation_id\tassembly_accession\torganism_name\ttaxid\t"
            "database\tprovider\tsource_url\tbgzip_path\t"
            "attribute_keys\tfeature_types\thas_cds\troot_type_counts\n"
        )
        row = (
            "abc\tGCA_1\tOrg\t1\tGenBank\t\t\t/x.gff.gz\t"
            "ID;Parent\tgene\ttrue\t{}\n"
        )
        return _FakeResponse((header + row).encode("utf-8"))

    with tempfile.TemporaryDirectory() as d:
        dest = Path(d) / "r.tsv"
        download_annotation_report(
            "https://example.test/api/v0",
            dest,
            annotation_ids=["abc", "def"],
            opener=opener,
        )
        assert captured["method"] == "POST"
        assert captured["url"].endswith("/annotations/report")
        assert captured["body"]["selected_fields"] == REPORT_SELECTED_FIELDS
        assert captured["body"]["db_sources"] == list(API_DB_SOURCES)
        assert captured["body"]["md5_checksums"] == ["abc", "def"]
        assert dest.is_file()


def test_download_without_ids_still_sends_db_sources() -> None:
    captured: dict = {}

    def opener(request, timeout=None):
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return _FakeResponse(
            b"annotation_id\tdatabase\ttaxid\tassembly_accession\t"
            b"organism_name\tprovider\tsource_url\tbgzip_path\n"
        )

    with tempfile.TemporaryDirectory() as d:
        download_annotation_report(
            "https://example.test/api/v0",
            Path(d) / "r.tsv",
            opener=opener,
        )
        assert "md5_checksums" not in captured["body"]
        assert captured["body"]["db_sources"] == list(API_DB_SOURCES)


def test_load_report_local_filters_ids() -> None:
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "r.tsv"
        path.write_text(
            "annotation_id\tassembly_accession\torganism_name\ttaxid\t"
            "database\tprovider\tsource_url\tbgzip_path\t"
            "attribute_keys\tfeature_types\thas_cds\troot_type_counts\n"
            "keep\tGCA\tO\t1\tGenBank\t\t\t/a.gff\tID\tgene\ttrue\t{}\n"
            "drop\tGCA\tO\t1\tGenBank\t\t\t/b.gff\tID\tgene\ttrue\t{}\n"
            "other\tGCA\tO\t1\tTOGA2\t\t\t/c.gff\tID\tgene\ttrue\t{}\n",
            encoding="utf-8",
        )
        rows = load_report_rows(report=path, annotation_ids=["keep", "other"])
        assert [r.annotation_id for r in rows] == ["keep"]
