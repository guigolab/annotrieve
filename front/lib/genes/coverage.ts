import type { HitKey } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"

export const ANNOTATION_PAGE_SIZE = 50
export const GENE_NAMES_CAP = 50

/** Inclusive range of matched-term counts. */
export interface CoverageRange {
  min: number
  max: number
}

export interface CoverageBin {
  /** Inclusive lower bound of matched-term counts in this bar. */
  minK: number
  /** Inclusive upper bound of matched-term counts in this bar. */
  maxK: number
  /** Annotations whose matched-term count falls in [minK, maxK]. */
  count: number
}

/** Distinct query terms matched by one annotation, over the term count. */
export function termCoverage(
  row: DecodedHitRow,
  keys: HitKey[],
  termCount: number,
): { matched: number; total: number; fraction: number } {
  const terms = new Set<number>()
  for (const ki of row.matchedKeyIndexes) {
    const key = keys[ki]
    if (key) terms.add(key.term)
  }
  const total = Math.max(0, termCount)
  const matched = terms.size
  return {
    matched,
    total,
    fraction: total > 0 ? matched / total : 0,
  }
}

/**
 * Count distinct input terms among `selectedNames` that this row matched.
 * When every selected name is in the query, this equals `row.nMatched` for a
 * full-query selection; otherwise it only counts still-selected terms.
 */
export function matchedSelectedTerms(
  row: DecodedHitRow,
  keys: HitKey[],
  selectedNameIds: Set<string>,
): number {
  if (!selectedNameIds.size) return 0
  const terms = new Set<number>()
  for (const ki of row.matchedKeyIndexes) {
    const key = keys[ki]
    if (!key) continue
    if (selectedNameIds.has(key.name.toLowerCase())) terms.add(key.term)
  }
  return terms.size
}

/** Default open range: at least one match up through N. */
export function defaultCoverageRange(termCount: number): CoverageRange {
  const n = Math.max(0, termCount)
  return { min: n > 0 ? 1 : 0, max: n }
}

export function isDefaultCoverageRange(
  range: CoverageRange | null,
  termCount: number,
): boolean {
  if (!range) return true
  const def = defaultCoverageRange(termCount)
  return range.min === def.min && range.max === def.max
}

export function coverageRangesEqual(
  a: CoverageRange | null,
  b: CoverageRange | null,
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return a.min === b.min && a.max === b.max
}

export function clampCoverageRange(
  range: CoverageRange,
  termCount: number,
): CoverageRange {
  const n = Math.max(0, termCount)
  let min = Math.max(0, Math.min(range.min, n))
  let max = Math.max(0, Math.min(range.max, n))
  if (min > max) [min, max] = [max, min]
  return { min, max }
}

export function parseCovParam(raw: string | null): CoverageRange | null {
  if (!raw) return null
  const m = /^(\d+)-(\d+)$/.exec(raw.trim())
  if (!m) return null
  const min = Number(m[1])
  const max = Number(m[2])
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return clampCoverageRange({ min, max }, Math.max(min, max))
}

/**
 * Build histogram bins for matched-term counts 0..N.
 * When N > 40, merge into ~20 bins of roughly equal width.
 */
export function buildCoverageBins(
  counts: number[],
  termCount: number,
): CoverageBin[] {
  const n = Math.max(0, termCount)
  const maxK = n
  const hist = new Array<number>(maxK + 1).fill(0)
  for (const k of counts) {
    if (k < 0 || k > maxK) continue
    hist[k] += 1
  }

  if (maxK <= 40) {
    return hist.map((count, k) => ({ minK: k, maxK: k, count }))
  }

  const targetBins = 20
  const totalSlots = maxK + 1
  const bins: CoverageBin[] = []
  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor((i * totalSlots) / targetBins)
    const end = Math.floor(((i + 1) * totalSlots) / targetBins) - 1
    if (start > end) continue
    let count = 0
    for (let k = start; k <= end; k++) count += hist[k] ?? 0
    bins.push({ minK: start, maxK: end, count })
  }
  return bins
}

export function filterRowsByCoverage(
  rows: DecodedHitRow[],
  keys: HitKey[],
  selectedNameIds: Set<string>,
  range: CoverageRange | null,
): DecodedHitRow[] {
  if (!range) return rows
  return rows.filter((row) => {
    const k = matchedSelectedTerms(row, keys, selectedNameIds)
    return k >= range.min && k <= range.max
  })
}

export function coverageChipLabel(range: CoverageRange): string {
  if (range.min === range.max) return `matched ${range.min}`
  return `matched ${range.min}-${range.max}`
}

export function coverageBarLabel(
  bin: CoverageBin,
  termCount: number,
): string {
  const n = bin.count
  const N = termCount
  if (bin.minK === bin.maxK) {
    return `${n.toLocaleString()} annotations matched ${bin.minK} of ${N} names`
  }
  return `${n.toLocaleString()} annotations matched ${bin.minK}–${bin.maxK} of ${N} names`
}

/**
 * Names sent to `/annotations/{id}/genes`.
 * The route rejects more than 50 names, so a longer query sends only
 * the names this annotation actually matched.
 */
export function namesForGeneBrowse(
  queryNames: string[],
  row: DecodedHitRow,
  keys: HitKey[],
): string[] {
  if (queryNames.length <= GENE_NAMES_CAP) return queryNames
  const matched = new Set<string>()
  for (const ki of row.matchedKeyIndexes) {
    const key = keys[ki]
    if (key) matched.add(key.name)
  }
  return [...matched].slice(0, GENE_NAMES_CAP)
}

/** Build a TSV blob of filtered hit rows for client-side download. */
export function hitsToTsv(
  rows: DecodedHitRow[],
  keys: HitKey[],
): string {
  const header = "annotation_id\ttaxid\tsource\tn_matched\tmatched_names"
  const lines = rows.map((row) => {
    const matchedNames = [
      ...new Set(
        row.matchedKeyIndexes
          .map((ki) => keys[ki]?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ]
    return [
      row.annotationId,
      String(row.taxid),
      String(row.source),
      String(row.nMatched),
      matchedNames.join(","),
    ].join("\t")
  })
  return [header, ...lines].join("\n")
}
