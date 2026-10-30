import type { CoverageRange, CoverageSegment } from "@/lib/genes/coverage"
import { defaultCoverageRange, isDefaultCoverageRange } from "@/lib/genes/coverage"
import type { NameMatchMode } from "@/lib/genes/list-filters"
import type { DistributionSelection } from "@/lib/genes/selection"

/** Shared filter object for adapter calls and (future) backend endpoints. */
export interface GenesFilter {
  /** Enabled source codes. Empty = none. */
  sources: Set<number>
  minMatched: number
  maxMatched: number
  /**
   * Exact multi-selected matched-count intervals. When set, coverage matching
   * uses these instead of the contiguous minMatched–maxMatched window.
   */
  matchedSegments: CoverageSegment[] | null
  /** Lowercased accession names to exclude from N / k / columns. */
  excludeTerms: Set<string>
  /**
   * Legacy single taxonomy node id. Prefer `includeTaxids` when set;
   * when both empty/null, no taxon include filter.
   */
  taxid: string | null
  /** Legacy single gene name. Prefer `includeNames` when set. */
  name: string | null
  /** Include-only clade ids (OR within). Empty = no clade include filter. */
  includeTaxids: string[]
  /** Include-only gene names (display form). */
  includeNames: string[]
  /** How multiple includeNames combine. */
  nameMatch: NameMatchMode
  /** Include cells: annotation under clade AND has gene (OR within). */
  includeCells: { taxid: string; gene: string }[]
  /** Include-only annotation ids (OR within). Empty = no id filter. */
  includeAnnotationIds: string[]
}

export const ALL_SOURCE_CODES = [1, 2, 3] as const

export function defaultSources(): Set<number> {
  return new Set(ALL_SOURCE_CODES)
}

export function makeFilter(partial: Partial<GenesFilter> & {
  termCount?: number
}): GenesFilter {
  const termCount = partial.termCount ?? 0
  const def = defaultCoverageRange(termCount)
  const includeTaxids = partial.includeTaxids?.length
    ? [...partial.includeTaxids]
    : partial.taxid
      ? [partial.taxid]
      : []
  const includeNames = partial.includeNames?.length
    ? [...partial.includeNames]
    : partial.name
      ? [partial.name]
      : []
  return {
    sources: partial.sources ?? defaultSources(),
    minMatched: partial.minMatched ?? def.min,
    maxMatched: partial.maxMatched ?? def.max,
    matchedSegments: partial.matchedSegments ?? null,
    excludeTerms: partial.excludeTerms ?? new Set(),
    taxid: includeTaxids.length === 1 ? includeTaxids[0]! : null,
    name: includeNames.length === 1 ? includeNames[0]! : null,
    includeTaxids,
    includeNames,
    nameMatch: partial.nameMatch ?? "any",
    includeCells: partial.includeCells ? [...partial.includeCells] : [],
    includeAnnotationIds: partial.includeAnnotationIds
      ? [...partial.includeAnnotationIds]
      : [],
  }
}

export function coverageFromFilter(
  filter: GenesFilter,
): CoverageRange {
  return {
    min: filter.minMatched,
    max: filter.maxMatched,
    ...(filter.matchedSegments?.length
      ? { segments: filter.matchedSegments }
      : {}),
  }
}

export function isDefaultCoverage(
  filter: Pick<GenesFilter, "minMatched" | "maxMatched">,
  termCount: number,
): boolean {
  return isDefaultCoverageRange(
    { min: filter.minMatched, max: filter.maxMatched },
    termCount,
  )
}

export function filterKey(filter: GenesFilter): string {
  const sources = [...filter.sources].sort((a, b) => a - b).join(",")
  const exclude = [...filter.excludeTerms].sort().join(",")
  const segments = filter.matchedSegments?.length
    ? filter.matchedSegments.map((s) => `${s.min}-${s.max}`).join(",")
    : ""
  const taxids = [...filter.includeTaxids].sort().join(",")
  const names = [...filter.includeNames]
    .map((n) => n.toLowerCase())
    .sort()
    .join(",")
  const cells = [...filter.includeCells]
    .map((c) => `${c.taxid}:${c.gene.toLowerCase()}`)
    .sort()
    .join(",")
  const anns = [...(filter.includeAnnotationIds ?? [])].sort().join(",")
  return [
    sources,
    filter.minMatched,
    filter.maxMatched,
    segments,
    exclude,
    taxids,
    names,
    filter.nameMatch,
    cells,
    anns,
  ].join("|")
}

/**
 * Build a GenesFilter from a row/col selection for count previews / Show only.
 */
export function filterFromSelection(
  base: GenesFilter,
  selection: DistributionSelection,
  nameMatch: NameMatchMode,
): GenesFilter {
  return makeFilter({
    ...base,
    includeTaxids: [...selection.rows],
    includeNames: [...selection.cols],
    includeCells: [],
    includeAnnotationIds: [],
    nameMatch,
    taxid: null,
    name: null,
  })
}
