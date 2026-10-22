import type { HitsResponse } from "@/lib/api/xrefs-types"
import { decodeHitsRows } from "@/lib/genes/hits"

export const MAX_NAMES_GET = 50
export const MAX_NAMES_POST = 200
export const MAX_TAXIDS = 50

/** Displayed cap: 50 until the list passes the GET limit, then 200. */
export function namesCap(count: number): number {
  return count > MAX_NAMES_GET ? MAX_NAMES_POST : MAX_NAMES_GET
}

export interface ExpandedNameCount {
  name: string
  count: number
  /** Annotation counts per source code, sorted by code. */
  sources: { code: number; count: number }[]
}

/**
 * Expanded accessions that match at least one annotation.
 * Count is annotations whose matched keys include that name (any namespace),
 * split by source.
 */
export function expandedNameCounts(hits: HitsResponse): ExpandedNameCount[] {
  const expanded = hits.terms?.[0]?.expanded ?? []
  const indexesByName = new Map<string, number[]>()
  hits.keys.forEach((key, index) => {
    const id = key.name.toLowerCase()
    const list = indexesByName.get(id) ?? []
    list.push(index)
    indexesByName.set(id, list)
  })

  const rows = decodeHitsRows(hits.rows ?? [])
  const out: ExpandedNameCount[] = []
  for (const name of expanded) {
    const indexes = indexesByName.get(name.toLowerCase()) ?? []
    if (!indexes.length) continue
    const set = new Set(indexes)
    const bySource = new Map<number, number>()
    let n = 0
    for (const row of rows) {
      if (!row.matchedKeyIndexes.some((ki) => set.has(ki))) continue
      n++
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + 1)
    }
    if (n <= 0) continue
    out.push({
      name,
      count: n,
      sources: [...bySource.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => a.code - b.code),
    })
  }

  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return out
}

export type PrefixBucket =
  | "pseudogene"
  | "numbered"
  | "homeolog"
  | "predicted"
  | "exact"
  | "other"

/** Classify an expanded accession. First matching rule wins. */
export function classifyPrefixName(name: string): PrefixBucket {
  const text = name.toLowerCase()
  if (text.includes(".ps") || /[-_]ps/.test(text)) return "pseudogene"
  if (/[_-]\d/.test(text)) return "numbered"
  if (/\.[a-z0-9]/.test(text)) return "homeolog"
  if (text.includes("predicted")) return "predicted"
  if (!/[._-]/.test(text)) return "exact"
  return "other"
}

export const PREFIX_BUCKETS: { id: PrefixBucket | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "exact", label: "Exact" },
  { id: "numbered", label: "Numbered" },
  { id: "homeolog", label: "Homeolog" },
  { id: "pseudogene", label: "Pseudogene" },
  { id: "predicted", label: "Predicted" },
  { id: "other", label: "Other" },
]

export interface NameAnnotationStats {
  total: number
  /** Source code → annotation count. */
  sources: Map<number, number>
}

/** Annotation counts keyed by lowercased accession name. */
export function annotationCountsByName(
  rows: { matchedKeyIndexes: number[]; source: number }[],
  keys: { name: string }[],
): Map<string, NameAnnotationStats> {
  const out = new Map<string, NameAnnotationStats>()
  for (const row of rows) {
    const seen = new Set<string>()
    for (const ki of row.matchedKeyIndexes) {
      const name = keys[ki]?.name
      if (!name) continue
      const id = name.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      let stats = out.get(id)
      if (!stats) {
        stats = { total: 0, sources: new Map() }
        out.set(id, stats)
      }
      stats.total += 1
      stats.sources.set(row.source, (stats.sources.get(row.source) ?? 0) + 1)
    }
  }
  return out
}

/** Require a prefix stem of at least 3 characters. Append `*` when missing. */
export function normalizePrefix(raw: string): { prefix: string } | { error: string } {
  const text = raw.trim()
  if (!text) return { error: "Enter a prefix" }
  const withStar = text.endsWith("*") ? text : `${text}*`
  const stem = withStar.slice(0, -1).trim()
  if (stem.length < 3) return { error: "Prefix needs at least 3 characters" }
  if (stem.includes("*")) return { error: "Use a single trailing *" }
  return { prefix: withStar }
}
