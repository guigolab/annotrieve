import { GENES_VIEW_RANKS } from "@/lib/genes/tree"

/** Keep / dedupe policy for the Annotations list. */
export const KEEP_POLICIES = ["all", "best", "latest"] as const
export type KeepPolicy = (typeof KEEP_POLICIES)[number]
export const DEFAULT_KEEP: KeepPolicy = "all"

/** Group header mode. */
export type GroupMode = "auto" | "none" | (typeof GENES_VIEW_RANKS)[number]
export const DEFAULT_GROUP: GroupMode = "none"

/** Sort key inside each group (or the whole list when Group is none). */
export const SORT_KEYS = ["coverage", "species", "release"] as const
export type AnnotationsSort = (typeof SORT_KEYS)[number]
export const DEFAULT_SORT: AnnotationsSort = "coverage"

export const SORT_DIRS = ["asc", "desc"] as const
export type AnnotationsSortDir = (typeof SORT_DIRS)[number]
export const DEFAULT_SORT_DIR: AnnotationsSortDir = "desc"

/** Auto group headers only when the filtered (pre-group) row count is ≥ this. */
export const AUTO_GROUP_MIN_ROWS = 50

/** First-click direction when activating a column. */
export function primarySortDir(key: AnnotationsSort): AnnotationsSortDir {
  return key === "species" ? "asc" : "desc"
}

export function oppositeSortDir(dir: AnnotationsSortDir): AnnotationsSortDir {
  return dir === "asc" ? "desc" : "asc"
}

export interface AnnotationsSortState {
  sort: AnnotationsSort | null
  sortDir: AnnotationsSortDir
}

/** Three-state column cycle: inactive → primary → opposite → none. */
export function cycleAnnotationsSort(
  current: AnnotationsSortState,
  clicked: AnnotationsSort,
): AnnotationsSortState {
  if (current.sort !== clicked) {
    return { sort: clicked, sortDir: primarySortDir(clicked) }
  }
  const primary = primarySortDir(clicked)
  if (current.sortDir === primary) {
    return { sort: clicked, sortDir: oppositeSortDir(primary) }
  }
  return { sort: null, sortDir: DEFAULT_SORT_DIR }
}

export function isDefaultAnnotationsSort(
  sort: AnnotationsSort | null,
  sortDir: AnnotationsSortDir,
): boolean {
  return sort === DEFAULT_SORT && sortDir === DEFAULT_SORT_DIR
}

export function parseKeepPolicy(
  raw: string | null | undefined,
): KeepPolicy | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return (KEEP_POLICIES as readonly string[]).includes(v)
    ? (v as KeepPolicy)
    : null
}

export function parseGroupMode(
  raw: string | null | undefined,
): GroupMode | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v === "auto" || v === "none") return v
  if ((GENES_VIEW_RANKS as readonly string[]).includes(v)) {
    return v as GroupMode
  }
  return null
}

/**
 * Parse sort key. `none` → null (explicit no-sort).
 * Unknown / empty → null (caller treats missing URL param as default separately).
 */
export function parseAnnotationsSort(
  raw: string | null | undefined,
): AnnotationsSort | null | undefined {
  if (raw == null || raw === "") return undefined
  const v = raw.trim().toLowerCase()
  if (v === "none") return null
  return (SORT_KEYS as readonly string[]).includes(v)
    ? (v as AnnotationsSort)
    : undefined
}

export function parseAnnotationsSortDir(
  raw: string | null | undefined,
): AnnotationsSortDir | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return (SORT_DIRS as readonly string[]).includes(v)
    ? (v as AnnotationsSortDir)
    : null
}

/** Has shortcut derived from coverage window. */
export type HasMode = "any" | "all" | "custom"

export function hasModeFromCoverage(
  minMatched: number,
  maxMatched: number,
  termCount: number,
): HasMode {
  const n = Math.max(0, termCount)
  if (n <= 0) return "any"
  if (minMatched <= 1 && maxMatched >= n) return "any"
  if (minMatched >= n && maxMatched >= n) return "all"
  return "custom"
}
