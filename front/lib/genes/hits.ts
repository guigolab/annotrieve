import type { HitKey, HitsResponse, HitsRow } from "@/lib/api/xrefs-types"
import type { DatabaseName } from "@/lib/constants/annotation-sources"
import { DATABASE_COLORS } from "@/lib/constants/annotation-sources"

export interface DecodedHitRow {
  annotationId: string
  taxid: number
  source: number
  nMatched: number
  matchedKeyIndexes: number[]
}

export function decodeHitsRows(rows: HitsRow[]): DecodedHitRow[] {
  return rows.map(([annotationId, taxid, source, nMatched, matched]) => ({
    annotationId,
    taxid,
    source,
    nMatched,
    matchedKeyIndexes: matched ?? [],
  }))
}

export function sortHitRows(rows: DecodedHitRow[]): DecodedHitRow[] {
  return [...rows].sort((a, b) => {
    if (b.nMatched !== a.nMatched) return b.nMatched - a.nMatched
    return a.annotationId.localeCompare(b.annotationId)
  })
}

/** Keep rows whose matched keys include at least one key for ``termIndex``. */
export function filterRowsByTerm(
  rows: DecodedHitRow[],
  keys: HitKey[],
  termIndex: number | null,
): DecodedHitRow[] {
  if (termIndex === null) return rows
  return rows.filter((row) =>
    row.matchedKeyIndexes.some((ki) => keys[ki]?.term === termIndex),
  )
}

export function prepareHitRows(
  hits: HitsResponse | null | undefined,
  activeTerm: number | null,
): DecodedHitRow[] {
  if (!hits) return []
  const decoded = decodeHitsRows(hits.rows ?? [])
  return sortHitRows(filterRowsByTerm(decoded, hits.keys ?? [], activeTerm))
}

const SOURCE_CODE_TO_DB: Record<number, DatabaseName> = {
  1: "Ensembl",
  2: "GenBank",
  3: "RefSeq",
}

export function sourceLabel(
  code: number,
  sources?: Record<string, { label: string }>,
): string {
  const fromPayload = sources?.[String(code)]?.label
  if (fromPayload) return fromPayload
  return SOURCE_CODE_TO_DB[code] ?? "Other"
}

export function sourceColor(code: number): string {
  const name = SOURCE_CODE_TO_DB[code]
  if (name) return DATABASE_COLORS[name]
  return "#94a3b8"
}

export function resolveMatchedKeys(
  matchedKeyIndexes: number[],
  keys: HitKey[],
): HitKey[] {
  return matchedKeyIndexes
    .map((i) => keys[i])
    .filter((k): k is HitKey => Boolean(k))
}
