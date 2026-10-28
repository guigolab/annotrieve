import { MAX_NAMES_GET } from "@/lib/genes/prefix"

/** Split a free-text gene query into trimmed tokens. */
export function tokenizeGeneQuery(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .map((tok) => tok.trim())
    .filter(Boolean)
}

export function partitionTokens(tokens: string[]): {
  exact: string[]
  prefixes: string[]
} {
  const exact: string[] = []
  const prefixes: string[] = []
  for (const tok of tokens) {
    if (tok.includes("*")) prefixes.push(tok)
    else exact.push(tok)
  }
  return { exact, prefixes }
}

/** Deduplicate names (case-insensitive) up to the UI gene-set cap (MAX_NAMES_GET). */
export function uniqueNames(names: string[], limit = MAX_NAMES_GET): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw.trim()
    if (!name || name.includes("*")) continue
    const id = name.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    next.push(name)
    if (next.length >= limit) break
  }
  return next
}

/** Append incoming exact names onto an existing gene set (deduped, capped). */
export function mergeGeneNames(
  existing: string[],
  incoming: string[],
  limit = MAX_NAMES_GET,
): string[] {
  return uniqueNames([...existing, ...incoming], limit)
}

/**
 * Drop exclusion keys that no longer correspond to a name in the gene set.
 */
export function pruneExcludedToNames(
  excluded: Set<string>,
  names: string[],
): Set<string> {
  if (!excluded.size) return excluded
  const keep = new Set(names.map((n) => n.toLowerCase()))
  let changed = false
  const next = new Set<string>()
  for (const id of excluded) {
    if (keep.has(id)) next.add(id)
    else changed = true
  }
  return changed ? next : excluded
}

/**
 * When the query contains a prefix (`*`), return the exact names that must be
 * committed before opening the prefix sheet so Cancel does not drop them.
 */
export function exactNamesBeforePrefixSheet(
  queryText: string,
  limit = MAX_NAMES_GET,
): string[] | null {
  const { exact, prefixes } = partitionTokens(tokenizeGeneQuery(queryText))
  if (!prefixes.length) return null
  return uniqueNames(exact, limit)
}

/** Prefix tokens only — used to leave prefixes in the input after committing exacts. */
export function prefixTokensOnly(queryText: string): string {
  const { prefixes } = partitionTokens(tokenizeGeneQuery(queryText))
  return prefixes.join(", ")
}
