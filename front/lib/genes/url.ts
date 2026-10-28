import type { CoverageRange } from "@/lib/genes/coverage"
import {
  clampCoverageRange,
  defaultCoverageRange,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES } from "@/lib/genes/filters"
import { GENES_VIEW_RANKS } from "@/lib/genes/tree"

export interface GenesUrlState {
  names: string[]
  exclude: string[]
  t: string | null
  g: string | null
  sources: number[] | null
  lo: number | null
  hi: number | null
  ann: string | null
  gene: number | null
  /** Include-scope taxids (query scoping). */
  includeTaxids: number[]
  /** Exclude-scope taxids (query scoping). */
  excludeTaxids: number[]
  /** Overview leaf/root rank (kingdom…genus); null = auto. */
  viewRank: string | null
}

export function parseGenesSearchParams(
  searchParams: URLSearchParams,
): GenesUrlState {
  const namesRaw = searchParams.get("names") ?? ""
  const names = namesRaw
    ? namesRaw
        .split(",")
        .map((n) => n.trim())
        .filter((n) => Boolean(n) && !n.includes("*"))
    : []
  const excludeRaw = searchParams.get("exclude") ?? ""
  const exclude = excludeRaw
    ? excludeRaw.split(",").map((n) => n.trim()).filter(Boolean)
    : []

  const t = searchParams.get("t")?.trim() || null
  const g = searchParams.get("g")?.trim() || null

  const sourcesRaw = searchParams.get("sources")
  let sources: number[] | null = null
  if (sourcesRaw) {
    sources = sourcesRaw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
  }

  const loRaw = searchParams.get("lo")
  const hiRaw = searchParams.get("hi")
  const lo = loRaw != null && /^\d+$/.test(loRaw) ? Number(loRaw) : null
  const hi = hiRaw != null && /^\d+$/.test(hiRaw) ? Number(hiRaw) : null

  const ann = searchParams.get("ann")?.trim() || null
  const geneRaw = searchParams.get("gene")
  const gene =
    geneRaw != null && /^\d+$/.test(geneRaw) ? Number(geneRaw) : null

  const parseTaxids = (raw: string | null): number[] => {
    if (!raw) return []
    return raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  }
  const includeTaxids = parseTaxids(searchParams.get("itax"))
  const excludeTaxids = parseTaxids(searchParams.get("etax"))

  const viewRankRaw = searchParams.get("rank")?.trim().toLowerCase() || null
  const viewRank =
    viewRankRaw && (GENES_VIEW_RANKS as readonly string[]).includes(viewRankRaw)
      ? viewRankRaw
      : null

  return {
    names,
    exclude,
    t,
    g,
    sources,
    lo,
    hi,
    ann,
    gene,
    includeTaxids,
    excludeTaxids,
    viewRank,
  }
}

export function resolveCoverageFromUrl(
  state: Pick<GenesUrlState, "lo" | "hi">,
  termCount: number,
): CoverageRange {
  const n = Math.max(0, termCount)
  if (state.lo != null && state.hi != null) {
    return clampCoverageRange({ min: state.lo, max: state.hi }, n)
  }
  return defaultCoverageRange(n)
}

export function buildGenesQueryString(state: {
  names: string[]
  exclude: string[]
  t: string | null
  g: string | null
  sources: Set<number>
  coverage: CoverageRange | null
  termCount: number
  ann: string | null
  gene: number | null
  includeTaxids?: number[]
  excludeTaxids?: number[]
  viewRank?: string | null
}): string {
  const usp = new URLSearchParams()
  if (state.names.length) usp.set("names", state.names.join(","))
  if (state.exclude.length) usp.set("exclude", state.exclude.join(","))
  if (state.t) usp.set("t", state.t)
  if (state.g) usp.set("g", state.g)

  if (state.sources.size < ALL_SOURCE_CODES.length) {
    usp.set(
      "sources",
      [...state.sources].sort((a, b) => a - b).join(","),
    )
  }

  const n = Math.max(0, state.termCount)
  const range = state.coverage ? clampCoverageRange(state.coverage, n) : null
  if (range && !isDefaultCoverageRange(range, n)) {
    usp.set("lo", String(range.min))
    usp.set("hi", String(range.max))
  }

  if (state.includeTaxids?.length) {
    usp.set("itax", state.includeTaxids.join(","))
  }
  if (state.excludeTaxids?.length) {
    usp.set("etax", state.excludeTaxids.join(","))
  }
  if (state.viewRank) {
    usp.set("rank", state.viewRank)
  }

  if (state.ann) usp.set("ann", state.ann)
  if (state.gene != null) usp.set("gene", String(state.gene))
  return usp.toString()
}
