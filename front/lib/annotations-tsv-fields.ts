/**
 * TSV export field definitions for the annotations download dialog.
 * Keep in sync with server/helpers/constants.py (FIELD_TSV_MAP, FIELD_TSV_EXTENDED_MAP, TSV_FIELD_META).
 */

export interface TsvFieldDefinition {
  key: string
  label: string
  isDefault: boolean
}

export interface TsvFieldGroup {
  id: string
  label: string
  fields: TsvFieldDefinition[]
}

const TSV_FIELD_GROUP_LABELS: Record<string, string> = {
  identity: "Identity",
  taxonomy: "Taxonomy",
  source_file: "Source file",
  indexed_file: "Indexed file",
  busco: "BUSCO",
  feature_summary: "Feature summary",
  gene_stats: "Gene statistics",
  deprecated: "Deprecated",
}

const TSV_FIELD_META: Array<{
  key: string
  label: string
  group: string
  isDefault: boolean
}> = [
  { key: "annotation_id", label: "Annotation ID", group: "identity", isDefault: true },
  { key: "assembly_accession", label: "Assembly accession", group: "identity", isDefault: true },
  { key: "assembly_name", label: "Assembly name", group: "identity", isDefault: true },
  { key: "organism_name", label: "Organism name", group: "identity", isDefault: true },
  { key: "taxid", label: "Taxon ID", group: "identity", isDefault: true },
  { key: "database", label: "Database", group: "source_file", isDefault: true },
  { key: "provider", label: "Provider", group: "source_file", isDefault: true },
  { key: "source_url", label: "Source URL", group: "source_file", isDefault: true },
  { key: "bgzip_path", label: "BGZIP path", group: "indexed_file", isDefault: true },
  { key: "csi_path", label: "CSI path", group: "indexed_file", isDefault: true },
  { key: "taxon_lineage", label: "Taxon lineage", group: "taxonomy", isDefault: false },
  { key: "release_date", label: "Release date", group: "source_file", isDefault: false },
  { key: "last_modified", label: "Last modified", group: "source_file", isDefault: false },
  { key: "source_md5", label: "Source MD5", group: "source_file", isDefault: false },
  { key: "source_pipeline_name", label: "Source pipeline name", group: "source_file", isDefault: false },
  { key: "source_pipeline_version", label: "Source pipeline version", group: "source_file", isDefault: false },
  { key: "source_pipeline_method", label: "Source pipeline method", group: "source_file", isDefault: false },
  { key: "file_size", label: "File size", group: "indexed_file", isDefault: false },
  { key: "processed_at", label: "Processed at", group: "indexed_file", isDefault: false },
  { key: "indexed_md5", label: "Indexed MD5", group: "indexed_file", isDefault: false },
  { key: "indexed_pipeline_name", label: "Indexed pipeline name", group: "indexed_file", isDefault: false },
  { key: "indexed_pipeline_version", label: "Indexed pipeline version", group: "indexed_file", isDefault: false },
  { key: "indexed_pipeline_method", label: "Indexed pipeline method", group: "indexed_file", isDefault: false },
  { key: "busco_lineage", label: "BUSCO lineage", group: "busco", isDefault: false },
  { key: "busco_version", label: "BUSCO version", group: "busco", isDefault: false },
  { key: "busco_total_count", label: "BUSCO total count", group: "busco", isDefault: false },
  { key: "busco_complete", label: "BUSCO complete (%)", group: "busco", isDefault: false },
  { key: "busco_single_copy", label: "BUSCO single copy (%)", group: "busco", isDefault: false },
  { key: "busco_duplicated", label: "BUSCO duplicated (%)", group: "busco", isDefault: false },
  { key: "busco_fragmented", label: "BUSCO fragmented (%)", group: "busco", isDefault: false },
  { key: "busco_missing", label: "BUSCO missing (%)", group: "busco", isDefault: false },
  { key: "has_biotype", label: "Has biotype", group: "feature_summary", isDefault: false },
  { key: "has_cds", label: "Has CDS", group: "feature_summary", isDefault: false },
  { key: "has_exon", label: "Has exon", group: "feature_summary", isDefault: false },
  { key: "feature_types", label: "Feature types", group: "feature_summary", isDefault: false },
  { key: "feature_sources", label: "Feature sources", group: "feature_summary", isDefault: false },
  { key: "feature_biotypes", label: "Feature biotypes", group: "feature_summary", isDefault: false },
  { key: "attribute_keys", label: "Attribute keys", group: "feature_summary", isDefault: false },
  { key: "types_missing_id", label: "Types missing ID", group: "feature_summary", isDefault: false },
  { key: "root_type_counts", label: "Root type counts", group: "feature_summary", isDefault: false },
  { key: "coding_gene_count", label: "Coding gene count", group: "gene_stats", isDefault: false },
  { key: "coding_gene_length_mean", label: "Coding gene length mean", group: "gene_stats", isDefault: false },
  { key: "non_coding_gene_count", label: "Non-coding gene count", group: "gene_stats", isDefault: false },
  { key: "non_coding_gene_length_mean", label: "Non-coding gene length mean", group: "gene_stats", isDefault: false },
  { key: "pseudogene_gene_count", label: "Pseudogene count", group: "gene_stats", isDefault: false },
  { key: "pseudogene_gene_length_mean", label: "Pseudogene length mean", group: "gene_stats", isDefault: false },
  { key: "mapped_regions", label: "Mapped regions (deprecated)", group: "deprecated", isDefault: false },
]

function buildFieldGroups(includeDefault: boolean): TsvFieldGroup[] {
  const grouped = new Map<string, TsvFieldDefinition[]>()

  for (const field of TSV_FIELD_META) {
    if (field.isDefault !== includeDefault) continue
    const existing = grouped.get(field.group) ?? []
    existing.push({
      key: field.key,
      label: field.label,
      isDefault: field.isDefault,
    })
    grouped.set(field.group, existing)
  }

  return Array.from(grouped.entries()).map(([id, fields]) => ({
    id,
    label: TSV_FIELD_GROUP_LABELS[id] ?? id,
    fields,
  }))
}

export const TSV_DEFAULT_FIELD_GROUPS = buildFieldGroups(true)
export const TSV_EXTENDED_FIELD_GROUPS = buildFieldGroups(false)

export function getDefaultTsvFields(): TsvFieldDefinition[] {
  return TSV_FIELD_META.filter((field) => field.isDefault).map((field) => ({
    key: field.key,
    label: field.label,
    isDefault: true,
  }))
}

export function getExtendedTsvFields(): TsvFieldDefinition[] {
  return TSV_FIELD_META.filter(
    (field) => !field.isDefault && field.group !== "deprecated"
  ).map((field) => ({
    key: field.key,
    label: field.label,
    isDefault: false,
  }))
}

export function buildSelectedFieldsParam(checkedKeys: Iterable<string>): string | undefined {
  const keys = Array.from(checkedKeys).filter(Boolean)
  return keys.length > 0 ? keys.join(",") : undefined
}
