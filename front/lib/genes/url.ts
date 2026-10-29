import type { CoverageRange } from "@/lib/genes/coverage"
import {
  clampCoverageRange,
  defaultCoverageRange,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES } from "@/lib/genes/filters"
import {
  DEFAULT_GROUP,
  DEFAULT_KEEP,
  DEFAULT_SORT,
  parseAnnotationsSort,
  parseGroupMode,
  parseKeepPolicy,
  type AnnotationsSort,
  type GroupMode,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import {
  encodeListFilterCells,
  LIST_FILTER_CELLS_URL_CAP,
  parseCommaList,
  parseListFilterCells,
  parseNameMatch,
  type GenesListFilters,
} from "@/lib/genes/list-filters"
import { GENES_VIEW_RANKS } from "@/lib/genes/tree"
import {
  DEFAULT_COUNT_UNIT,
  DEFAULT_VIEW,
  parseCountUnit,
  parseView,
  type CountUnit,
  type GenesView,
} from "@/lib/genes/view"

export interface GenesUrlState {
  names: string[]
  exclude: string[]
  /** Comma-list of include taxids (or legacy single). */
  t: string | null
  /** Comma-list of include gene names (or legacy single). */
  g: string | null
  gm: "any" | "all"
  /** Cell pairs `taxid:gene` (may be truncated in URL). */
  c: string | null
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
  /** Active lens; null when missing or invalid in the URL. */
  view: GenesView | null
  /** Count unit; null when missing or invalid. */
  unit: CountUnit | null
  keep: KeepPolicy | null
  group: GroupMode | null
  sort: AnnotationsSort | null
  q: string | null
}

export function listFiltersFromUrlState(
  state: Pick<GenesUrlState, "t" | "g" | "gm" | "c">,
): GenesListFilters {
  const includeTaxids = parseCommaList(state.t)
  const includeNames = parseCommaList(state.g)
  const includeCells = parseListFilterCells(state.c)
  return {
    includeTaxids,
    includeNames,
    nameMatch: state.gm,
    includeCells,
    includeAnnotationIds: [],
  }
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
  const gm = parseNameMatch(searchParams.get("gm"))
  const c = searchParams.get("c")?.trim() || null

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

  const view = parseView(searchParams.get("view"))
  const unit = parseCountUnit(searchParams.get("unit"))
  const keep = parseKeepPolicy(searchParams.get("keep"))
  const group = parseGroupMode(searchParams.get("group"))
  const sort = parseAnnotationsSort(searchParams.get("sort"))
  const q = searchParams.get("q")?.trim() || null

  return {
    names,
    exclude,
    t,
    g,
    gm,
    c,
    sources,
    lo,
    hi,
    ann,
    gene,
    includeTaxids,
    excludeTaxids,
    viewRank,
    view,
    unit,
    keep,
    group,
    sort,
    q,
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
  listFilters?: GenesListFilters
  sources: Set<number>
  coverage: CoverageRange | null
  termCount: number
  ann: string | null
  gene: number | null
  includeTaxids?: number[]
  excludeTaxids?: number[]
  viewRank?: string | null
  view?: GenesView | null
  unit?: CountUnit | null
  keep?: KeepPolicy | null
  group?: GroupMode | null
  sort?: AnnotationsSort | null
  search?: string | null
}): string {
  const usp = new URLSearchParams()
  if (state.names.length) usp.set("names", state.names.join(","))
  // `exclude` is only written when non-empty (optimistic mask / legacy links).
  if (state.exclude.length) usp.set("exclude", state.exclude.join(","))

  const lf = state.listFilters
  if (lf) {
    if (lf.includeTaxids.length) usp.set("t", lf.includeTaxids.join(","))
    if (lf.includeNames.length) usp.set("g", lf.includeNames.join(","))
    if (lf.nameMatch === "all" && lf.includeNames.length > 0) {
      usp.set("gm", "all")
    }
    if (
      lf.includeCells.length > 0 &&
      lf.includeCells.length <= LIST_FILTER_CELLS_URL_CAP
    ) {
      usp.set("c", encodeListFilterCells(lf.includeCells))
    }
  }

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

  if (state.view && state.view !== DEFAULT_VIEW) {
    usp.set("view", state.view)
  }

  if (state.unit && state.unit !== DEFAULT_COUNT_UNIT) {
    usp.set("unit", state.unit)
  }

  if (state.keep && state.keep !== DEFAULT_KEEP) {
    usp.set("keep", state.keep)
  }
  if (state.group && state.group !== DEFAULT_GROUP) {
    usp.set("group", state.group)
  }
  if (state.sort && state.sort !== DEFAULT_SORT) {
    usp.set("sort", state.sort)
  }
  if (state.search?.trim()) {
    usp.set("q", state.search.trim())
  }

  if (state.ann) usp.set("ann", state.ann)
  if (state.gene != null) usp.set("gene", String(state.gene))
  return usp.toString()
}
