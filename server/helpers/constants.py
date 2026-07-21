from typing import TypedDict


class TsvFieldMeta(TypedDict):
    key: str
    label: str
    group: str
    is_default: bool


# Frozen production default — do not remove, reorder, or rename keys.
FIELD_TSV_MAP: dict[str, str] = {
    "annotation_id": "annotation_id",
    "assembly_accession": "assembly_accession",
    "assembly_name": "assembly_name",
    "organism_name": "organism_name",
    "taxid": "taxid",
    "database": "source_file_info__database",
    "provider": "source_file_info__provider",
    "source_url": "source_file_info__url_path",
    "bgzip_path": "indexed_file_info__bgzipped_path",
    "csi_path": "indexed_file_info__csi_path",
}

FIELD_TSV_EXTENDED_MAP: dict[str, str] = {
    # Taxonomy
    "taxon_lineage": "taxon_lineage",
    # Source file
    "release_date": "source_file_info__release_date",
    "last_modified": "source_file_info__last_modified",
    "source_md5": "source_file_info__uncompressed_md5",
    "source_pipeline_name": "source_file_info__pipeline__name",
    "source_pipeline_version": "source_file_info__pipeline__version",
    "source_pipeline_method": "source_file_info__pipeline__method",
    # Indexed file
    "file_size": "indexed_file_info__file_size",
    "processed_at": "indexed_file_info__processed_at",
    "indexed_md5": "indexed_file_info__uncompressed_md5",
    "indexed_pipeline_name": "indexed_file_info__pipeline__name",
    "indexed_pipeline_version": "indexed_file_info__pipeline__version",
    "indexed_pipeline_method": "indexed_file_info__pipeline__method",
    # BUSCO
    "busco_lineage": "busco__busco_lineage",
    "busco_version": "busco__busco_version",
    "busco_total_count": "busco__total_count",
    "busco_complete": "busco__complete",
    "busco_single_copy": "busco__single_copy",
    "busco_duplicated": "busco__duplicated",
    "busco_fragmented": "busco__fragmented",
    "busco_missing": "busco__missing",
    # Feature summary
    "has_biotype": "features_summary__has_biotype",
    "has_cds": "features_summary__has_cds",
    "has_exon": "features_summary__has_exon",
    "feature_types": "features_summary__types",
    "feature_sources": "features_summary__sources",
    "feature_biotypes": "features_summary__biotypes",
    "attribute_keys": "features_summary__attribute_keys",
    "types_missing_id": "features_summary__types_missing_id",
    "root_type_counts": "features_summary__root_type_counts",
    # Gene stats (fixed categories)
    "coding_gene_count": "features_statistics__gene_category_stats__coding__total_count",
    "coding_gene_length_mean": "features_statistics__gene_category_stats__coding__length_stats__mean",
    "non_coding_gene_count": "features_statistics__gene_category_stats__non_coding__total_count",
    "non_coding_gene_length_mean": "features_statistics__gene_category_stats__non_coding__length_stats__mean",
    "pseudogene_gene_count": "features_statistics__gene_category_stats__pseudogene__total_count",
    "pseudogene_gene_length_mean": "features_statistics__gene_category_stats__pseudogene__length_stats__mean",
    # Deprecated
    "mapped_regions": "mapped_regions",
}

FIELD_TSV_ALL_MAP: dict[str, str] = {
    **FIELD_TSV_MAP,
    **FIELD_TSV_EXTENDED_MAP,
}

