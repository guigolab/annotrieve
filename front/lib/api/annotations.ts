import { apiGet, apiPost, buildQuery, type Query } from './base'
import type { AnnotationRecord, Pagination } from './types'

export interface FetchAnnotationsParams extends Query {
  filter?: string
  taxids?: string
  sources?: string
  db_sources?: string
  assembly_accessions?: string
  assembly_levels?: string
  assembly_statuses?: string
  refseq_categories?: string
  biotypes?: string
  feature_types?: string
  pipelines?: string
  providers?: string
  sort_by?: 'assembly_accession' | 'assembly_name' | 'organism_name' | 'source_file_info.release_date'
  sort_order?: 'asc' | 'desc'
  latest_release_by?: 'organism' | 'assembly'
  limit?: number
  offset?: number
}

export function listAnnotations(params: FetchAnnotationsParams) {
  return apiGet<Pagination<AnnotationRecord>>('/annotations', params)
}

export async function downloadAnnotationsReport(params: FetchAnnotationsParams): Promise<Blob> {
  const API_BASE = 'https://genome.crg.es/annotrieve/api/v0'
  const url = `${API_BASE}/annotations/report${buildQuery(params)}`
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'text/tab-separated-values' } })
  if (!res.ok) {
    throw new Error(`GET /annotations/report failed: ${res.status}`)
  }
  return res.blob()
}
export function getAnnotation(md5: string) {
  return apiGet<AnnotationRecord>(`/annotations/${md5}`)
}

export function getAnnotationsStats(field: string, params?: Query) {
  return apiGet<Record<string, number>>(`/annotations/stats/${encodeURIComponent(field)}`, params)
}

export function getAnnotationsStatsSummary(params?: Query) {
  return apiGet<any>('/annotations/stats/summary', params)
}

export interface DistributionData {
  counts?: {
    coding_genes?: number[]
    non_coding_genes?: number[]
    pseudogenes?: number[]
  }
  mean_lengths?: {
    coding_genes?: number[]
    non_coding_genes?: number[]
    pseudogenes?: number[]
  }
  ratios?: {
    coding_ratio?: number[]
    non_coding_ratio?: number[]
    pseudogene_ratio?: number[]
  }
}

export interface DistributionParams extends Query {
  metric?: 'counts' | 'mean_lengths' | 'ratios' | 'all'
  category?: 'coding_genes' | 'non_coding_genes' | 'pseudogenes' | 'all'
}

export function getAnnotationsDistribution(params?: DistributionParams) {
  return apiGet<DistributionData>('/annotations/stats/distribution', params)
}

export function getAnnotationsFrequencies(field: string, params?: Query) {
  return apiGet<Record<string, number>>(`/annotations/frequencies/${encodeURIComponent(field)}`, params)
}

export function listAnnotationErrors(offset = 0, limit = 20) {
  return apiGet<Pagination<any>>('/annotations/errors', { offset, limit })
}

export function downloadAnnotations(md5_checksums: string[]) {
  return apiPost<Blob>('/annotations/download', { md5_checksums }, {}, {}, 'blob')
}

export interface StreamGffParams extends Query {
  region?: string
  start?: number
  end?: number
  feature_type?: string
  feature_source?: string
  biotype?: string
}

export function streamAnnotationGff(
  md5_checksum: string,
  params?: StreamGffParams,
  options?: RequestInit,
): Promise<Response> {
  const API_BASE = 'https://genome.crg.es/annotrieve/api/v0'
  const url = `${API_BASE}/annotations/${md5_checksum}/gff${buildQuery(params || {})}`
  const mergedHeaders = new Headers({ Accept: 'text/plain' })
  if (options?.headers) {
    const customHeaders = new Headers(options.headers as HeadersInit)
    customHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value)
    })
  }
  return fetch(url, {
    method: 'GET',
    ...options,
    headers: mergedHeaders,
  })
}

export interface MappedRegion {
  sequence_id: string
  annotation_id: string
  aliases: string[]
}

export function getMappedRegions(md5_checksum: string, offset = 0, limit = 20) {
  return apiGet<Pagination<MappedRegion>>(`/annotations/${md5_checksum}/contigs/aliases`, { offset, limit })
}

