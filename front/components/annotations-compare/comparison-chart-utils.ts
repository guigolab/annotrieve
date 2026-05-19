import type { Annotation } from "@/lib/types"

export type EntityMode = "genes" | "transcripts"

export const GENE_CATEGORY_ORDER = ["coding", "non_coding", "pseudogene"] as const
export type GeneCategoryKey = (typeof GENE_CATEGORY_ORDER)[number]

export const GENE_CATEGORY_LABELS: Record<GeneCategoryKey, string> = {
  coding: "Coding genes",
  non_coding: "Non-coding genes",
  pseudogene: "Pseudogenes",
}

export const SEGMENT_COLORS = [
  "#3b82f6", "#f97316", "#a855f7", "#10b981", "#ef4444",
  "#06b6d4", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6",
  "#6366f1", "#f43f5e", "#84cc16", "#0ea5e9",
  "#22c55e", "#eab308", "#dc2626", "#7c3aed", "#059669",
  "#ea580c", "#be185d", "#0891b2", "#65a30d", "#ca8a04",
  "#9333ea", "#16a34a", "#c2410c", "#9f1239", "#0e7490",
  "#4d7c0f", "#a16207", "#7e22ce", "#15803d", "#b91c1c",
  "#1e40af", "#c026d3", "#047857", "#d97706", "#be123c",
  "#0369a1", "#1e3a8a", "#a21caf", "#065f46", "#b45309", "#991b1b",
]

const BIOTYPE_METRIC_PREFIX = "biotype__"
const TRANSCRIPT_TYPE_METRIC_PREFIX = "transcript_type__"

export type GeneHeatmapMetric =
  | "total_count"
  | "length_min"
  | "length_max"
  | "length_mean"
  | `${typeof BIOTYPE_METRIC_PREFIX}${string}`
  | `${typeof TRANSCRIPT_TYPE_METRIC_PREFIX}${string}`

export type TranscriptHeatmapMetric =
  | "total_count"
  | "length_min"
  | "length_max"
  | "length_mean"
  | `${typeof BIOTYPE_METRIC_PREFIX}${string}`
  | "associated_genes_total"
  | "associated_genes_coding"
  | "associated_genes_non_coding"
  | "associated_genes_pseudogene"
  | "exon_total_count"
  | "exon_length_min"
  | "exon_length_max"
  | "exon_length_mean"
  | "exon_concat_min"
  | "exon_concat_max"
  | "exon_concat_mean"
  | "cds_total_count"
  | "cds_length_min"
  | "cds_length_max"
  | "cds_length_mean"
  | "cds_concat_min"
  | "cds_concat_max"
  | "cds_concat_mean"

const GENE_HEATMAP_STATIC_METRICS: { value: GeneHeatmapMetric; label: string }[] = [
  { value: "total_count", label: "Gene count" },
  { value: "length_min", label: "Length: Min" },
  { value: "length_max", label: "Length: Max" },
  { value: "length_mean", label: "Length: Mean" },
]

const TRANSCRIPT_HEATMAP_STATIC_METRICS: { value: TranscriptHeatmapMetric; label: string }[] = [
  { value: "total_count", label: "Transcript count" },
  { value: "length_min", label: "Length: Min" },
  { value: "length_max", label: "Length: Max" },
  { value: "length_mean", label: "Length: Mean" },
  { value: "associated_genes_total", label: "Associated Genes: Total" },
  { value: "associated_genes_coding", label: "Associated Genes: Coding" },
  { value: "associated_genes_non_coding", label: "Associated Genes: Non-coding" },
  { value: "associated_genes_pseudogene", label: "Associated Genes: Pseudogene" },
  { value: "exon_total_count", label: "Exon: Total Count" },
  { value: "exon_length_min", label: "Exon Length: Min" },
  { value: "exon_length_max", label: "Exon Length: Max" },
  { value: "exon_length_mean", label: "Exon Length: Mean" },
  { value: "exon_concat_min", label: "Exon Concatenated: Min" },
  { value: "exon_concat_max", label: "Exon Concatenated: Max" },
  { value: "exon_concat_mean", label: "Exon Concatenated: Mean" },
  { value: "cds_total_count", label: "CDS: Total Count" },
  { value: "cds_length_min", label: "CDS Length: Min" },
  { value: "cds_length_max", label: "CDS Length: Max" },
  { value: "cds_length_mean", label: "CDS Length: Mean" },
  { value: "cds_concat_min", label: "CDS Concatenated: Min" },
  { value: "cds_concat_max", label: "CDS Concatenated: Max" },
  { value: "cds_concat_mean", label: "CDS Concatenated: Mean" },
]

