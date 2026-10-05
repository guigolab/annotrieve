"""parse_attributes keep_keys + ParseGate keep_* intersections."""
from __future__ import annotations

from gene_corpus.gating import build_parse_gate
from gene_corpus.stream.attrs import parse_attributes


def test_parse_attributes_keep_skips_omitted_keys() -> None:
    col = "ID=g1;Name=TP53;gbkey=Gene;Alias=junk;description=foo%3Bbar"
    keep = frozenset({"ID", "Name", "description"})
    attrs = parse_attributes(col, keep_keys=keep)
    assert set(attrs) == {"ID", "Name", "description"}
    assert attrs["description"] == ["foo;bar"]
    assert "gbkey" not in attrs
    assert "Alias" not in attrs


def test_parse_attributes_keep_none_keeps_all() -> None:
    col = "ID=g1;Name=TP53;gbkey=Gene"
    attrs = parse_attributes(col, keep_keys=None)
    assert "gbkey" in attrs


def test_ensembl_gate_never_keeps_alias() -> None:
    gate = build_parse_gate(
        "ensembl",
        attribute_keys=[
            "ID",
            "Parent",
            "gene_id",
            "Name",
            "description",
            "Alias",
            "exon_id",
            "biotype",
        ],
        feature_types=["gene", "mRNA", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "Alias" not in gate.keep_gene
    assert "Alias" not in gate.effective_attr_keys
    assert "exon_id" not in gate.effective_attr_keys
    assert "description" in gate.keep_gene
    # protein_id not in file keys → absent from keep_cds
    assert "protein_id" not in gate.keep_cds


def test_genbank_without_go_empties_go_in_keep_cds() -> None:
    gate = build_parse_gate(
        "genbank",
        attribute_keys=["ID", "Parent", "Name", "Dbxref", "protein_id"],
        feature_types=["gene", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "Ontology_term" not in gate.keep_cds
    assert "go_function" not in gate.keep_cds
    assert "protein_id" in gate.keep_cds
    assert "transcript_id" not in gate.effective_attr_keys


def test_genbank_with_go_keeps_ontology_on_cds_only() -> None:
    gate = build_parse_gate(
        "genbank",
        attribute_keys=["ID", "Parent", "Name", "Ontology_term", "go_function"],
        feature_types=["gene", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "Ontology_term" in gate.keep_cds
    assert "Ontology_term" not in gate.keep_gene
    assert gate.want_cds is True


def test_refseq_gene_has_description_never_note_or_product() -> None:
    gate = build_parse_gate(
        "refseq",
        attribute_keys=[
            "ID",
            "Parent",
            "Name",
            "description",
            "Note",
            "product",
            "Dbxref",
            "Ontology_term",
        ],
        feature_types=["gene", "mRNA", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "description" in gate.keep_gene
    assert "Note" not in gate.keep_gene
    assert "Note" not in gate.effective_attr_keys
    assert "product" not in gate.effective_attr_keys
    # Rare Ontology_term only via CDS ∩ file keys
    assert "Ontology_term" in gate.keep_cds
    assert "Ontology_term" not in gate.keep_gene


def test_genbank_keeps_description_and_note_not_product() -> None:
    gate = build_parse_gate(
        "genbank",
        attribute_keys=[
            "ID",
            "Parent",
            "Name",
            "description",
            "Note",
            "product",
            "Dbxref",
            "protein_id",
        ],
        feature_types=["gene", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "description" in gate.keep_gene
    assert "Note" in gate.keep_gene
    assert "Note" in gate.keep_cds
    assert "product" not in gate.effective_attr_keys
