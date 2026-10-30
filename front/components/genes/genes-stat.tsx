/** Shared count-line formatter for Genes views. */
export function formatGenesStat(
  annotations: number,
  species: number,
  opts?: {
    speciesLabel?: "species" | "organisms"
    ofTotal?: number
  },
): string {
  const speciesLabel = opts?.speciesLabel ?? "species"
  const base = `${annotations.toLocaleString()} annotations · ${species.toLocaleString()} ${speciesLabel}`
  if (opts?.ofTotal != null && opts.ofTotal > annotations) {
    return `${base} (of ${opts.ofTotal.toLocaleString()})`
  }
  return base
}
