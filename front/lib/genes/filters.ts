import type { CoverageRange } from "@/lib/genes/coverage"
import { defaultCoverageRange, isDefaultCoverageRange } from "@/lib/genes/coverage"

/** Shared filter object for adapter calls and (future) backend endpoints. */
export interface GenesFilter {
  /** Enabled source codes. Empty = none. */
  sources: Set<number>
  minMatched: number
  maxMatched: number
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
    excludeTerms: partial.excludeTerms ?? new Set(),
    taxid: partial.taxid ?? null,
    name: partial.name ?? null,
  }
}

export function coverageFromFilter(
  filter: GenesFilter,
): CoverageRange {
  return { min: filter.minMatched, max: filter.maxMatched }
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
  return [
    sources,
    filter.minMatched,
    filter.maxMatched,
    exclude,
    filter.taxid ?? "",
    filter.name ?? "",
  ].join("|")
}
