import type { FlatTreeNode } from "@/lib/api/taxons"
import type { DecodedHitRow } from "@/lib/genes/hits"
import { RANK_ORDER, getRankIndex } from "@/lib/stores/flattened-tree"

export const EUKARYOTA_TAXID = "2759"

/** Ranks available in the genes overview rank select (species excluded). */
export const GENES_VIEW_RANKS = RANK_ORDER.filter((r) => r !== "species")

export type GenesViewRank = (typeof GENES_VIEW_RANKS)[number]

export interface HitRankStat {
  rank: GenesViewRank
  /** Nodes at this rank in the overview scope. */
  taxonCount: number
  annotationCount: number
  organismCount: number
}

const EXCLUDE_FROM_PATH = new Set(["root", "131567", EUKARYOTA_TAXID])

export interface SourceSlice {
  code: number
  count: number
}

export interface HitTreeNode {
  id: string
  label: string
  rank: string | null
  children: HitTreeNode[]
  count: number
  sources: SourceSlice[]
}

export interface HitTree {
  roots: HitTreeNode[]
  /** Organism taxid → node ids on its path (self included). */
  lineageByTaxid: Map<number, Set<string>>
  maxCount: number
}

interface HitScopeGraph {
  annsByTaxid: Map<number, DecodedHitRow[]>
  tipsAt: Map<string, Set<number>>
  kept: Set<string>
  lineageByTaxid: Map<number, Set<string>>
  childrenOf: Map<string, string[]>
  /** Natural roots (include taxids or children of Eukaryota). */
  autoRoots: string[]
}

function buildHitScopeGraph(
  rows: DecodedHitRow[],
  index: Map<string, FlatTreeNode>,
  rootTaxids: number[] = [],
): HitScopeGraph | null {
  if (!rows.length || !index.size) return null

  const annsByTaxid = new Map<number, DecodedHitRow[]>()
  for (const row of rows) {
    const list = annsByTaxid.get(row.taxid) ?? []
    list.push(row)
    annsByTaxid.set(row.taxid, list)
  }

  const tipsAt = new Map<string, Set<number>>()
  const kept = new Set<string>()
  const lineageByTaxid = new Map<number, Set<string>>()
  const includeRoots = new Set(rootTaxids.map(String))

  for (const taxid of annsByTaxid.keys()) {
    let currentId: string | null = String(taxid)
    const path: string[] = []
    let reachedEuk = false
    while (currentId) {
      if (includeRoots.has(currentId)) {
        path.push(currentId)
        reachedEuk = true
        break
      }
      if (currentId === EUKARYOTA_TAXID) {
        reachedEuk = true
        break
      }
      if (EXCLUDE_FROM_PATH.has(currentId)) break
      const node = index.get(currentId)
      if (!node) break
      path.push(currentId)
      currentId = node.parentId
    }
    if (!reachedEuk || path.length === 0) continue
    lineageByTaxid.set(taxid, new Set(path))
    for (const id of path) {
      kept.add(id)
      let set = tipsAt.get(id)
      if (!set) {
        set = new Set()
        tipsAt.set(id, set)
      }
      set.add(taxid)
    }
  }

  if (!kept.size) {
    return {
      annsByTaxid,
      tipsAt,
      kept,
      lineageByTaxid,
      childrenOf: new Map(),
      autoRoots: [],
    }
  }

  const childrenOf = new Map<string, string[]>()
  const autoRoots: string[] = []
  for (const id of kept) {
    const node = index.get(id)
    if (!node) continue
    const parentId = node.parentId
    if (!parentId || parentId === EUKARYOTA_TAXID || !kept.has(parentId)) {
      autoRoots.push(id)
    } else {
      const list = childrenOf.get(parentId) ?? []
      list.push(id)
      childrenOf.set(parentId, list)
    }
  }

  return {
    annsByTaxid,
    tipsAt,
    kept,
    lineageByTaxid,
    childrenOf,
    autoRoots,
  }
}