TSV_FIELD_META: list[TsvFieldMeta] = [
    {"key": "annotation_id", "label": "Annotation ID", "group": "identity", "is_default": True},
    {"key": "assembly_accession", "label": "Assembly accession", "group": "identity", "is_default": True},
    {"key": "assembly_name", "label": "Assembly name", "group": "identity", "is_default": True},
    {"key": "organism_name", "label": "Organism name", "group": "identity", "is_default": True},
    {"key": "taxid", "label": "Taxon ID", "group": "identity", "is_default": True},
    {"key": "database", "label": "Database", "group": "source_file", "is_default": True},
    {"key": "provider", "label": "Provider", "group": "source_file", "is_default": True},
    {"key": "source_url", "label": "Source URL", "group": "source_file", "is_default": True},
    {"key": "bgzip_path", "label": "BGZIP path", "group": "indexed_file", "is_default": True},
    {"key": "csi_path", "label": "CSI path", "group": "indexed_file", "is_default": True},
    {"key": "taxon_lineage", "label": "Taxon lineage", "group": "taxonomy", "is_default": False},
    {"key": "release_date", "label": "Release date", "group": "source_file", "is_default": False},
    {"key": "last_modified", "label": "Last modified", "group": "source_file", "is_default": False},
    {"key": "source_md5", "label": "Source MD5", "group": "source_file", "is_default": False},
    {"key": "source_pipeline_name", "label": "Source pipeline name", "group": "source_file", "is_default": False},
    {"key": "source_pipeline_version", "label": "Source pipeline version", "group": "source_file", "is_default": False},
    {"key": "source_pipeline_method", "label": "Source pipeline method", "group": "source_file", "is_default": False},
    {"key": "file_size", "label": "File size", "group": "indexed_file", "is_default": False},
    {"key": "processed_at", "label": "Processed at", "group": "indexed_file", "is_default": False},
    {"key": "indexed_md5", "label": "Indexed MD5", "group": "indexed_file", "is_default": False},
    {"key": "indexed_pipeline_name", "label": "Indexed pipeline name", "group": "indexed_file", "is_default": False},
    {"key": "indexed_pipeline_version", "label": "Indexed pipeline version", "group": "indexed_file", "is_default": False},
    {"key": "indexed_pipeline_method", "label": "Indexed pipeline method", "group": "indexed_file", "is_default": False},
    {"key": "busco_lineage", "label": "BUSCO lineage", "group": "busco", "is_default": False},
    {"key": "busco_version", "label": "BUSCO version", "group": "busco", "is_default": False},
    {"key": "busco_total_count", "label": "BUSCO total count", "group": "busco", "is_default": False},
    {"key": "busco_complete", "label": "BUSCO complete (%)", "group": "busco", "is_default": False},
    {"key": "busco_single_copy", "label": "BUSCO single copy (%)", "group": "busco", "is_default": False},
    {"key": "busco_duplicated", "label": "BUSCO duplicated (%)", "group": "busco", "is_default": False},
    {"key": "busco_fragmented", "label": "BUSCO fragmented (%)", "group": "busco", "is_default": False},
    {"key": "busco_missing", "label": "BUSCO missing (%)", "group": "busco", "is_default": False},
    {"key": "has_biotype", "label": "Has biotype", "group": "feature_summary", "is_default": False},
    {"key": "has_cds", "label": "Has CDS", "group": "feature_summary", "is_default": False},
    {"key": "has_exon", "label": "Has exon", "group": "feature_summary", "is_default": False},
    {"key": "feature_types", "label": "Feature types", "group": "feature_summary", "is_default": False},
    {"key": "feature_sources", "label": "Feature sources", "group": "feature_summary", "is_default": False},
    {"key": "feature_biotypes", "label": "Feature biotypes", "group": "feature_summary", "is_default": False},
    {"key": "attribute_keys", "label": "Attribute keys", "group": "feature_summary", "is_default": False},
    {"key": "types_missing_id", "label": "Types missing ID", "group": "feature_summary", "is_default": False},
    {"key": "root_type_counts", "label": "Root type counts", "group": "feature_summary", "is_default": False},
    {"key": "coding_gene_count", "label": "Coding gene count", "group": "gene_stats", "is_default": False},
    {"key": "coding_gene_length_mean", "label": "Coding gene length mean", "group": "gene_stats", "is_default": False},
    {"key": "non_coding_gene_count", "label": "Non-coding gene count", "group": "gene_stats", "is_default": False},
    {"key": "non_coding_gene_length_mean", "label": "Non-coding gene length mean", "group": "gene_stats", "is_default": False},
    {"key": "pseudogene_gene_count", "label": "Pseudogene count", "group": "gene_stats", "is_default": False},
    {"key": "pseudogene_gene_length_mean", "label": "Pseudogene length mean", "group": "gene_stats", "is_default": False},
    {"key": "mapped_regions", "label": "Mapped regions (deprecated)", "group": "deprecated", "is_default": False},
]

TSV_FIELD_GROUP_LABELS: dict[str, str] = {
    "identity": "Identity",
    "taxonomy": "Taxonomy",
    "source_file": "Source file",
    "indexed_file": "Indexed file",
    "busco": "BUSCO",
    "feature_summary": "Feature summary",
    "gene_stats": "Gene statistics",
    "deprecated": "Deprecated",
}

NO_VALUE_KEY = "no_value"
