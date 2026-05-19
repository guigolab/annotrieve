import type { AnnotationBase } from "@/lib/types"

export type AnalyticsEntityType = "genes" | "transcripts" | "busco"

const GENE_CATEGORY_ALIASES: Record<string, string[]> = {
  coding: ["coding", "coding_genes"],
  non_coding: ["non_coding", "non_coding_genes"],
  pseudogene: ["pseudogene", "pseudogenes"],
}

const GENE_METRIC_PATHS: Record<string, (dbCategory: string) => string> = {
  total_count: (c) => `features_statistics.gene_category_stats.${c}.total_count`,
  average_mean_length: (c) =>
    `features_statistics.gene_category_stats.${c}.length_stats.mean`,
}

const TRANSCRIPT_METRIC_PATHS: Record<string, (type: string) => string> = {
  total_count: (t) => `features_statistics.transcript_type_stats.${t}.total_count`,
  average_mean_length: (t) =>
    `features_statistics.transcript_type_stats.${t}.length_stats.mean`,
  associated_genes_total_count: (t) =>
    `features_statistics.transcript_type_stats.${t}.associated_genes.total_count`,
  exon_total_count: (t) =>
    `features_statistics.transcript_type_stats.${t}.exon_stats.total_count`,
  exon_average_length: (t) =>
    `features_statistics.transcript_type_stats.${t}.exon_stats.length.mean`,
  exon_average_concatenated_length: (t) =>
    `features_statistics.transcript_type_stats.${t}.exon_stats.concatenated_length.mean`,
  cds_total_count: (t) =>
    `features_statistics.transcript_type_stats.${t}.cds_stats.total_count`,
  cds_average_length: (t) =>
    `features_statistics.transcript_type_stats.${t}.cds_stats.length.mean`,
  cds_average_concatenated_length: (t) =>
    `features_statistics.transcript_type_stats.${t}.cds_stats.concatenated_length.mean`,
}

const BUSCO_METRICS = new Set([
  "complete",
  "single_copy",
  "duplicated",
  "fragmented",
  "missing",
])

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

function resolveGeneDbCategory(annotation: AnnotationBase, category: string): string | null {
  const stats = annotation.features_statistics?.gene_category_stats
  if (!stats) return null

  const candidates = GENE_CATEGORY_ALIASES[category] ?? [category]
  for (const key of candidates) {
    if (key in stats) return key
  }
  return null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

/**
 * Read a single metric scalar from one annotation (portal or custom upload).
 * Mirrors server field paths used by gene/transcript/busco metric value endpoints.
 */
export function extractAnnotationMetricValue(
  annotation: AnnotationBase,
  entityType: AnalyticsEntityType,
  categoryOrType: string,
  metric: string,
): number | null {
  if (entityType === "genes") {
    const dbCategory = resolveGeneDbCategory(annotation, categoryOrType)
    if (!dbCategory) return null
    const pathFn = GENE_METRIC_PATHS[metric]
    if (!pathFn) return null
    return toFiniteNumber(getByPath(annotation, pathFn(dbCategory)))
  }

  if (entityType === "transcripts") {
    const typeStats = annotation.features_statistics?.transcript_type_stats
    if (!typeStats || !(categoryOrType in typeStats)) return null
    const pathFn = TRANSCRIPT_METRIC_PATHS[metric]
    if (!pathFn) return null
    return toFiniteNumber(getByPath(annotation, pathFn(categoryOrType)))
  }

  if (entityType === "busco") {
    if (!BUSCO_METRICS.has(metric)) return null
    return toFiniteNumber(getByPath(annotation, `busco.${metric}`))
  }

  return null
}

export function extractAnnotationMetricValues(
  annotation: AnnotationBase,
  entityType: AnalyticsEntityType,
  categoryOrType: string,
  metric: string,
): number[] {
  const value = extractAnnotationMetricValue(
    annotation,
    entityType,
    categoryOrType,
    metric,
  )
  if (value == null || value <= 0) return []
  return [value]
}
