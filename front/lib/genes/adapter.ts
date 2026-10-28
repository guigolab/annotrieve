import type { HitTerm, HitsResponse } from "@/lib/api/xrefs-types"
import { decodeHitsRows, type DecodedHitRow } from "@/lib/genes/hits"
import {
  buildCoverageBins,
  type CoverageBin,
} from "@/lib/genes/coverage"
import type { GenesFilter } from "@/lib/genes/filters"
import { filterKey } from "@/lib/genes/filters"
import {
  buildTipsByNode,
  foldNodeCounts,
  tipNameVectors,
  type HeatmapColumn,
  type NodeNameCounts,
} from "@/lib/genes/heatmap"
import {
  buildHitTree,
  hitRankStats,
  type HitRankStat,
  type HitTree,
  type HitTreeNode,
} from "@/lib/genes/tree"
import type { FlatTreeNode } from "@/lib/api/taxons"

export interface ResolvedTerm {
  /** Display name (accession). */
  name: string
  /** Lowercased id. */
  id: string
  /** Input term index in hits.terms. */
  termIndex: number
  /** Whether this accession arrived via alias namespace. */
  viaAlias: boolean
  /** Annotation count under current (non-coverage) scope. */
  count: number
}

export interface CoverageResult {
  bins: CoverageBin[]
  termCount: number
  /** Matched-count per annotation in histogram scope (before coverage range). */
  matchedCounts: number[]
}

export interface AnnotationsPage {
  total: number
  limit: number
  offset: number
  results: DecodedHitRow[]
  /** k for each result under current active terms. */
  matched: number[]
  termCount: number
}

export interface GenesHitsAdapter {
  termCount(excludeTerms: Set<string>): number
  activeTerms(excludeTerms: Set<string>): ResolvedTerm[]
  coverage(filter: GenesFilter): CoverageResult
  annotations(
    filter: GenesFilter,
    page: { limit: number; offset: number },
  ): AnnotationsPage
  /** Distinct organism taxids in the filtered annotation set. */
  organismCount(filter: GenesFilter): number
  /** Fold one node's counts (lazy). */
  nodeCounts(filter: GenesFilter, nodeId: string): NodeNameCounts
  /**
   * Batch overview cell matrix for visible node ids (one filter + tip pass).
   * Ignores list-only filters (sources / coverage / taxid / name).
   */
  overviewRowCounts(
    excludeTerms: Set<string>,
    nodeIds: string[],
    viewRank?: string | null,
  ): NodeNameCounts[]
  /** Overview tree; `viewRank` re-roots at taxa of that rank. */
  tree(filter: GenesFilter, viewRank?: string | null): HitTree
  /** Per-rank annotation / organism counts for the overview rank select. */
  rankStats(excludeTerms: Set<string>): HitRankStat[]
  sourceCounts(filter: Omit<GenesFilter, "sources"> & { sources?: Set<number> }): Map<number, number>
  terms: HitTerm[]
  rows: DecodedHitRow[]
  hits: HitsResponse
}

interface IndexedRow {
  row: DecodedHitRow
  /** Term indexes hit. */
  terms: number[]
}

interface FilteredCache {
  entries: IndexedRow[]
  kByRow: number[]
}

/**
 * Client-side adapter over a full `/hits` response.
 * Exclusion / coverage / sources are post-filters — no re-query needed.
 */
