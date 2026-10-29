import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import {
  partitionTokens,
  prefixTokensOnly,
  tokenizeGeneQuery,
  uniqueNames,
} from "@/lib/genes/tokenize"

export type OpenPrefixMode = "prefix-token" | "bare-stem" | "empty"

export interface OpenPrefixPlan {
  mode: OpenPrefixMode
  /** Seed for the prefix sheet input (no trailing `*`). */
  seed: string
  /** Exact names to commit before opening (only when mode is prefix-token). */
  exactToCommit: string[]
  /** Text left in the add-genes input after opening. */
  leaveQueryText: string
}

/**
 * Decide how Prefix… / opening the prefix sheet should behave for a draft.
 *
 * - `*` present → commit exacts, leave prefix tokens, seed = first prefix stem.
 * - bare stems only → do not commit; seed = first token stem; leave draft as-is.
 * - empty → open with empty seed.
 */
export function planOpenPrefix(queryText: string): OpenPrefixPlan {
  const tokens = tokenizeGeneQuery(queryText)
  if (!tokens.length) {
    return {
      mode: "empty",
      seed: "",
      exactToCommit: [],
      leaveQueryText: "",
    }
  }

  const { exact, prefixes } = partitionTokens(tokens)
  if (prefixes.length) {
    const seed = prefixes[0]!.replace(/\*+$/, "").trim()
    return {
      mode: "prefix-token",
      seed,
      exactToCommit: uniqueNames(exact, MAX_NAMES_GET),
      leaveQueryText: prefixTokensOnly(queryText),
    }
  }

  const first = tokens[0]!.replace(/\*+$/, "").trim()
  return {
    mode: "bare-stem",
    seed: first,
    exactToCommit: [],
    leaveQueryText: queryText,
  }
}

/** Chip / Scope label for include + exclude taxa. */
export function formatScopeSummary(
  include: SelectedTaxon[],
  exclude: SelectedTaxon[],
): string {
  if (!include.length && !exclude.length) return "All eukaryotes"
  const parts: string[] = []
  for (const t of include) parts.push(t.label)
  for (const t of exclude) parts.push(`−${t.label}`)
  return parts.join(", ")
}

export interface GeneSetEditorRow {
  name: string
  id: string
  count: number
  viaAlias: boolean
  zeroHits: boolean
}

/**
 * Rows for the gene set editor: one per committed name, sorted by annotation
 * count descending with zero-hit names last.
 */
export function buildGeneSetEditorRows(
  queryNames: string[],
  hitTerms: HitTerm[],
  activeTerms: ResolvedTerm[],
): GeneSetEditorRow[] {
  const byResolved = new Map(activeTerms.map((t) => [t.id, t]))
  const byHit = new Map(
    hitTerms.map((t) => [t.name.toLowerCase(), t] as const),
  )
  const byInput = new Map(
    hitTerms.map((t) => [t.input.toLowerCase(), t] as const),
  )

  const rows: GeneSetEditorRow[] = queryNames.map((name) => {
    const id = name.toLowerCase()
    const resolved = byResolved.get(id)
    const hit = byHit.get(id) ?? byInput.get(id)
    const count = resolved?.count ?? hit?.n_hits ?? 0
    return {
      name: resolved?.name ?? hit?.name ?? name,
      id,
      count,
      viaAlias: resolved?.viaAlias ?? hit?.namespaces.includes("alias") ?? false,
      zeroHits: count <= 0,
    }
  })

  rows.sort((a, b) => {
    if (a.zeroHits !== b.zeroHits) return a.zeroHits ? 1 : -1
    if (b.count !== a.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })
  return rows
}

/** Summary chip label: up to `maxInline` names, then `+N`. */
export function formatGeneSetChipLabel(
  names: string[],
  maxInline = 3,
): string {
  if (!names.length) return "Genes"
  if (names.length <= maxInline) return names.join(", ")
  const head = names.slice(0, maxInline).join(", ")
  return `${head} +${names.length - maxInline}`
}
