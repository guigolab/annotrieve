import type { FlatTreeNode } from "@/lib/api/taxons"
import type { HitKey } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"

const EXCLUDE_TAXIDS = new Set(["root", "131567"])

export interface TaxidGroup {
  taxid: number
  label: string
  count: number
  matchedNames: string[]
  /** source code → count */
  sourceCounts: Map<number, number>
  rows: DecodedHitRow[]
}

/** Nearest species-rank ancestor, or the organism itself when none exists. */
export function speciesForTaxid(
  taxid: number,
  index: Map<string, FlatTreeNode>,
): { id: number; label: string } {
  let currentId: string | null = String(taxid)
  const self = index.get(currentId)
  while (currentId && !EXCLUDE_TAXIDS.has(currentId)) {
    const node = index.get(currentId)
    if (!node) break
    if ((node.rank || "").toLowerCase() === "species") {
      const id = Number(node.id)
      return {
        id: Number.isFinite(id) ? id : taxid,
        label: node.scientific_name || node.id,
      }
    }
    currentId = node.parentId
  }
  return {
    id: taxid,
    label: self?.scientific_name || String(taxid),
  }
}

/** Bucket annotations by species rank. Sort by annotation count, highest first. */
export function groupBySpecies(
  rows: DecodedHitRow[],
  keys: HitKey[],
  index: Map<string, FlatTreeNode>,
): TaxidGroup[] {
  const buckets = new Map<number, { label: string; rows: DecodedHitRow[] }>()
  for (const row of rows) {
    const species = speciesForTaxid(row.taxid, index)
    const bucket = buckets.get(species.id)
    if (bucket) bucket.rows.push(row)
    else buckets.set(species.id, { label: species.label, rows: [row] })
  }

  const groups: TaxidGroup[] = []
  for (const [taxid, bucket] of buckets) {
    const nameSet = new Set<string>()
    const sourceCounts = new Map<number, number>()
    for (const row of bucket.rows) {
      for (const ki of row.matchedKeyIndexes) {
        const key = keys[ki]
        if (key) nameSet.add(key.name)
      }
      sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1)
    }
    groups.push({
      taxid,
      label: bucket.label,
      count: bucket.rows.length,
      matchedNames: [...nameSet].sort((a, b) => a.localeCompare(b)),
      sourceCounts,
      rows: bucket.rows,
    })
  }

  groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return groups
}
