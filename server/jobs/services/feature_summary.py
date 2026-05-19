from typing import Iterable

from db.embedded_documents import FeatureOverview
from helpers import pysam_helper


def _compute_features_summary_from_lines(lines: Iterable[str]) -> FeatureOverview:
    """
    Internal helper that computes the feature summary from an iterable of GFF lines.
    """
    feature_summary = {
        "attribute_keys": set(),
        "types": set(),
        "sources": set(),
        "biotypes": set(),
        "root_type_counts": {},
        "types_missing_id": set(),
        "has_biotype": False,
        "has_cds": False,
        "has_exon": False,
    }

    for line in lines:
        fields = line.split("\t")

        if len(fields) < 9:
            continue

        source = fields[1]
        feature_type = fields[2]
        attributes = fields[8]

        has_id = False
        has_parent = False

        for attr in attributes.split(";"):
            if "=" in attr:
                key, value = attr.split("=", 1)
                if key == "ID":
                    has_id = True
                elif key == "Parent":
                    has_parent = True
                feature_summary["attribute_keys"].add(key)
                if key in ("biotype", "gene_biotype", "transcript_biotype"):
                    feature_summary["biotypes"].add(value)

        if not has_id:
            feature_summary["types_missing_id"].add(feature_type)
        if not has_parent:
            feature_summary["root_type_counts"][feature_type] = (
                feature_summary["root_type_counts"].get(feature_type, 0) + 1
            )

        feature_summary["types"].add(feature_type)
        feature_summary["sources"].add(source)

    if "CDS" in feature_summary["types"]:
        feature_summary["has_cds"] = True
    if "exon" in feature_summary["types"]:
        feature_summary["has_exon"] = True
    if feature_summary["biotypes"]:
        feature_summary["has_biotype"] = True

    feature_summary["attribute_keys"] = list(feature_summary["attribute_keys"])
    feature_summary["types"] = list(feature_summary["types"])
    feature_summary["sources"] = list(feature_summary["sources"])
    feature_summary["biotypes"] = list(feature_summary["biotypes"])
    feature_summary["types_missing_id"] = list(feature_summary["types_missing_id"])
    return FeatureOverview(**feature_summary)


def compute_features_summary(bgzipped_path: str) -> FeatureOverview:
    """Feature overview from a bgzipped, tabix-indexed GFF."""
    return _compute_features_summary_from_lines(
        pysam_helper.stream_tabix_gff_file(bgzipped_path)
    )
