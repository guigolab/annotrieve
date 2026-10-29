import type { FlatTreeNode } from "@/lib/api/taxons"
import type { DecodedHitRow } from "@/lib/genes/hits"
import {
  AUTO_GROUP_MIN_ROWS,
  type AnnotationsSort,
  type GroupMode,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import { speciesForTaxid } from "@/lib/genes/species"
import { GENES_VIEW_RANKS } from "@/lib/genes/tree"

export interface ScoredAnnotation {
  row: DecodedHitRow
  /** Matched active-gene count (k). */
  k: number
  speciesId: number
  speciesLabel: string
}

function releaseKey(iso: string | null): string {
  // ISO dates sort lexicographically; empty → last
  return iso && iso.trim() ? iso : ""
}

function cmpReleaseDesc(a: string | null, b: string | null): number {
  const ka = releaseKey(a)
  const kb = releaseKey(b)
  if (!ka && !kb) return 0
  if (!ka) return 1 // nulls last
  if (!kb) return -1
  return kb.localeCompare(ka)
}

/**
 * Keep policies run after sources + coverage.
 * - all: identity
 * - best: one per species (max k; ties → newest release → annotationId)
 * - latest: one per (species × source) (newest release → annotationId)
 */
export function applyKeep(
  rows: ScoredAnnotation[],
  policy: KeepPolicy,
): ScoredAnnotation[] {
  if (policy === "all" || rows.length <= 1) return rows

  if (policy === "best") {
    const best = new Map<number, ScoredAnnotation>()
    for (const item of rows) {
      const cur = best.get(item.speciesId)
      if (!cur) {
        best.set(item.speciesId, item)
        continue
      }
      if (item.k > cur.k) {
        best.set(item.speciesId, item)
        continue
      }
      if (item.k < cur.k) continue
      // cmpReleaseDesc < 0 ⇒ item is newer than cur (sorts first when desc).
      const rel = cmpReleaseDesc(item.row.releaseDate, cur.row.releaseDate)
      if (rel < 0) {
        best.set(item.speciesId, item)
        continue
      }
      if (rel > 0) continue
      if (item.row.annotationId.localeCompare(cur.row.annotationId) < 0) {
        best.set(item.speciesId, item)
      }
    }
    return [...best.values()]
  }

  // latest per (species × source)
  const best = new Map<string, ScoredAnnotation>()
  for (const item of rows) {
    const key = `${item.speciesId}:${item.row.source}`
    const cur = best.get(key)
    if (!cur) {
      best.set(key, item)
      continue
    }
    const rel = cmpReleaseDesc(item.row.releaseDate, cur.row.releaseDate)
    if (rel < 0) {
      best.set(key, item)
      continue
    }
    if (rel > 0) continue
    if (item.row.annotationId.localeCompare(cur.row.annotationId) < 0) {
      best.set(key, item)
    }
  }
  return [...best.values()]
}

export function matchesSpeciesSearch(
  item: ScoredAnnotation,
  query: string,
  taxonIndex: Map<string, FlatTreeNode>,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.speciesLabel.toLowerCase().includes(q)) return true
  const node = taxonIndex.get(String(item.row.taxid))
  // FlatTreeNode has no common_name in this codebase; search scientific + assembly
  if (node?.scientific_name?.toLowerCase().includes(q)) return true
  const assembly = item.row.assemblyName
  if (assembly && assembly.toLowerCase().includes(q)) return true
  if (item.row.annotationId.toLowerCase().includes(q)) return true
  return false
}

export function applySearch(
  rows: ScoredAnnotation[],
  query: string,
  taxonIndex: Map<string, FlatTreeNode>,
): ScoredAnnotation[] {
  if (!query.trim()) return rows
  return rows.filter((r) => matchesSpeciesSearch(r, query, taxonIndex))
}

/** Nearest ancestor (incl. self) at `rank`, or null. */
export function ancestorAtRank(
  taxid: number,
  rank: string,
  index: Map<string, FlatTreeNode>,
): { id: string; label: string } | null {
  const want = rank.toLowerCase()
  let currentId: string | null = String(taxid)
  while (currentId) {
    const node = index.get(currentId)
    if (!node) break
    if ((node.rank || "").toLowerCase() === want) {
      return {
        id: node.id,
        label: node.scientific_name || node.id,
      }
    }
    currentId = node.parentId
  }
  return null
}

/**
 * Pick Auto group rank: coarsest rank among GENES_VIEW_RANKS that yields
 * between ~4 and ~40 groups when possible; else first usable rank.
 */
