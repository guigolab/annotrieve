import { GENES_VIEW_RANKS } from "@/lib/genes/tree"

/** Keep / dedupe policy for the Annotations list. */
export const KEEP_POLICIES = ["all", "best", "latest"] as const
export type KeepPolicy = (typeof KEEP_POLICIES)[number]
export const DEFAULT_KEEP: KeepPolicy = "all"

/** Group header mode. */
export type GroupMode = "auto" | "none" | (typeof GENES_VIEW_RANKS)[number]
export const DEFAULT_GROUP: GroupMode = "none"

/** Sort key inside each group (or the whole list when Group is none). */
export const SORT_KEYS = [
  "coverage",
  "species",
  "release",
  "source",
] as const
export type AnnotationsSort = (typeof SORT_KEYS)[number]
export const DEFAULT_SORT: AnnotationsSort = "coverage"

/** Auto group headers only when the filtered (pre-group) row count is ≥ this. */
export const AUTO_GROUP_MIN_ROWS = 50

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

export function parseAnnotationsSort(
  raw: string | null | undefined,
): AnnotationsSort | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  return (SORT_KEYS as readonly string[]).includes(v)
    ? (v as AnnotationsSort)
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
