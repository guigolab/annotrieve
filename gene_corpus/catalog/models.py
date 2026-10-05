"""Annotation job + parse-gate models for gene_corpus dry-run catalog."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class ParseGate:
    """Per-file gate derived from report metadata (no GFF open)."""

    effective_attr_keys: frozenset[str]
    keep_gene: frozenset[str]
    keep_transcript: frozenset[str]
    keep_cds: frozenset[str]
    gene_root_types: frozenset[str]
    feature_types: frozenset[str]
    child_feature_types: frozenset[str]
    skip_types: frozenset[str]
    want_cds: bool
    file_keys_unknown: bool
    roots_unknown: bool
    child_types_unknown: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "effective_attr_keys": sorted(self.effective_attr_keys),
            "keep_gene": sorted(self.keep_gene),
            "keep_transcript": sorted(self.keep_transcript),
            "keep_cds": sorted(self.keep_cds),
            "gene_root_types": sorted(self.gene_root_types),
            "feature_types": sorted(self.feature_types),
            "child_feature_types": sorted(self.child_feature_types),
            "skip_types": sorted(self.skip_types),
            "want_cds": self.want_cds,
            "file_keys_unknown": self.file_keys_unknown,
            "roots_unknown": self.roots_unknown,
            "child_types_unknown": self.child_types_unknown,
        }


@dataclass
class AnnotationJob:
    """One annotation ready for a later GFF parse plan."""

    annotation_id: str
    database: str
    profile_id: str
    taxid: int
    assembly_accession: str
    provider: str | None
    attribute_keys: list[str]
    feature_types: list[str]
    root_type_counts: dict[str, int] | None
    has_cds: bool | None
    bgzip_path: str
    source_url: str
    gff_mode: str
    resolved_path: str | None = None
    resolved_url: str | None = None
    gate: ParseGate | None = None
    # Populated while scanning the report (before resolve/gate).
    organism_name: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        if self.gate is not None:
            data["gate"] = self.gate.to_dict()
        return data
