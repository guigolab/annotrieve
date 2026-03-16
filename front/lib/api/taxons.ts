import { apiGet, type Query } from './base'
import type { TaxonRecord, Pagination } from './types'

export interface FetchTaxonsParams extends Query {
  filter?: string
  taxids?: string
  rank?: string
  limit?: number
  offset?: number
  sort_by?: string
  sort_order?: string
}

export function listTaxons(params: FetchTaxonsParams) {
  return apiGet<Pagination<TaxonRecord>>('/taxons', params)
}

export function getTaxon(taxid: string) {
  return apiGet<TaxonRecord>(`/taxons/${encodeURIComponent(taxid)}`)
}

export function getTaxonChildren(taxid: string) {
  return apiGet<Pagination<TaxonRecord>>(`/taxons/${encodeURIComponent(taxid)}/children`)
}

export function getTaxonAncestors(taxid: string) {
  return apiGet<Pagination<TaxonRecord>>(`/taxons/${encodeURIComponent(taxid)}/ancestors`)
}

export function getTaxonRankFrequencies() {
  return apiGet<Record<string, number>>('/taxons/frequencies/rank')
}

export interface FlatTreeNode {
  id: string
  parentId: string | null
  scientific_name: string
  annotations_count: number
  assemblies_count: number
  organisms_count: number
  rank: string | null
  coding_count: number
  non_coding_count: number
  pseudogene_count: number
  mrna_count: number
  lncrna_count: number
  trna_count: number
  mirna_count: number
  busco_single_copy_mean: number
  busco_duplicated_mean: number
  busco_fragmented_mean: number
  busco_missing_mean: number
}

export interface FlattenedTreeResponse {
  fields: string[]
  rows: (string | number | null)[][]
}

/**
 * Fetches flattened tree. format='json' (default) returns structured JSON; format='tsv' returns TSV parsed to FlatTreeNode[].
 */
export async function getFlattenedTree(format: 'json' | 'tsv' = 'tsv'): Promise<FlatTreeNode[] | FlattenedTreeResponse> {
  const { getApiBase, joinUrl } = await import('@/lib/config/env')
  const API_BASE = getApiBase()
  const url = `${joinUrl(API_BASE, '/taxons/flattened-tree')}?format=${format}`
  
  if (format === 'json') {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } })
    if (!res.ok) throw new Error(`GET /taxons/flattened-tree failed: ${res.status}`)
    return res.json() as Promise<FlattenedTreeResponse>
  }
  
  const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'text/tab-separated-values' } })
  if (!res.ok) throw new Error(`GET /taxons/flattened-tree failed: ${res.status}`)
  const text = await res.text()
  return parseTsvToFlatTreeNodes(text)
}

/**
 * Parses TSV text into FlatTreeNode array
 */
function parseTsvToFlatTreeNodes(tsvText: string): FlatTreeNode[] {
  const lines = tsvText.trim().split('\n')
  if (lines.length === 0) return []
  
  // First line is header - skip it
  const dataLines = lines.slice(1)
  
  return dataLines.map((line) => {
    const columns = line.split('\t')
    // Expected columns: taxid, parent_taxid, scientific_name, annotations_count,
    // assemblies_count, organisms_count, rank, coding_mean_count, non_coding_mean_count,
    // pseudogene_mean_count, mRNA_mean_count, lncRNA_mean_count, tRNA_mean_count, miRNA_mean_count,
    // busco_single_copy_mean, busco_duplicated_mean, busco_fragmented_mean, busco_missing_mean
    return {
      id: columns[0] || '',
      parentId: columns[1] || null,
      scientific_name: columns[2] || '',
      annotations_count: parseInt(columns[3] || '0', 10),
      assemblies_count: parseInt(columns[4] || '0', 10),
      organisms_count: parseInt(columns[5] || '0', 10),
      rank: columns[6] || null,
      coding_count: parseInt(columns[7] || '0', 10),
      non_coding_count: parseInt(columns[8] || '0', 10),
      pseudogene_count: parseInt(columns[9] || '0', 10),
      mrna_count: parseFloat(columns[10] || '0') || 0,
      lncrna_count: parseFloat(columns[11] || '0') || 0,
      trna_count: parseFloat(columns[12] || '0') || 0,
      mirna_count: parseFloat(columns[13] || '0') || 0,
      busco_single_copy_mean: parseFloat(columns[14] || '0') || 0,
      busco_duplicated_mean: parseFloat(columns[15] || '0') || 0,
      busco_fragmented_mean: parseFloat(columns[16] || '0') || 0,
      busco_missing_mean: parseFloat(columns[17] || '0') || 0,
    }
  })
}