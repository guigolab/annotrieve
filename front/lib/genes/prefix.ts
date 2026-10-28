export const MAX_NAMES_GET = 200
export const MAX_NAMES_POST = 200
export const MAX_TAXIDS = 50

export type NameCategory =
  | "pseudogene"
  | "numbered"
  | "homeolog"
  | "predicted"
  | "exact"
  | "other"

export const NAME_CATEGORY_ORDER: {
  id: NameCategory | "all"
  label: string
}[] = [
  { id: "all", label: "All" },
  { id: "exact", label: "Exact" },
  { id: "numbered", label: "Numbered" },
  { id: "homeolog", label: "Homeolog" },
  { id: "pseudogene", label: "Pseudogene" },
  { id: "predicted", label: "Predicted" },
  { id: "other", label: "Other" },
]

/** Require a prefix stem of at least 3 characters. No trailing `*`. */
export function normalizePrefix(raw: string): { prefix: string } | { error: string } {
  const text = raw.trim()
  if (!text) return { error: "Enter a prefix" }
  const stem = text.endsWith("*") ? text.slice(0, -1).trim() : text
  if (stem.length < 3) return { error: "Prefix needs at least 3 characters" }
  if (stem.includes("*")) return { error: "Use a single trailing *" }
  return { prefix: stem.toLowerCase() }
}
