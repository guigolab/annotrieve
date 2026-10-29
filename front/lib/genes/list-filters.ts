/** Gene name match mode when multiple includeNames are set. */
export type NameMatchMode = "any" | "all"

export interface ListFilterCell {
  taxid: string
  gene: string
}

/**
 * Include-only list filters applied on the Annotations view after
 * Distribution "Show only". Dimensions AND together; values OR within
 * a dimension (except names honour nameMatch).
 */
export interface GenesListFilters {
  includeTaxids: string[]
  includeNames: string[]
  nameMatch: NameMatchMode
  includeCells: ListFilterCell[]
  /** Memory-only annotation-id include (table Show only). */
  includeAnnotationIds: string[]
}

export const EMPTY_LIST_FILTERS: GenesListFilters = {
  includeTaxids: [],
  includeNames: [],
  nameMatch: "any",
  includeCells: [],
  includeAnnotationIds: [],
}

export function listFiltersIsEmpty(f: GenesListFilters): boolean {
  return (
    f.includeTaxids.length === 0 &&
    f.includeNames.length === 0 &&
    f.includeCells.length === 0 &&
    f.includeAnnotationIds.length === 0
  )
}

/**
 * Single subject gene for list-row pin (§7.2): genes filter narrowed to one,
 * else exactly one active gene.
 */
export function subjectGeneName(
  listFilters: GenesListFilters,
  activeNames: string[],
): string | null {
  if (listFilters.includeNames.length === 1) {
    return listFilters.includeNames[0]!
  }
  if (activeNames.length === 1) return activeNames[0]!
  return null
}

export function parseNameMatch(
  raw: string | null | undefined,
): NameMatchMode {
  return raw?.trim().toLowerCase() === "all" ? "all" : "any"
}

/** Encode cells as `taxid:gene` pairs (gene may contain colons → join rest). */
export function encodeListFilterCells(cells: ListFilterCell[]): string {
  return cells
    .map((c) => `${c.taxid}:${c.gene}`)
    .join(",")
}

export function parseListFilterCells(
  raw: string | null | undefined,
): ListFilterCell[] {
  if (!raw?.trim()) return []
  const out: ListFilterCell[] = []
  for (const part of raw.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    if (colon <= 0) continue
    const taxid = trimmed.slice(0, colon).trim()
    const gene = trimmed.slice(colon + 1).trim()
    if (!taxid || !gene) continue
    out.push({ taxid, gene })
  }
  return out
}

export function parseCommaList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Cap for writing `c` to the URL (pairs beyond this stay in memory only). */
export const LIST_FILTER_CELLS_URL_CAP = 100
