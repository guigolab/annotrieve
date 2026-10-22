export type AccessionSort = "n_genes" | "n_annotations" | "accession"
export type SortOrder = "asc" | "desc"
export type HitsView = "genes" | "annotations"
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

/** Compact /hits row: annotation_id, taxid, source, n_matched, matched key indexes. */
export type HitsRow = [string, number, number, number, number[]]

export interface HitTerm {
  input: string
  name: string
  matched_namespaces: string[]
  n_hits: number
  expanded?: string[]
}

export interface HitKey {
  term: number
  name: string
  ns: string
}

/** Live gene-name presence search (`GET|POST /hits`). */
export interface HitsResponse {
  terms: HitTerm[]
  keys: HitKey[]
  sources: Record<string, { label: string }>
  include_taxids: number[]
  exclude_taxids: number[]
  total: number
  fields: string[]
  rows: HitsRow[]
}

/** @deprecated Legacy locus-hit row from older /hits shape. */
export interface GeneHitRow {
  annotation_id: string
  taxid: number
  assembly_accession: string
  organism_name: string
  source_database: string
  local_id: number
  seqid: string
  start: number
  end: number
  strand: string | null
  feature_type: string
  biotype: string | null
  primary_name: string | null
  matched: string[]
}

export interface AnnotationHitRow {
  annotation_id: string
  taxid: number
  assembly_accession: string
  organism_name: string
  source_database: string
  n_genes: number
  matched: string[]
}

export interface HitAnnotationsResponse extends XrefsPageToken {
  limit: number
  results: AnnotationHitRow[]
  errors?: XrefsErrorEntry[]
  taxid?: number
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
