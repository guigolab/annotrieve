/** Namespace (stored) → CURIE prefix used in /hits requests. */
const NAMESPACE_TO_PREFIX: Record<string, string> = {
  "uniprot/swiss-prot": "swiss-prot",
  "uniprot/trembl": "trembl",
  "imgt/gene-db": "imgt",
}

const MAX_CURIES_GET = 20
const MAX_CURIES_POST = 100

export { MAX_CURIES_GET, MAX_CURIES_POST }

export function namespaceToCuriePrefix(namespace: string): string {
  return NAMESPACE_TO_PREFIX[namespace] ?? namespace
}

export function accessionToCurie(namespace: string, accession: string): string {
  return `${namespaceToCuriePrefix(namespace)}:${accession}`
}

/**
 * Normalize a user token into a CURIE chip.
 * Bare tokens (no colon) become `symbol:<token>`.
 */
export function normalizeCurieToken(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  if (text.includes(":")) {
    const idx = text.indexOf(":")
    const prefix = text.slice(0, idx).trim()
    const accession = text.slice(idx + 1).trim()
    if (!prefix || !accession) return null
    return `${prefix}:${accession}`
  }
  return `symbol:${text}`
}

/** Split paste/input on commas, whitespace, and newlines into CURIE chips. */
export function parseCurieInput(raw: string): string[] {
  const pieces = raw.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const piece of pieces) {
    const curie = normalizeCurieToken(piece)
    if (!curie) continue
    const key = curie.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(curie)
  }
  return out
}

export function mergeCuries(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((c) => c.toLowerCase()))
  const next = [...existing]
  for (const curie of incoming) {
    const key = curie.toLowerCase()
    if (seen.has(key)) continue
    if (next.length >= MAX_CURIES_POST) break
    seen.add(key)
    next.push(curie)
  }
  return next
}

export function formatLocus(seqid: string, start: number, end: number): string {
  return `${seqid}:${start.toLocaleString()}-${end.toLocaleString()}`
}