export function downloadContigs(md5_checksum: string): Promise<Response> {
  const API_BASE = 'https://genome.crg.es/annotrieve/api/v0'
  const url = `${API_BASE}/annotations/${md5_checksum}/contigs`
  return fetch(url, { method: 'GET', headers: { 'Accept': 'text/plain' } })
}

// Gene Stats API
export interface GeneStatsSummary {
  total_annotations: number
  summary: {
    genes: Record<string, {
      annotations_count: number
      missing_annotations_count: number
      average_count: number | null
      average_mean_length: number | null
    }>
  }
  categories: string[]
  metrics: string[]
}

export function getGeneStats(params?: Query) {
  return apiGet<GeneStatsSummary>('/annotations/gene-stats', params)
}

export interface GeneCategoryDetails {
  category: string
  annotations_count: number
  missing_annotations_count: number
  summary: Record<string, { mean?: number; median?: number }>
  metrics: string[]
}

export function getGeneCategoryDetails(category: string, params?: Query) {
  return apiGet<GeneCategoryDetails>(`/annotations/gene-stats/${encodeURIComponent(category)}`, params)
}

export interface GeneCategoryMetricValues {
  category: string
  metric: string
  values: number[]
  annotation_ids?: string[]
  missing: string[]
}

export function getGeneCategoryMetricValues(
  category: string,
  metric: string,
  params?: Query & { include_annotations?: boolean }
) {
  return apiGet<GeneCategoryMetricValues>(
    `/annotations/gene-stats/${encodeURIComponent(category)}/${encodeURIComponent(metric)}`,
    params
  )
}

// Transcript Stats API
export interface TranscriptStatsSummary {
  total_annotations: number
  summary: {
    types: Record<string, {
      annotations_count: number
      missing_annotations_count: number
      average_count: number | null
      average_mean_length: number | null
    }>
  }
  types: string[]
  metrics: string[]
}

export function getTranscriptStats(params?: Query) {
  return apiGet<TranscriptStatsSummary>('/annotations/transcript-stats', params)
}

export interface TranscriptTypeDetails {
  type: string
  annotations_count: number
  missing_annotations_count: number
  summary: Record<string, { mean?: number; median?: number }>
  metrics: string[]
}

export function getTranscriptTypeDetails(type: string, params?: Query) {
  return apiGet<TranscriptTypeDetails>(`/annotations/transcript-stats/${encodeURIComponent(type)}`, params)
}

export interface TranscriptTypeMetricValues {
  type: string
  metric: string
  values: number[]
  annotation_ids?: string[]
  missing: string[]
}

export function getTranscriptTypeMetricValues(
  type: string,
  metric: string,
  params?: Query & { include_annotations?: boolean }
) {
  return apiGet<TranscriptTypeMetricValues>(
    `/annotations/transcript-stats/${encodeURIComponent(type)}/${encodeURIComponent(metric)}`,
    params
  )
}

// Busco Stats API (metrics only, no categories)
export interface BuscoStatsSummary {
  total_annotations: number
  summary: Record<
    string,
    {
      annotations_count: number
      missing_annotations_count: number
      mean: number | null
    }
  >
  metrics: string[]
}

export function getBuscoStats(params?: Query) {
  return apiGet<BuscoStatsSummary>('/annotations/busco-stats', params)
}

export interface BuscoMetricValues {
  metric: string
  values: number[]
  annotation_ids?: string[]
}

export function getBuscoMetricValues(
  metric: string,
  params?: Query & { include_annotations?: boolean }
) {
  return apiGet<BuscoMetricValues>(
    `/annotations/busco-stats/${encodeURIComponent(metric)}`,
    params
  )
}

// Annotations aggregates by taxon rank (for radial stacked bar chart)
export const TAXON_RANK_OPTIONS = [
  'domain',
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
] as const

export type TaxonRankOption = (typeof TAXON_RANK_OPTIONS)[number]

export interface TaxonAggregateRow {
  taxid: number
  taxon_name: string
  avg_coding_genes_count: number
  avg_non_coding_genes_count: number
  avg_pseudogenes_count: number
  count: number
}

export interface AnnotationsAggregatesByTaxonResponse {
  fields: string[]
  rows: [number, string, number, number, number, number][]
}

export function getAnnotationsAggregatesByTaxonRank(rank: string) {
  return apiGet<AnnotationsAggregatesByTaxonResponse>(
    '/annotations/aggregates/taxons',
    { rank }
  )
}