export function collectGeneBiotypeKeys(geneData: GeneRowData[]): string[] {
  const keys = new Set<string>()
  geneData.forEach((row) => {
    if (!row.categories) return
    Object.values(row.categories).forEach((cat) => {
      if (cat?.biotype_counts) {
        Object.keys(cat.biotype_counts).forEach((k) => keys.add(k))
      }
    })
  })
  return Array.from(keys).sort()
}

export function collectGeneTranscriptTypeKeys(geneData: GeneRowData[]): string[] {
  const keys = new Set<string>()
  geneData.forEach((row) => {
    if (!row.categories) return
    Object.values(row.categories).forEach((cat) => {
      if (cat?.transcript_type_counts) {
        Object.keys(cat.transcript_type_counts).forEach((k) => keys.add(k))
      }
    })
  })
  return Array.from(keys).sort()
}

export function collectTranscriptBiotypeKeys(transcriptData: TranscriptRowData[]): string[] {
  const keys = new Set<string>()
  transcriptData.forEach((row) => {
    if (!row.transcriptTypeStats) return
    Object.values(row.transcriptTypeStats).forEach((stats) => {
      if (stats?.biotype_counts) {
        Object.keys(stats.biotype_counts).forEach((k) => keys.add(k))
      }
    })
  })
  return Array.from(keys).sort()
}

export function buildGeneHeatmapMetrics(geneData: GeneRowData[]): { value: GeneHeatmapMetric; label: string }[] {
  const biotypeKeys = collectGeneBiotypeKeys(geneData)
  const transcriptTypeKeys = collectGeneTranscriptTypeKeys(geneData)
  return [
    ...GENE_HEATMAP_STATIC_METRICS,
    ...biotypeKeys.map((key) => ({
      value: `${BIOTYPE_METRIC_PREFIX}${key}` as GeneHeatmapMetric,
      label: `Biotype: ${key}`,
    })),
    ...transcriptTypeKeys.map((key) => ({
      value: `${TRANSCRIPT_TYPE_METRIC_PREFIX}${key}` as GeneHeatmapMetric,
      label: `Transcript type: ${key}`,
    })),
  ]
}

export function buildTranscriptHeatmapMetrics(
  transcriptData: TranscriptRowData[],
): { value: TranscriptHeatmapMetric; label: string }[] {
  const biotypeKeys = collectTranscriptBiotypeKeys(transcriptData)
  return [
    ...TRANSCRIPT_HEATMAP_STATIC_METRICS,
    ...biotypeKeys.map((key) => ({
      value: `${BIOTYPE_METRIC_PREFIX}${key}` as TranscriptHeatmapMetric,
      label: `Biotype: ${key}`,
    })),
  ]
}

export interface GeneRowData {
  annotation: Annotation
  categories: NonNullable<Annotation["features_statistics"]>["gene_category_stats"]
}

export interface TranscriptRowData {
  annotation: Annotation
  transcriptTypeStats: NonNullable<Annotation["features_statistics"]>["transcript_type_stats"]
}

export function collectGeneCategories(geneData: GeneRowData[]): GeneCategoryKey[] {
  const keys = new Set<string>()
  geneData.forEach((row) => {
    if (row.categories) {
      Object.keys(row.categories).forEach((k) => keys.add(k))
    }
  })
  return GENE_CATEGORY_ORDER.filter((k) => keys.has(k))
}

export function collectTranscriptTypes(transcriptData: TranscriptRowData[]): string[] {
  const types = new Set<string>()
  transcriptData.forEach((row) => {
    if (row.transcriptTypeStats) {
      Object.keys(row.transcriptTypeStats).forEach((t) => types.add(t))
    }
  })
  return Array.from(types).sort()
}

export function hasGeneChartData(geneData: GeneRowData[]): boolean {
  return collectGeneCategories(geneData).length > 0
}

export function hasTranscriptChartData(transcriptData: TranscriptRowData[]): boolean {
  return collectTranscriptTypes(transcriptData).length > 0
}

export function defaultEntityMode(
  geneData: GeneRowData[],
  transcriptData: TranscriptRowData[],
): EntityMode {
  if (hasGeneChartData(geneData)) return "genes"
  if (hasTranscriptChartData(transcriptData)) return "transcripts"
  return "genes"
}