function normalizeRank(rank: string | null | undefined): string | null {
  if (!rank) return null
  const lower = rank.toLowerCase().trim()
  return lower || null
}

/**
 * Allowed ranks for the overview select given include-taxids.
 * - No includes → kingdom…genus
 * - All includes same rank → ranks strictly below that floor up to genus
 * - Mixed ranks → disabled (empty list)
 */
export function allowedGenesViewRanks(
  includeTaxids: number[],
  index: Map<string, FlatTreeNode>,
): { ranks: readonly GenesViewRank[]; mixed: boolean; floor: string | null } {
  if (!includeTaxids.length) {
    return { ranks: GENES_VIEW_RANKS, mixed: false, floor: null }
  }
  const ranks = new Set<string>()
  for (const taxid of includeTaxids) {
    const r = normalizeRank(index.get(String(taxid))?.rank)
    if (r) ranks.add(r)
  }
  if (ranks.size === 0) {
    return { ranks: GENES_VIEW_RANKS, mixed: false, floor: null }
  }
  if (ranks.size > 1) {
    return { ranks: [], mixed: true, floor: null }
  }
  const floor = [...ranks][0]!
  const floorIdx = getRankIndex(floor)
  const below = GENES_VIEW_RANKS.filter((r) => getRankIndex(r) > floorIdx)
  return { ranks: below, mixed: false, floor }
}

/** Per-rank taxon / annotation / organism totals under the overview scope. */
export function hitRankStats(
  rows: DecodedHitRow[],
  index: Map<string, FlatTreeNode>,
  rootTaxids: number[] = [],
): HitRankStat[] {
  const graph = buildHitScopeGraph(rows, index, rootTaxids)
  if (!graph || !graph.kept.size) {
    return GENES_VIEW_RANKS.map((rank) => ({
      rank,
      taxonCount: 0,
      annotationCount: 0,
      organismCount: 0,
    }))
  }

  const orgsByRank = new Map<string, Set<number>>()
  const taxaByRank = new Map<string, number>()
  for (const rank of GENES_VIEW_RANKS) {
    orgsByRank.set(rank, new Set())
    taxaByRank.set(rank, 0)
  }

  for (const id of graph.kept) {
    const rank = normalizeRank(index.get(id)?.rank)
    if (!rank || !orgsByRank.has(rank)) continue
    taxaByRank.set(rank, (taxaByRank.get(rank) ?? 0) + 1)
    const tips = graph.tipsAt.get(id)
    if (!tips) continue
    const orgs = orgsByRank.get(rank)!
    for (const tip of tips) orgs.add(tip)
  }

  return GENES_VIEW_RANKS.map((rank) => {
    const orgs = orgsByRank.get(rank)!
    let annotationCount = 0
    for (const tip of orgs) {
      annotationCount += graph.annsByTaxid.get(tip)?.length ?? 0
    }
    return {
      rank,
      taxonCount: taxaByRank.get(rank) ?? 0,
      annotationCount,
      organismCount: orgs.size,
    }
  })
}

/**
 * Pruned tree of hit taxids, rooted at children of Eukaryota (or include taxids).
 * When `viewRank` is set, taxa at that rank become roots (still depth-capped).
 * Each node's bar is annotations on that node and its descendant tips.
 */