export function createClientHitsAdapter(
  hits: HitsResponse,
  taxonIndex: Map<string, FlatTreeNode>,
  includeTaxids: number[] = [],
): GenesHitsAdapter {
  const terms = hits.terms ?? []
  const rows = decodeHitsRows(hits.rows ?? [])

  const nameByTerm = terms.map((t) => t.name.toLowerCase())
  const termByName = new Map<string, number>()
  for (let i = 0; i < terms.length; i++) {
    const id = nameByTerm[i]!
    if (!termByName.has(id)) termByName.set(id, i)
  }

  const indexed: IndexedRow[] = rows.map((row) => ({
    row,
    terms: [...row.matchedTerms],
  }))

  const excludeCache = new Map<string, {
    active: number[]
    activeSet: Set<number>
    kByRow: number[]
  }>()
  const activeTermsCache = new Map<string, ResolvedTerm[]>()
  const filterCache = new Map<string, FilteredCache>()
  const rollupCache = new Map<string, NodeNameCounts>()
  const treeCache = new Map<string, HitTree>()
  const rankStatsCache = new Map<string, HitRankStat[]>()
  const tipsByNodeCache = new Map<string, Map<string, number[]>>()
  const matrixCache = new Map<string, NodeNameCounts[]>()

  function excludeKey(exclude: Set<string>): string {
    return [...exclude].sort().join(",")
  }

  function layer1(exclude: Set<string>) {
    const key = excludeKey(exclude)
    const cached = excludeCache.get(key)
    if (cached) return cached

    const active: number[] = []
    const activeSet = new Set<number>()
    for (let i = 0; i < terms.length; i++) {
      const id = nameByTerm[i]!
      if (exclude.has(id)) continue
      // Only count terms that had hits in the response scope
      if (terms[i]!.n_hits <= 0) continue
      active.push(i)
      activeSet.add(i)
    }

    const kByRow = indexed.map((entry) => {
      let k = 0
      for (const ti of entry.terms) {
        if (activeSet.has(ti)) k += 1
      }
      return k
    })

    const value = { active, activeSet, kByRow }
    excludeCache.set(key, value)
    return value
  }

  function rowMatchesName(entry: IndexedRow, name: string | null): boolean {
    if (!name) return true
    const want = name.toLowerCase()
    const ti = termByName.get(want)
    if (ti == null) return false
    return entry.terms.includes(ti)
  }

  function filterIndexed(
    filter: GenesFilter,
    opts: {
      applyCoverage?: boolean
      applyTaxon?: boolean
      applyName?: boolean
      applySources?: boolean
    } = {},
  ): { entries: IndexedRow[]; indexes: number[]; kByRow: number[] } {
    const applyCoverage = opts.applyCoverage !== false
    const applyTaxon = opts.applyTaxon !== false
    const applyName = opts.applyName !== false
    const applySources = opts.applySources !== false
    const { activeSet, kByRow } = layer1(filter.excludeTerms)
    const tree = applyTaxon && filter.taxid ? getTree(filter) : null

    const entries: IndexedRow[] = []
    const indexes: number[] = []
    for (let i = 0; i < indexed.length; i++) {
      const entry = indexed[i]!
      if (applySources && !filter.sources.has(entry.row.source)) continue
      if (applyName && !rowMatchesName(entry, filter.name)) continue
      if (applyTaxon && filter.taxid && tree) {
        if (!tree.lineageByTaxid.get(entry.row.taxid)?.has(filter.taxid)) {
          continue
        }
      }
      const k = kByRow[i] ?? 0
      if (k <= 0) continue
      if (applyCoverage) {
        const segs = filter.matchedSegments
        if (segs?.length) {
          if (!segs.some((s) => k >= s.min && k <= s.max)) continue
        } else if (k < filter.minMatched || k > filter.maxMatched) {
          continue
        }
      }
      entries.push(entry)
      indexes.push(i)
    }
    return { entries, indexes, kByRow }
  }

  function cachedFilter(filter: GenesFilter): FilteredCache {
    const key = filterKey(filter)
    const cached = filterCache.get(key)
    if (cached) return cached
    const { entries, indexes, kByRow } = filterIndexed(filter)
    const scored = entries.map((entry, j) => ({
      entry,
      k: kByRow[indexes[j]!] ?? 0,
    }))
    scored.sort(
      (a, b) =>
        b.k - a.k ||
        a.entry.row.annotationId.localeCompare(b.entry.row.annotationId),
    )
    const value: FilteredCache = {
      entries: scored.map((s) => s.entry),
      kByRow: scored.map((s) => s.k),
    }
    filterCache.set(key, value)
    return value
  }

  function overviewKey(excludeTerms: Set<string>, viewRank?: string | null): string {
    const exclude = [...excludeTerms].sort().join(",")
    const rank = viewRank?.toLowerCase().trim() || ""
    return `${exclude}|${rank}`
  }

  function overviewRows(filter: GenesFilter): DecodedHitRow[] {
    const { entries } = filterIndexed(
      { ...filter, taxid: null, name: null },
      {
        applyCoverage: false,
        applyTaxon: false,
        applyName: false,
        applySources: false,
      },
    )
    return entries.map((e) => e.row)
  }

  function getTree(filter: GenesFilter, viewRank: string | null = null): HitTree {
    const key = overviewKey(filter.excludeTerms, viewRank)
    const cached = treeCache.get(key)
    if (cached) return cached
    const tree = buildHitTree(
      overviewRows(filter),
      taxonIndex,
      includeTaxids,
      viewRank,
    )
    treeCache.set(key, tree)
    return tree
  }

  function getRankStats(excludeTerms: Set<string>): HitRankStat[] {
    const key = [...excludeTerms].sort().join(",")
    const cached = rankStatsCache.get(key)
    if (cached) return cached
    const filter: GenesFilter = {
      sources: new Set([1, 2, 3]),
      minMatched: 0,
      maxMatched: Number.MAX_SAFE_INTEGER,
      matchedSegments: null,
      excludeTerms,
      taxid: null,
      name: null,
    }
    const stats = hitRankStats(overviewRows(filter), taxonIndex, includeTaxids)
    rankStatsCache.set(key, stats)
    return stats
  }

  function termCount(excludeTerms: Set<string>): number {
    return layer1(excludeTerms).active.length
  }

  function activeTerms(excludeTerms: Set<string>): ResolvedTerm[] {
    const key = excludeKey(excludeTerms)
    const cached = activeTermsCache.get(key)
    if (cached) return cached

    const { active, activeSet } = layer1(excludeTerms)
    const baseFilter: GenesFilter = {
      sources: new Set([1, 2, 3]),
      minMatched: 0,
      maxMatched: Number.MAX_SAFE_INTEGER,
      matchedSegments: null,
      excludeTerms,
      taxid: null,
      name: null,
    }
    const { entries } = filterIndexed(baseFilter, {
      applyCoverage: false,
      applyTaxon: false,
      applyName: false,
    })
    const counts = new Map<number, number>()
    for (const entry of entries) {
      const seen = new Set<number>()
      for (const ti of entry.terms) {
        if (!activeSet.has(ti) || seen.has(ti)) continue
        seen.add(ti)
        counts.set(ti, (counts.get(ti) ?? 0) + 1)
      }
    }

    const resolved: ResolvedTerm[] = active.map((ti) => {
      const term = terms[ti]!
      return {
        name: term.name,
        id: nameByTerm[ti]!,
        termIndex: ti,
        viaAlias: term.namespaces.includes("alias"),
        count: counts.get(ti) ?? 0,
      }
    })
    resolved.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    activeTermsCache.set(key, resolved)
    return resolved
  }

  function coverage(filter: GenesFilter): CoverageResult {
    const { entries, indexes, kByRow } = filterIndexed(
      { ...filter, name: null },
      { applyCoverage: false, applyTaxon: true, applyName: false },
    )
    const n = termCount(filter.excludeTerms)
    const matchedCounts = indexes.map((i) => kByRow[i] ?? 0)
    return {
      bins: buildCoverageBins(matchedCounts, n),
      termCount: n,
      matchedCounts,
    }
  }

  function annotations(
    filter: GenesFilter,
    page: { limit: number; offset: number },
  ): AnnotationsPage {
    const cached = cachedFilter(filter)
    const total = cached.entries.length
    const slice = cached.entries.slice(page.offset, page.offset + page.limit)
    const matched = cached.kByRow.slice(page.offset, page.offset + page.limit)
    return {
      total,
      limit: page.limit,
      offset: page.offset,
      results: slice.map((e) => e.row),
      matched,
      termCount: termCount(filter.excludeTerms),
    }
  }

  function organismCount(filter: GenesFilter): number {
    const taxids = new Set<number>()
    for (const entry of cachedFilter(filter).entries) {
      taxids.add(entry.row.taxid)
    }
    return taxids.size
  }

  function tipsIndexFor(
    excludeTerms: Set<string>,
    viewRank: string | null = null,
  ): { tree: HitTree; tipsByNode: Map<string, number[]> } {
    const tree = getTree(
      {
        sources: new Set([1, 2, 3]),
        minMatched: 0,
        maxMatched: Number.MAX_SAFE_INTEGER,
        matchedSegments: null,
        excludeTerms,
        taxid: null,
        name: null,
      },
      viewRank,
    )
    const key = overviewKey(excludeTerms, viewRank)
    let tipsByNode = tipsByNodeCache.get(key)
    if (!tipsByNode) {
      tipsByNode = buildTipsByNode(tree.lineageByTaxid)
      tipsByNodeCache.set(key, tipsByNode)
    }
    return { tree, tipsByNode }
  }

  function nodeCounts(filter: GenesFilter, nodeId: string): NodeNameCounts {
    const resolved = activeTerms(filter.excludeTerms)
    const cacheKey = `${overviewKey(filter.excludeTerms)}::${nodeId}::${resolved.map((t) => t.id).join(",")}`
    const cached = rollupCache.get(cacheKey)
    if (cached) return cached

    const { tipsByNode } = tipsIndexFor(filter.excludeTerms)
    const tips = tipsByNode.get(nodeId) ?? []
    const tipSet = new Set(tips)
    const { entries } = filterIndexed(
      { ...filter, taxid: null, name: null },
      {
        applyCoverage: false,
        applyTaxon: false,
        applyName: false,
        applySources: false,
      },
    )
    const under = entries.filter((e) => tipSet.has(e.row.taxid))

    const byName = new Array(resolved.length).fill(0)
    const colIndex = new Map(resolved.map((t, i) => [t.termIndex, i]))
    for (const entry of under) {
      const seen = new Set<number>()
      for (const ti of entry.terms) {
        const idx = colIndex.get(ti)
        if (idx == null || seen.has(idx)) continue
        seen.add(idx)
        byName[idx] += 1
      }
    }
    const result: NodeNameCounts = { n: under.length, byName }
    rollupCache.set(cacheKey, result)
    return result
  }

  function overviewRowCounts(
    excludeTerms: Set<string>,
    nodeIds: string[],
    viewRank: string | null = null,
  ): NodeNameCounts[] {
    const resolved = activeTerms(excludeTerms)
    const matrixKey = `${overviewKey(excludeTerms, viewRank)}::${resolved.map((t) => t.id).join(",")}::${nodeIds.join(",")}`
    const cached = matrixCache.get(matrixKey)
    if (cached) return cached

    const { tipsByNode } = tipsIndexFor(excludeTerms, viewRank)
    const overviewFilter: GenesFilter = {
      sources: new Set([1, 2, 3]),
      minMatched: 0,
      maxMatched: Number.MAX_SAFE_INTEGER,
      matchedSegments: null,
      excludeTerms,
      taxid: null,
      name: null,
    }
    const { entries } = filterIndexed(overviewFilter, {
      applyCoverage: false,
      applyTaxon: false,
      applyName: false,
      applySources: false,
    })
    const columns: HeatmapColumn[] = resolved.map((t) => ({
      name: t.name,
      id: t.id,
      prevalence: t.count,
    }))
    const tipVectors = tipNameVectors(
      entries.map((e) => e.row),
      terms,
      columns,
    )
    const empty: NodeNameCounts = {
      n: 0,
      byName: new Array(resolved.length).fill(0),
    }
    const result = nodeIds.map((id) => {
      const tips = tipsByNode.get(id)
      if (!tips?.length) return empty
      return foldNodeCounts(tips, tipVectors, resolved.length)
    })
    matrixCache.set(matrixKey, result)
    return result
  }

  function sourceCounts(
    filter: Omit<GenesFilter, "sources"> & { sources?: Set<number> },
  ): Map<number, number> {
    // Reflect heatmap taxon/name slice (+ excluded terms); ignore coverage and
    // the source toggles themselves so chip totals stay independent of which
    // sources are currently enabled.
    const { entries } = filterIndexed(
      {
        sources: new Set([1, 2, 3]),
        minMatched: 0,
        maxMatched: Number.MAX_SAFE_INTEGER,
        matchedSegments: null,
        excludeTerms: filter.excludeTerms,
        taxid: filter.taxid ?? null,
        name: filter.name ?? null,
      },
      {
        applyCoverage: false,
        applyTaxon: true,
        applyName: true,
        applySources: false,
      },
    )
    const counts = new Map<number, number>()
    for (const e of entries) {
      counts.set(e.row.source, (counts.get(e.row.source) ?? 0) + 1)
    }
    return counts
  }

  return {
    termCount,
    activeTerms,
    coverage,
    annotations,
    organismCount,
    nodeCounts,
    tree: getTree,
    overviewRowCounts,
    rankStats: getRankStats,
    sourceCounts,
    terms,
    rows,
    hits,
  }
}

/** Walk tree to find children of a node (or roots when childrenOf is null/"2759"). */
export function childrenOfNode(
  tree: HitTree,
  childrenOf: string | null,
): HitTreeNode[] {
  if (!childrenOf || childrenOf === "2759") return tree.roots
  const walk = (nodes: HitTreeNode[]): HitTreeNode[] | null => {
    for (const n of nodes) {
      if (n.id === childrenOf) return n.children
      const found = walk(n.children)
      if (found) return found
    }
    return null
  }
  return walk(tree.roots) ?? []
}
