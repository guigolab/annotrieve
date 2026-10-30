import type { FlatTreeNode } from "@/lib/api/taxons"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import {
  DEFAULT_GROUP,
  DEFAULT_KEEP,
  DEFAULT_SORT,
  DEFAULT_SORT_DIR,
  type AnnotationsSort,
  type AnnotationsSortDir,
  type GroupMode,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import type { GenesFilter } from "@/lib/genes/filters"
import {
  applyKeep,
  applySearch,
  buildGroupedRows,
  scoreAnnotations,
  type PipelineRow,
  type ScoredAnnotation,
} from "@/lib/genes/keep"

export interface AnnotationsPipelineResult {
  /** Rows after list filters + sources + coverage (before keep). */
  filteredTotal: number
  /** Rows after keep. */
  keptTotal: number
  /** Rows after search (what the table shows as data rows). */
  visibleTotal: number
  /** Distinct species in visible annotation rows. */
  visibleSpecies: number
  /** Flat virtual list including group headers. */
  rows: PipelineRow[]
  /** Annotation rows only (post-search, pre-group expansion). */
  annotations: ScoredAnnotation[]
}

/**
 * Pipeline: filterIndexed (scope→list→sources→coverage) → keep → search → group → sort.
 */
export function runAnnotationsPipeline(opts: {
  adapter: GenesHitsAdapter
  filter: GenesFilter
  taxonIndex: Map<string, FlatTreeNode>
  keep?: KeepPolicy
  group?: GroupMode
  sort?: AnnotationsSort | null
  sortDir?: AnnotationsSortDir
  search?: string
}): AnnotationsPipelineResult {
  const keep = opts.keep ?? DEFAULT_KEEP
  const group = opts.group ?? DEFAULT_GROUP
  const sort = opts.sort === undefined ? DEFAULT_SORT : opts.sort
  const sortDir = opts.sortDir ?? DEFAULT_SORT_DIR
  const search = opts.search ?? ""

  const page = opts.adapter.annotations(opts.filter, {
    limit: Number.MAX_SAFE_INTEGER,
    offset: 0,
  })
  const filteredTotal = page.total
  const kById = new Map<string, number>()
  for (let i = 0; i < page.results.length; i++) {
    kById.set(page.results[i]!.annotationId, page.matched[i] ?? 0)
  }

  const scored = scoreAnnotations(page.results, kById, opts.taxonIndex)
  const kept = applyKeep(scored, keep)
  const searched = applySearch(kept, search, opts.taxonIndex)
  const species = new Set(searched.map((s) => s.speciesId))
  const rows = buildGroupedRows(searched, group, sort, opts.taxonIndex, sortDir)

  return {
    filteredTotal,
    keptTotal: kept.length,
    visibleTotal: searched.length,
    visibleSpecies: species.size,
    rows,
    annotations: searched,
  }
}
