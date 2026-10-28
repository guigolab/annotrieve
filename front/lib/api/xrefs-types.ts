export type AccessionSort = "n_genes" | "n_annotations" | "accession"
export type SortOrder = "asc" | "desc"
export type HitsMatch = "any" | "all"

export interface XrefsPageToken {
  next: string | null
  previous: string | null
}

export interface XrefsErrorDetail {
  code: string
  message: string
  max?: number
  errors?: unknown
}

export interface XrefsErrorEntry {
  curie?: string
  code?: string
  message?: string
  [key: string]: unknown
}

export interface NamespaceRow {
  namespace: string
  accession_count: number
}

export interface NamespacesResponse extends XrefsPageToken {
  total: number
  limit: number
  results: NamespaceRow[]
}

export interface AccessionRow {
  namespace: string
  accession: string
  n_annotations: number
  n_genes: number
}

export interface AccessionsResponse extends XrefsPageToken {
  total?: number
  limit: number
  results: AccessionRow[]
}

/**
 * Compact /hits row: annotation_id, taxid, source, matched term indexes,
 * release_date, assembly_name.
 */
export type HitsRow = [
  string,
  number,
  number,
  number[],
  (string | null)?,
  (string | null)?,
]

export interface HitTerm {
  input: string
  name: string
  namespaces: string[]
  n_hits: number
}

/** Live gene-name presence search (`GET|POST /hits`). */
export interface HitsResponse {
  terms: HitTerm[]
  sources: Record<string, { label: string }>
  include_taxids: number[]
  exclude_taxids: number[]
  total: number
  fields: string[]
  rows: HitsRow[]
}

export type NameCategory =
  | "pseudogene"
  | "numbered"
  | "homeolog"
  | "predicted"
  | "exact"
  | "other"

export interface NameSuggestion {
  name: string
  category: NameCategory
  n_annotations: number
}

/** Prefix discovery (`GET /names`). */
export interface NamesResponse {
  prefix: string
  include_taxids: number[]
  exclude_taxids: number[]
  total: number
  results: NameSuggestion[]
}

export interface GeneMatch {
  input: string
  name: string
  ns: string
}

export interface AnnotationGeneRow {
  local_id: number
  source_gene_id?: string | null
  feature_type: string
  seqid: string
  start: number
  end: number
  strand: string | null
  biotype: string | null
  primary_name: string | null
  prose?: string | null
  prose_kind?: string | null
  matches?: GeneMatch[]
  annotation_id?: string
  taxid?: number
  assembly_accession?: string
  organism_name?: string
  source_database?: string
}

export interface AnnotationGenesResponse {
  total: number
  limit: number
  offset: number
  results: AnnotationGeneRow[]
}

export interface GeneXrefRow {
  namespace: string
  accession: string
  display?: string | null
  origin?: string | null
  via_level?: number
}

export interface GeneXrefsResponse {
  total: number
  limit: number
  offset: number
  results: GeneXrefRow[]
}
