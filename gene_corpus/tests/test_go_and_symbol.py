"""GO normalize + symbol/alias gating tests."""
from __future__ import annotations

from gene_corpus.profiles.genbank import GenBankProfile
from gene_corpus.stream.emit_util import (
    emit_ensembl_description,
    emit_go_values,
    normalize_go_token,
)
from gene_corpus.stream.symbol_gate import alias_ok, symbol_ok


def test_go_prefixed_and_bare_star() -> None:
    assert normalize_go_token("junk GO:0008150") == "GO:0008150"
    assert emit_go_values(
        ["catalytic activity |3824; cofactor binding |48037|"],
        allow_bare=True,
    ) == [("go", "GO:0003824"), ("go", "GO:0048037")]
    assert emit_go_values(["catalytic activity |3824|"]) == []


def test_alias_rejects_id_echo_and_loc() -> None:
    p = GenBankProfile()
    out = p.parse_feature(
        "gene",
        {
            "ID": ["gene-1"],
            "Name": ["LOC7157"],
            "old_locus_tag": ["LOC7157"],
            "gene_synonym": ["gene-1", "p53"],
            "locus_tag": ["ABC_0001"],
        },
    )
    ns_acc = {(ns, acc) for ns, acc, _origin in out}
    assert ("symbol", "loc7157") not in ns_acc
    assert ("alias", "loc7157") not in ns_acc
    assert ("alias", "gene-1") not in ns_acc
    assert ("alias", "p53") in ns_acc


def test_parent_gene_display_xref_gated() -> None:
    hits = emit_ensembl_description(
        "foo [Source:HGNC Symbol;Acc:HGNC:11998] "
        "parent_gene_display_xref=LOC7157"
    )
    assert ("symbol", "loc7157") not in hits
    assert any(ns == "hgnc" for ns, _ in hits)


def test_symbol_ok_basics() -> None:
    assert symbol_ok("TP53")
    assert not symbol_ok("LOC123")
    assert not symbol_ok("gene-1", feature_id="gene-1")


def test_alias_ok_rejects_whitespace() -> None:
    assert alias_ok("TP53")
    assert not alias_ok("Homo sapiens")
    assert not alias_ok("Candida glabrata")
    # symbol_ok still allows spaces; alias_ok does not.
    assert symbol_ok("Homo sapiens")


def test_alias_path_rejects_organism_style() -> None:
    p = GenBankProfile()
    out = p.parse_feature(
        "gene",
        {
            "ID": ["gene-1"],
            "gb-synonym": ["Homo sapiens", "p53"],
            "old-name": ["Candida glabrata"],
        },
    )
    ns_acc = {(ns, acc) for ns, acc, _origin in out}
    assert ("alias", "homo sapiens") not in ns_acc
    assert ("alias", "candida glabrata") not in ns_acc
    assert ("alias", "p53") in ns_acc
