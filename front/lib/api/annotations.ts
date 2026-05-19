import { apiGet, apiPost, buildQuery, type Query } from './base'
import { getApiBase, joinUrl } from '@/lib/config/env'
import type { AnnotationRecord, Pagination } from './types'
import { contigsFileUrl, resolveChrAliasesFileUrl } from './files'

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

/** Fetch annotations by MD5 checksums via POST (avoids URL length limits for large favorite lists). */
export function listAnnotationsByMd5Checksums(
  md5_checksums: string[],
  options?: { limit?: number; offset?: number },
) {
  const limit = options?.limit ?? md5_checksums.length + 1
  const offset = options?.offset ?? 0
  return apiPost<Pagination<AnnotationRecord>>('/annotations', {
    md5_checksums,
    limit,
    offset,
  })
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

/**
 * Merge assembly chr_aliases.tsv (when present) with paginated contigs from disk/API.
 */
export async function fetchAnnotationReferenceOptions(
  taxid: string,
  assemblyAccession: string,
  annotationId: string,
  pairedAssemblyAccession?: string | null,
): Promise<MappedRegion[]> {
  const bySeqId = new Map<string, Set<string>>()

  try {
    const aliasUrl = await resolveChrAliasesFileUrl(
      taxid,
      assemblyAccession,
      pairedAssemblyAccession,
    )
    const aliasResponse = await fetch(aliasUrl)
    if (aliasResponse.ok) {
      const text = await aliasResponse.text()
      for (const line of text.split('\n')) {
        const parts = line.split('\t').map((p) => p.trim()).filter(Boolean)
        if (!parts.length) continue
        const seqId = parts[0]
        const aliasSet = bySeqId.get(seqId) ?? new Set<string>()
        for (const part of parts) {
          aliasSet.add(part)
        }
        bySeqId.set(seqId, aliasSet)
      }
    }
  } catch {
    // chr_aliases.tsv is optional for contig-level assemblies
  }

  const PAGE_SIZE = 500
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const response = await getMappedRegions(annotationId, offset, PAGE_SIZE)
    const results = response.results ?? []
    if (!results.length) break
    for (const item of results) {
      const aliasSet = bySeqId.get(item.sequence_id) ?? new Set<string>()
      aliasSet.add(item.sequence_id)
      for (const alias of item.aliases ?? []) {
        if (alias) aliasSet.add(alias)
      }
      bySeqId.set(item.sequence_id, aliasSet)
    }
    if (typeof response.total === 'number') {
      total = response.total
    }
    offset += results.length
    if (results.length < PAGE_SIZE) break
  }

  return Array.from(bySeqId.entries()).map(([sequence_id, aliases]) => ({
    sequence_id,
    annotation_id: annotationId,
    aliases: [...aliases],
  }))
}

export function downloadContigs(
  md5_checksum: string,
  bgzippedPath?: string | null,
): Promise<Response> {
  if (bgzippedPath) {
    return fetch(contigsFileUrl(bgzippedPath), {
      method: 'GET',
      headers: { Accept: 'text/plain' },
    })
  }
  const url = `${getApiBase()}/annotations/${md5_checksum}/contigs`
  return fetch(url, { method: 'GET', headers: { Accept: 'text/plain' } })
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

// Custom GFF upload APIs

export interface UploadGffResponse {
  task_id: string
  remaining_quota: number
}

export function uploadCustomGff(file: File, customName: string): Promise<UploadGffResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('custom_name', customName)

  return fetch(joinUrl(getApiBase(), '/annotations/upload-gff'), {
    method: 'POST',
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Upload failed with status ${res.status}`)
    }
    return res.json() as Promise<UploadGffResponse>
  })
}

export interface UploadJobStatus {
  task_id: string
  state: string
  meta?: Record<string, any>
  result?: any
  error?: string
}

export function getUploadJobStatus(taskId: string) {
  return apiGet<UploadJobStatus>(
    `/annotations/upload-gff/jobs/${encodeURIComponent(taskId)}`,
    undefined,
    { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } },
  )
}

export interface UploadRateLimitStatus {
  used: number
  remaining: number
}

export function getUploadRateLimit() {
  return apiGet<UploadRateLimitStatus>(
    '/annotations/upload-gff/rate-limit',
    undefined,
    { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } },
  )
}
