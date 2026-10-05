"""ParseGate / landmark / want_cds tests."""
from __future__ import annotations

from gene_corpus.gating import DNA_LANDMARKS, build_parse_gate
from gene_corpus.namespaces.tiers import include_in_local, include_in_v1


def test_region_case_not_gene_root() -> None:
    gate = build_parse_gate(
        "genbank",
        attribute_keys=["ID", "Name", "Ontology_term"],
        feature_types=["gene", "CDS", "Region"],
        root_type_counts={"gene": 10, "Region": 1},
        has_cds=True,
    )
    assert "region" not in gate.gene_root_types
    assert "gene" in gate.gene_root_types
    assert "cds" in gate.child_feature_types
    assert "region" not in gate.child_feature_types


def test_want_cds_forced_by_go_keys() -> None:
    gate = build_parse_gate(
        "genbank",
        attribute_keys=["ID", "Ontology_term", "go_function"],
        feature_types=["gene", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=False,  # report wrong — GO keys still force CDS walk
    )
    assert gate.want_cds is True


def test_child_types_unknown_when_no_feature_types() -> None:
    gate = build_parse_gate(
        "refseq",
        attribute_keys=["ID", "Dbxref"],
        feature_types=[],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert gate.child_types_unknown is True
    assert gate.child_feature_types == frozenset()


def test_skip_types_include_landmarks() -> None:
    gate = build_parse_gate(
        "ensembl",
        attribute_keys=["ID", "gene_id", "Name"],
        feature_types=["gene", "mRNA", "chromosome"],
        root_type_counts={"gene": 1},
        has_cds=None,
    )
    assert DNA_LANDMARKS <= gate.skip_types
    assert "exon" in gate.skip_types


def test_ensembl_gene_not_live_tier_a() -> None:
    assert include_in_v1("ensembl")
    assert not include_in_v1("ensembl_gene")


def test_include_in_local_excludes_product_and_gff_id() -> None:
    from gene_corpus.namespaces.tiers import TIER_B

    assert include_in_local("symbol")
    assert include_in_local("ncbi_gp")
    assert "product" not in TIER_B
    assert not include_in_local("product")
    assert not include_in_local("gff_id")


def test_parse_gate_exposes_level_keeps() -> None:
    gate = build_parse_gate(
        "refseq",
        attribute_keys=["ID", "Parent", "Name", "transcript_id", "protein_id"],
        feature_types=["gene", "mRNA", "CDS"],
        root_type_counts={"gene": 1},
        has_cds=True,
    )
    assert "Name" in gate.keep_gene
    assert "transcript_id" in gate.keep_transcript
    assert "protein_id" in gate.keep_cds
    assert gate.effective_attr_keys == (
        gate.keep_gene | gate.keep_transcript | gate.keep_cds
    )
