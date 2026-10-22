import type { HitKey, HitsResponse } from "@/lib/api/xrefs-types"
import { decodeHitsRows, type DecodedHitRow } from "@/lib/genes/hits"
import {
  buildCoverageBins,
  type CoverageBin,
} from "@/lib/genes/coverage"
import type { GenesFilter } from "@/lib/genes/filters"
import {
  tipTaxidsForNode,
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
  /** Input term index in hits.terms (when known). */
  termIndex: number
  /** Whether this accession arrived via alias namespace. */
  viaAlias: boolean
  /** Annotation count under current (non-coverage) scope. */
  count: number
}

export interface RollupChild {
  id: string
  label: string
  rank: string | null
  n: number
  /** Per-term annotation counts aligned to `activeTerms`. */
  byTerm: number[]
  hasChildren: boolean
}

export interface RollupResult {
  children: RollupChild[]
  /** Active (non-excluded) terms in prevalence order. */
  terms: ResolvedTerm[]
  termCount: number
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
  /** Overview tree; `viewRank` re-roots at taxa of that rank. */
  tree(filter: GenesFilter, viewRank?: string | null): HitTree
  /** Per-rank annotation / organism counts for the overview rank select. */
  rankStats(excludeTerms: Set<string>): HitRankStat[]
  sourceCounts(filter: Omit<GenesFilter, "sources"> & { sources?: Set<number> }): Map<number, number>
  keys: HitKey[]
  rows: DecodedHitRow[]
  hits: HitsResponse
}

interface IndexedRow {
  row: DecodedHitRow
  /** Distinct term indexes hit (from keys). */
  terms: number[]
  /** Lowercased accession names hit. */
  nameIds: string[]
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
  const keys = hits.keys ?? []
  const rows = decodeHitsRows(hits.rows ?? [])

  // termIndex → set of lowercased accession names for that term
  const namesByTerm = new Map<number, Set<string>>()
  // nameId → termIndex (first)
  const termByName = new Map<string, number>()
  // nameId → viaAlias
  const viaAlias = new Map<string, boolean>()
  for (const key of keys) {
    const id = key.name.toLowerCase()
    let set = namesByTerm.get(key.term)
    if (!set) {
      set = new Set()
      namesByTerm.set(key.term, set)
    }
    set.add(id)
    if (!termByName.has(id)) termByName.set(id, key.term)
    if (key.ns === "alias") viaAlias.set(id, true)
  }

  const indexed: IndexedRow[] = rows.map((row) => {
    const terms = new Set<number>()
    const nameIds = new Set<string>()
    for (const ki of row.matchedKeyIndexes) {
      const key = keys[ki]
      if (!key) continue
      terms.add(key.term)
      nameIds.add(key.name.toLowerCase())
    }
    return {
      row,
      terms: [...terms],
      nameIds: [...nameIds],
    }
  })

  // All resolved accession names (unique, typed order from keys)
  const allNames: string[] = []
  const seenNames = new Set<string>()
  for (const key of keys) {
    const id = key.name.toLowerCase()
    if (seenNames.has(id)) continue
    seenNames.add(id)
    allNames.push(key.name)
  }

  const rollupCache = new Map<string, NodeNameCounts>()
  const treeCache = new Map<string, HitTree>()
  const rankStatsCache = new Map<string, HitRankStat[]>()

  function activeTermIndexes(exclude: Set<string>): number[] {
    const out: number[] = []
    const seen = new Set<number>()
    for (const name of allNames) {
      const id = name.toLowerCase()
      if (exclude.has(id)) continue
      const ti = termByName.get(id)
      if (ti == null || seen.has(ti)) continue
      // A term is active if any of its accessions is not excluded
      const names = namesByTerm.get(ti)
      if (!names) continue
      let any = false
      for (const n of names) {
        if (!exclude.has(n)) {
          any = true
          break
        }
      }
      if (!any) continue
      seen.add(ti)
      out.push(ti)
    }
    return out
  }

  function matchedK(entry: IndexedRow, exclude: Set<string>): number {
    let k = 0
    for (const ti of entry.terms) {
      const names = namesByTerm.get(ti)
      if (!names) continue
      let kept = false
      for (const n of names) {
        if (!exclude.has(n) && entry.nameIds.includes(n)) {
          kept = true
          break
        }
      }
      if (kept) k += 1
    }
    return k
  }

  function rowMatchesName(entry: IndexedRow, name: string | null): boolean {
    if (!name) return true
    return entry.nameIds.includes(name.toLowerCase())
  }

  function filterIndexed(
    filter: GenesFilter,
    opts: {
      applyCoverage?: boolean
      applyTaxon?: boolean
      applyName?: boolean
      applySources?: boolean
    } = {},
  ): IndexedRow[] {
    const applyCoverage = opts.applyCoverage !== false
    const applyTaxon = opts.applyTaxon !== false
    const applyName = opts.applyName !== false
    const applySources = opts.applySources !== false
    const tree = applyTaxon && filter.taxid ? getTree(filter) : null

    return indexed.filter((entry) => {
      if (applySources && !filter.sources.has(entry.row.source)) return false
      if (applyName && !rowMatchesName(entry, filter.name)) return false
      if (applyTaxon && filter.taxid && tree) {
        if (!tree.lineageByTaxid.get(entry.row.taxid)?.has(filter.taxid)) {
          return false
        }
      }
      const k = matchedK(entry, filter.excludeTerms)
      if (k <= 0) return false
      if (applyCoverage) {
        if (k < filter.minMatched || k > filter.maxMatched) return false
      }
      return true
    })
  }

  /** Overview cache depends on excluded names + viewRank (list filters do not reshape the map). */
  function overviewKey(excludeTerms: Set<string>, viewRank?: string | null): string {
    const exclude = [...excludeTerms].sort().join(",")
    const rank = viewRank?.toLowerCase().trim() || ""
    return `${exclude}|${rank}`
  }

