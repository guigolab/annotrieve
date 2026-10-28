import type { CoverageRange, CoverageSegment } from "@/lib/genes/coverage"
import { defaultCoverageRange, isDefaultCoverageRange } from "@/lib/genes/coverage"

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
  /** Selected taxonomy node id (string taxid). */
  taxid: string | null
  /** Selected gene name (display form). */
  name: string | null
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
  return {
    sources: partial.sources ?? defaultSources(),
    minMatched: partial.minMatched ?? def.min,
    maxMatched: partial.maxMatched ?? def.max,
    matchedSegments: partial.matchedSegments ?? null,
    excludeTerms: partial.excludeTerms ?? new Set(),
    taxid: partial.taxid ?? null,
    name: partial.name ?? null,
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
  return [
    sources,
    filter.minMatched,
    filter.maxMatched,
    segments,
    exclude,
    filter.taxid ?? "",
    filter.name ?? "",
  ].join("|")
}