export function getHeatmapColor(value: number, maxValue: number): string {
  const intensity = maxValue > 0 ? value / maxValue : 0
  const r = Math.floor(219 + intensity * (30 - 219))
  const g = Math.floor(234 + intensity * (64 - 234))
  const b = Math.floor(254 + intensity * (175 - 254))
  return `rgb(${r}, ${g}, ${b})`
}

export function isLengthMetric(field: string): boolean {
  return (
    (field.includes("length") || field.includes("concat")) &&
    !field.startsWith(BIOTYPE_METRIC_PREFIX) &&
    !field.startsWith(TRANSCRIPT_TYPE_METRIC_PREFIX)
  )
}

export function formatHeatmapCellValue(value: number, metricField: string): string {
  if (value <= 0) return "-"
  if (isLengthMetric(metricField)) {
    return value >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : value.toFixed(2)
  }
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)
}

type GeneCategoryStats = NonNullable<
  NonNullable<Annotation["features_statistics"]>["gene_category_stats"]
>[string]

type TranscriptTypeStats = NonNullable<
  NonNullable<Annotation["features_statistics"]>["transcript_type_stats"]
>[string]

export function getGeneHeatmapValue(
  categoryStats: GeneCategoryStats | undefined,
  field: GeneHeatmapMetric,
): number {
  if (!categoryStats) return 0
  if (field === "total_count") return categoryStats.total_count || 0
  if (field === "length_min") return categoryStats.length_stats?.min || 0
  if (field === "length_max") return categoryStats.length_stats?.max || 0
  if (field === "length_mean") return categoryStats.length_stats?.mean || 0
  if (field.startsWith(BIOTYPE_METRIC_PREFIX)) {
    const key = field.slice(BIOTYPE_METRIC_PREFIX.length)
    return categoryStats.biotype_counts?.[key] || 0
  }
  if (field.startsWith(TRANSCRIPT_TYPE_METRIC_PREFIX)) {
    const key = field.slice(TRANSCRIPT_TYPE_METRIC_PREFIX.length)
    return categoryStats.transcript_type_counts?.[key] || 0
  }
  return 0
}

export function getTranscriptHeatmapValue(
  typeStats: TranscriptTypeStats | undefined,
  field: TranscriptHeatmapMetric,
): number {
  if (!typeStats) return 0

  if (field === "total_count") return typeStats.total_count || 0
  if (field === "length_min") return typeStats.length_stats?.min || 0
  if (field === "length_max") return typeStats.length_stats?.max || 0
  if (field === "length_mean") return typeStats.length_stats?.mean || 0
  if (field.startsWith(BIOTYPE_METRIC_PREFIX)) {
    const key = field.slice(BIOTYPE_METRIC_PREFIX.length)
    return typeStats.biotype_counts?.[key] || 0
  }

  if (field === "associated_genes_total") return typeStats.associated_genes?.total_count || 0
  if (field === "associated_genes_coding")
    return typeStats.associated_genes?.gene_categories?.["coding"] || 0
  if (field === "associated_genes_non_coding")
    return typeStats.associated_genes?.gene_categories?.["non_coding"] || 0
  if (field === "associated_genes_pseudogene")
    return typeStats.associated_genes?.gene_categories?.["pseudogene"] || 0

  if (field === "exon_total_count") return typeStats.exon_stats?.total_count || 0
  if (field === "exon_length_min") return typeStats.exon_stats?.length?.min || 0
  if (field === "exon_length_max") return typeStats.exon_stats?.length?.max || 0
  if (field === "exon_length_mean") return typeStats.exon_stats?.length?.mean || 0
  if (field === "exon_concat_min") return typeStats.exon_stats?.concatenated_length?.min || 0
  if (field === "exon_concat_max") return typeStats.exon_stats?.concatenated_length?.max || 0
  if (field === "exon_concat_mean") return typeStats.exon_stats?.concatenated_length?.mean || 0

  if (field === "cds_total_count") return typeStats.cds_stats?.total_count || 0
  if (field === "cds_length_min") return typeStats.cds_stats?.length?.min || 0
  if (field === "cds_length_max") return typeStats.cds_stats?.length?.max || 0
  if (field === "cds_length_mean") return typeStats.cds_stats?.length?.mean || 0
  if (field === "cds_concat_min") return typeStats.cds_stats?.concatenated_length?.min || 0
  if (field === "cds_concat_max") return typeStats.cds_stats?.concatenated_length?.max || 0
  if (field === "cds_concat_mean") return typeStats.cds_stats?.concatenated_length?.mean || 0

  return 0
}
