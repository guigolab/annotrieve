import type { HitTerm } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"

export const ANNOTATION_PAGE_SIZE = 50

/** Inclusive interval of matched-term counts (one histogram bin or span). */
export interface CoverageSegment {
  min: number
  max: number
}

/** Inclusive range of matched-term counts. */
export interface CoverageRange {
  min: number
  max: number
  /**
   * Exact multi-selected bin intervals. When set, filtering matches k in any
   * segment; min/max are the span (URL / legacy).
   */
  segments?: CoverageSegment[]
}

export interface CoverageBin {
  /** Inclusive lower bound of matched-term counts in this bar. */
  minK: number
  /** Inclusive upper bound of matched-term counts in this bar. */
  maxK: number
  /** Annotations whose matched-term count falls in [minK, maxK]. */
  count: number
}

/**
 * Count distinct input terms among active term indexes that this row matched.
 */
export function matchedActiveTerms(
  row: DecodedHitRow,
  activeTermIndexes: Set<number>,
): number {
  if (!activeTermIndexes.size) return 0
  let k = 0
  for (const ti of row.matchedTerms) {
    if (activeTermIndexes.has(ti)) k += 1
  }
  return k
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
  if (range.segments?.length) {
    // Multi-select that covers the full default window is "any".
    const min = Math.min(...range.segments.map((s) => s.min))
    const max = Math.max(...range.segments.map((s) => s.max))
    return min <= def.min && max >= def.max
  }
  return range.min === def.min && range.max === def.max
}

export function coverageRangesEqual(
  a: CoverageRange | null,
  b: CoverageRange | null,
): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (a.min !== b.min || a.max !== b.max) return false
  const as = a.segments ?? []
  const bs = b.segments ?? []
  if (as.length !== bs.length) return false
  return as.every((s, i) => s.min === bs[i]?.min && s.max === bs[i]?.max)
}

export function clampCoverageRange(
  range: CoverageRange,
  termCount: number,
): CoverageRange {
  const n = Math.max(0, termCount)
  let min = Math.max(0, Math.min(range.min, n))
  let max = Math.max(0, Math.min(range.max, n))
  if (min > max) [min, max] = [max, min]
  const segments = range.segments
    ?.map((s) => {
      let a = Math.max(0, Math.min(s.min, n))
      let b = Math.max(0, Math.min(s.max, n))
      if (a > b) [a, b] = [b, a]
      return { min: a, max: b }
    })
    .filter((s) => s.min <= s.max)
  return segments?.length ? { min, max, segments } : { min, max }
}

/** True when k falls in any selected segment (or the min–max span). */
export function coverageMatchesK(
  range: CoverageRange | null,
  k: number,
  termCount: number,
): boolean {
  if (!range || isDefaultCoverageRange(range, termCount)) return true
  if (range.segments?.length) {
    return range.segments.some((s) => k >= s.min && k <= s.max)
  }
  return k >= range.min && k <= range.max
}

function formatSegment(s: CoverageSegment): string {
  return s.min === s.max ? String(s.min) : `${s.min}–${s.max}`
}

/**
 * Chip label for the match-coverage control.
 * Idle: short prompt that this filters annotations by how many names they hit.
 * Active: compact selected match-count bins (no “of N” — N is often unreachable).
 */
export function namesMatchedChipLabel(
  range: CoverageRange | null,
  termCount: number,
): string {
  if (!range || isDefaultCoverageRange(range, termCount)) {
    return "Best matches"
  }
  const segments = range.segments?.length
    ? range.segments
    : [{ min: range.min, max: range.max }]
  const parts = segments.map(formatSegment)
  const shown = parts.slice(0, 3).join(", ")
  const more = parts.length > 3 ? ` +${parts.length - 3}` : ""
  return `Best matches: ${shown}${more}`
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

export function coverageChipLabel(range: CoverageRange): string {
  if (range.segments?.length) {
    const parts = range.segments.map(formatSegment)
    const shown = parts.slice(0, 3).join(", ")
    const more = parts.length > 3 ? ` +${parts.length - 3}` : ""
    return `Best matches: ${shown}${more}`
  }
  if (range.min === range.max) return `Best matches: ${range.min}`
  return `Best matches: ${range.min}–${range.max}`
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

/** Build a TSV blob of filtered hit rows for client-side download. */
export function hitsToTsv(
  rows: DecodedHitRow[],
  terms: HitTerm[],
  /** Active-term matched counts aligned with ``rows`` (from adapter page). */
  matchedK?: number[],
): string {
  const header =
    "annotation_id\ttaxid\tsource\tn_matched\tmatched_names\trelease_date\tassembly_name"
  const lines = rows.map((row, i) => {
    const matchedNames = [
      ...new Set(
        row.matchedTerms
          .map((ti) => terms[ti]?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ]
    const k = matchedK?.[i] ?? row.matchedTerms.length
    return [
      row.annotationId,
      String(row.taxid),
      String(row.source),
      String(k),
      matchedNames.join(","),
      row.releaseDate ?? "",
      row.assemblyName ?? "",
    ].join("\t")
  })
  return [header, ...lines].join("\n")
}