  function overviewRows(filter: GenesFilter): DecodedHitRow[] {
    const filtered = filterIndexed(
      { ...filter, taxid: null, name: null },
      {
        applyCoverage: false,
        applyTaxon: false,
        applyName: false,
        applySources: false,
      },
    )
    return filtered.map((e) => e.row)
  }

  function getTree(filter: GenesFilter, viewRank: string | null = null): HitTree {
    // Overview ignores taxid/name/sources/coverage; excludeTerms still apply (gene-set columns).
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
      excludeTerms,
      taxid: null,
      name: null,
    }
    const stats = hitRankStats(overviewRows(filter), taxonIndex, includeTaxids)
    rankStatsCache.set(key, stats)
    return stats
  }

  function termCount(excludeTerms: Set<string>): number {
    return activeTermIndexes(excludeTerms).length
  }

  function activeTerms(excludeTerms: Set<string>): ResolvedTerm[] {
    const active = activeTermIndexes(excludeTerms)
    const activeSet = new Set(active)
    // Counts under sources-only (no coverage/taxon/name) for prevalence
    const baseFilter: GenesFilter = {
      sources: new Set([1, 2, 3]),
      minMatched: 0,
      maxMatched: Number.MAX_SAFE_INTEGER,
      excludeTerms,
      taxid: null,
      name: null,
    }
    const entries = filterIndexed(baseFilter, {
      applyCoverage: false,
      applyTaxon: false,
      applyName: false,
    })
    const counts = new Map<string, number>()
    for (const entry of entries) {
      const seen = new Set<string>()
      for (const id of entry.nameIds) {
        if (excludeTerms.has(id)) continue
        const ti = termByName.get(id)
        if (ti == null || !activeSet.has(ti)) continue
        if (seen.has(id)) continue
        seen.add(id)
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }

    const terms: ResolvedTerm[] = []
    for (const name of allNames) {
      const id = name.toLowerCase()
      if (excludeTerms.has(id)) continue
      const ti = termByName.get(id)
      if (ti == null || !activeSet.has(ti)) continue
      terms.push({
        name,
        id,
        termIndex: ti,
        viaAlias: viaAlias.get(id) === true,
        count: counts.get(id) ?? 0,
      })
    }
    terms.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    return terms
  }

  function coverage(filter: GenesFilter): CoverageResult {
    // Histogram scope: sources + taxid, before coverage range; excludeTerms affect k/N
    const entries = filterIndexed(
      { ...filter, name: null },
      { applyCoverage: false, applyTaxon: true, applyName: false },
    )
    const n = termCount(filter.excludeTerms)
    const matchedCounts = entries.map((e) => matchedK(e, filter.excludeTerms))
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
    const entries = filterIndexed(filter)
    // Sort by k desc then id
    const scored = entries.map((e) => ({
      entry: e,
      k: matchedK(e, filter.excludeTerms),
    }))
    scored.sort(
      (a, b) =>
        b.k - a.k ||
        a.entry.row.annotationId.localeCompare(b.entry.row.annotationId),
    )
    const total = scored.length
    const slice = scored.slice(page.offset, page.offset + page.limit)
    const n = termCount(filter.excludeTerms)
    return {
      total,
      limit: page.limit,
      offset: page.offset,
      results: slice.map((s) => s.entry.row),
      matched: slice.map((s) => s.k),
      termCount: n,
    }
  }

  function organismCount(filter: GenesFilter): number {
    const taxids = new Set<number>()
    for (const entry of filterIndexed(filter)) {
      taxids.add(entry.row.taxid)
    }
    return taxids.size
  }

  function nodeCounts(filter: GenesFilter, nodeId: string): NodeNameCounts {
    const terms = activeTerms(filter.excludeTerms)
    const cacheKey = `${overviewKey(filter.excludeTerms)}::${nodeId}::${terms.map((t) => t.id).join(",")}`
    const cached = rollupCache.get(cacheKey)
    if (cached) return cached

    const tree = getTree(filter)
    const tips = tipTaxidsForNode(nodeId, tree.lineageByTaxid)
    const tipSet = new Set(tips)
    // Same overview scope as getTree: no sources/coverage/taxon/name.
    const entries = filterIndexed(
      { ...filter, taxid: null, name: null },
      {
        applyCoverage: false,
        applyTaxon: false,
        applyName: false,
        applySources: false,
      },
    ).filter((e) => tipSet.has(e.row.taxid))

    const byName = new Array(terms.length).fill(0)
    const colIndex = new Map(terms.map((t, i) => [t.id, i]))
    for (const entry of entries) {
      const seen = new Set<number>()
      for (const id of entry.nameIds) {
        if (filter.excludeTerms.has(id)) continue
        const idx = colIndex.get(id)
        if (idx == null || seen.has(idx)) continue
        seen.add(idx)
        byName[idx] += 1
      }
    }
    const result: NodeNameCounts = { n: entries.length, byName }
    rollupCache.set(cacheKey, result)
    return result
  }

  function sourceCounts(
    filter: Omit<GenesFilter, "sources"> & { sources?: Set<number> },
  ): Map<number, number> {
    // Count all sources after exclude only (ignore source + coverage so chips stay stable)
    const allSources = new Set([1, 2, 3])
    const entries = filterIndexed(
      {
        sources: allSources,
        minMatched: 0,
        maxMatched: Number.MAX_SAFE_INTEGER,
        excludeTerms: filter.excludeTerms,
        taxid: null,
        name: null,
      },
      {
        applyCoverage: false,
        applyTaxon: false,
        applyName: false,
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
    rankStats: getRankStats,
    sourceCounts,
    keys,
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
