"""Description-only prose rules."""
from __future__ import annotations

from gene_corpus.stream.prose import finalize_prose, is_bare_uncharacterized_loc


def test_ensembl_keeps_description_as_is() -> None:
    raw = (
        "selenoprotein S [Ensembl NN prediction with score 99.81%] "
        "[Source:HGNC Symbol;Acc:HGNC:11998]"
    )
    encoded = (
        "selenoprotein S [Ensembl NN prediction with score 99.81%] "
        "[Source:HGNC Symbol%3BAcc:HGNC:11998]"
    )
    prose, kind = finalize_prose("ensembl", gene_description=encoded)
    assert prose == raw
    assert kind == "description"


def test_ensembl_empty_description_null() -> None:
    prose, kind = finalize_prose("ensembl", gene_description=None)
    assert prose is None
    assert kind is None


def test_refseq_description_or_null() -> None:
    prose, kind = finalize_prose(
        "refseq", gene_description="selenoprotein S"
    )
    assert prose == "selenoprotein S"
    assert kind == "description"


def test_refseq_bare_uncharacterized_null() -> None:
    assert is_bare_uncharacterized_loc("uncharacterized LOC143119705")
    prose, kind = finalize_prose(
        "refseq",
        gene_description="uncharacterized LOC143119705",
    )
    assert prose is None
    assert kind is None


def test_genbank_description_or_null() -> None:
    prose, kind = finalize_prose(
        "genbank", gene_description="some rare genbank description"
    )
    assert prose == "some rare genbank description"
    assert kind == "description"
    prose, kind = finalize_prose("genbank", gene_description=None)
    assert prose is None
    assert kind is None
