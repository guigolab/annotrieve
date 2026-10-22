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

/** Deduplicate names (case-insensitive) up to the UI gene-set cap (50). */
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