export function pickAutoGroupRank(
  rows: ScoredAnnotation[],
  taxonIndex: Map<string, FlatTreeNode>,
): string | null {
  if (rows.length < AUTO_GROUP_MIN_ROWS) return null
  let best: { rank: string; count: number } | null = null
  for (const rank of GENES_VIEW_RANKS) {
    const ids = new Set<string>()
    for (const item of rows) {
      const anc = ancestorAtRank(item.row.taxid, rank, taxonIndex)
      if (anc) ids.add(anc.id)
    }
    if (ids.size < 2) continue
    if (ids.size >= 4 && ids.size <= 40) return rank
    if (!best || Math.abs(ids.size - 12) < Math.abs(best.count - 12)) {
      best = { rank, count: ids.size }
    }
  }
  return best?.rank ?? null
}

export function resolveGroupRank(
  mode: GroupMode,
  rows: ScoredAnnotation[],
  taxonIndex: Map<string, FlatTreeNode>,
): string | null {
  if (mode === "none") return null
  if (mode === "auto") return pickAutoGroupRank(rows, taxonIndex)
  return mode
}

export type PipelineRow =
  | {
      kind: "group"
      id: string
      label: string
      annotationCount: number
      speciesCount: number
    }
  | {
      kind: "annotation"
      item: ScoredAnnotation
      groupId: string | null
    }

function sortItems(
  items: ScoredAnnotation[],
  sort: AnnotationsSort,
): ScoredAnnotation[] {
  const out = [...items]
  out.sort((a, b) => {
    if (sort === "coverage") {
      if (b.k !== a.k) return b.k - a.k
      return a.row.annotationId.localeCompare(b.row.annotationId)
    }
    if (sort === "species") {
      const c = a.speciesLabel.localeCompare(b.speciesLabel)
      if (c !== 0) return c
      return a.row.annotationId.localeCompare(b.row.annotationId)
    }
    if (sort === "release") {
      const rel = cmpReleaseDesc(a.row.releaseDate, b.row.releaseDate)
      if (rel !== 0) return rel
      return a.row.annotationId.localeCompare(b.row.annotationId)
    }
    // source
    if (a.row.source !== b.row.source) return a.row.source - b.row.source
    return a.row.annotationId.localeCompare(b.row.annotationId)
  })
  return out
}

/**
 * Build display rows: optional group headers + annotations.
 * Sort applies inside each group (or globally when ungrouped).
 */
export function buildGroupedRows(
  rows: ScoredAnnotation[],
  groupMode: GroupMode,
  sort: AnnotationsSort,
  taxonIndex: Map<string, FlatTreeNode>,
): PipelineRow[] {
  const rank = resolveGroupRank(groupMode, rows, taxonIndex)
  if (!rank) {
    return sortItems(rows, sort).map((item) => ({
      kind: "annotation" as const,
      item,
      groupId: null,
    }))
  }

  const buckets = new Map<
    string,
    { label: string; items: ScoredAnnotation[]; species: Set<number> }
  >()
  const ungrouped: ScoredAnnotation[] = []

  for (const item of rows) {
    const anc = ancestorAtRank(item.row.taxid, rank, taxonIndex)
    if (!anc) {
      ungrouped.push(item)
      continue
    }
    let bucket = buckets.get(anc.id)
    if (!bucket) {
      bucket = { label: anc.label, items: [], species: new Set() }
      buckets.set(anc.id, bucket)
    }
    bucket.items.push(item)
    bucket.species.add(item.speciesId)
  }

  // Order groups by rank index then label; put ungrouped last
  const groupIds = [...buckets.keys()].sort((a, b) => {
    const la = buckets.get(a)!.label
    const lb = buckets.get(b)!.label
    return la.localeCompare(lb)
  })

  const out: PipelineRow[] = []
  for (const id of groupIds) {
    const bucket = buckets.get(id)!
    const sorted = sortItems(bucket.items, sort)
    out.push({
      kind: "group",
      id,
      label: bucket.label,
      annotationCount: sorted.length,
      speciesCount: bucket.species.size,
    })
    for (const item of sorted) {
      out.push({ kind: "annotation", item, groupId: id })
    }
  }
  for (const item of sortItems(ungrouped, sort)) {
    out.push({ kind: "annotation", item, groupId: null })
  }
  return out
}

export function scoreAnnotations(
  rows: DecodedHitRow[],
  kByAnnotationId: Map<string, number>,
  taxonIndex: Map<string, FlatTreeNode>,
): ScoredAnnotation[] {
  return rows.map((row) => {
    const species = speciesForTaxid(row.taxid, taxonIndex)
    return {
      row,
      k: kByAnnotationId.get(row.annotationId) ?? 0,
      speciesId: species.id,
      speciesLabel: species.label,
    }
  })
}

export { AUTO_GROUP_MIN_ROWS }
