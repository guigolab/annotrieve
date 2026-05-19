import { apiGet, type Query } from './base'
import type { AssemblyRecord, Pagination } from './types'

export interface FetchAssembliesParams extends Query {
  filter?: string
  taxids?: string
  sources?: string
  names?: string
  assembly_accessions?: string
  assembly_levels?: string
  assembly_statuses?: string
  refseq_categories?: string
  limit?: number
  offset?: number
  sort_by?: string
  sort_order?: string
  submitters?: string
}

export function listAssemblies(params: FetchAssembliesParams) {
  return apiGet<Pagination<AssemblyRecord>>('/assemblies', params)
}

export function getAssembly(accession: string) {
  return apiGet<AssemblyRecord>(`/assemblies/${encodeURIComponent(accession)}`)
}

export interface AnnotatedSequence {
  sequence_id: string
  chr_name: string
  sequence_role?: string | null
  sequence_name: string
  length?: number
  feature_count: number
  genbank_accession?: string | null
  refseq_accession?: string | null
  ucsc_style_name?: string | null
  aliases: string[]
}

export interface AnnotatedSequencesParams {
  offset?: number
  limit?: number
}


export function getPairedAssembly(accession: string) {
  return apiGet<AssemblyRecord>(`/assemblies/${encodeURIComponent(accession)}/paired`)
}

export function getAssembliesStats(params: FetchAssembliesParams, field: string) {
  return apiGet<Record<string, number>>(`/assemblies/frequencies/${encodeURIComponent(field)}`, params)
}

export function getChrAliases(accession: string) {
  return apiGet<string>(`/assemblies/${encodeURIComponent(accession)}/chr_aliases`)
}

export { chromosomesFileUrl, chrAliasesFileUrl, fetchChromosomesFromFiles, assemblyHasChromosomesFile, headFile } from './files'
export type { ChromosomeFileRow } from './files'