export function buildHitTree(
  rows: DecodedHitRow[],
  index: Map<string, FlatTreeNode>,
  rootTaxids: number[] = [],
  viewRank: string | null = null,
): HitTree {
  const empty: HitTree = {
    roots: [],
    lineageByTaxid: new Map(),
    maxCount: 0,
  }
  const graph = buildHitScopeGraph(rows, index, rootTaxids)
  if (!graph) return empty
  if (!graph.kept.size) {
    return { ...empty, lineageByTaxid: graph.lineageByTaxid }
  }

  const { annsByTaxid, tipsAt, childrenOf, autoRoots, lineageByTaxid } = graph
  const targetRank = normalizeRank(viewRank)
  let roots: string[]
  if (targetRank) {
    roots = []
    for (const id of graph.kept) {
      if (normalizeRank(index.get(id)?.rank) === targetRank) roots.push(id)
    }
  } else {
    roots = autoRoots
  }

  let maxCount = 0
  const buildNode = (id: string): HitTreeNode => {
    const meta = index.get(id)
    const childIds = [...new Set(childrenOf.get(id) ?? [])]
    childIds.sort((a, b) => {
      const la = index.get(a)?.scientific_name || a
      const lb = index.get(b)?.scientific_name || b
      return la.localeCompare(lb)
    })
    const children = childIds.map(buildNode)
    children.sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    )
    const bySource = new Map<number, number>()
    let count = 0
    for (const tip of tipsAt.get(id) ?? []) {
      const anns = annsByTaxid.get(tip) ?? []
      count += anns.length
      for (const ann of anns) {
        bySource.set(ann.source, (bySource.get(ann.source) ?? 0) + 1)
      }
    }
    maxCount = Math.max(maxCount, count)
    return {
      id,
      label: meta?.scientific_name || id,
      rank: meta?.rank ?? null,
      children,
      count,
      sources: [...bySource.entries()]
        .map(([code, n]) => ({ code, count: n }))
        .sort((a, b) => a.code - b.code),
    }
  }

  const uniqueRoots = [...new Set(roots)]
    .map(buildNode)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return {
    roots: truncateHitTreeDepth(uniqueRoots, HIT_TREE_MAX_DEPTH),
    lineageByTaxid,
    maxCount,
  }
}
/**
 * Max depth from roots for the overview tree.
 * depth 0 = roots, 1 = children, 2 = leaves (no further nesting).
 */
export const HIT_TREE_MAX_DEPTH = 2

/** Drop children past `maxDepth`; leaf counts keep rolled-up tip totals. */
export function truncateHitTreeDepth(
  roots: HitTreeNode[],
  maxDepth = HIT_TREE_MAX_DEPTH,
): HitTreeNode[] {
  const walk = (node: HitTreeNode, depth: number): HitTreeNode => {
    if (depth >= maxDepth) {
      return { ...node, children: [] }
    }
    return {
      ...node,
      children: node.children.map((child) => walk(child, depth + 1)),
    }
  }
  return roots.map((root) => walk(root, 0))
}

export function filterRowsByTreeNode(
  rows: DecodedHitRow[],
  nodeId: string | null,
  lineageByTaxid: Map<number, Set<string>>,
): DecodedHitRow[] {
  if (!nodeId) return rows
  return rows.filter((row) => lineageByTaxid.get(row.taxid)?.has(nodeId))
}

export interface FlatHitTreeRow {
  node: HitTreeNode
  /** Indent level from roots. */
  depth: number
  /** Labels from root → this node for tooltips / lineage. */
  path: string[]
}

export function flattenHitTree(
  roots: HitTreeNode[],
  expanded: Set<string>,
): FlatHitTreeRow[] {
  const out: FlatHitTreeRow[] = []
  const walk = (node: HitTreeNode, depth: number, ancestors: string[]) => {
    const path = [...ancestors, node.label]
    out.push({ node, depth, path })
    if (expanded.has(node.id)) {
      for (const child of node.children) {
        walk(child, depth + 1, path)
      }
    }
  }
  for (const root of roots) walk(root, 0, [])
  return out
}

/** Collect every expandable node id under the (depth-capped) tree. */
function collectAllExpandable(roots: HitTreeNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (node: HitTreeNode) => {
    if (node.children.length > 0) {
      ids.add(node.id)
      for (const child of node.children) walk(child)
    }
  }
  for (const root of roots) walk(root)
  return ids
}

/** Find the lineage path labels for a selected node id. */
export function lineagePathForId(
  roots: HitTreeNode[],
  nodeId: string | null,
): string[] | null {
  if (!nodeId) return null
  const flat = flattenHitTree(roots, collectAllExpandable(roots))
  const row = flat.find((r) => r.node.id === nodeId)
  return row?.path ?? null
}
