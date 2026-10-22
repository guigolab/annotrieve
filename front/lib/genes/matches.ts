import type { GeneMatch } from "@/lib/api/xrefs-types"

export interface MatchChip {
  /** Distinct query term that produced this hit. */
  input: string
  /** Matched accession / symbol. */
  name: string
  ns: string
  /** True when the chip should show `input → name`. */
  showMapping: boolean
}

export interface GroupedMatches {
  chips: MatchChip[]
  /** Distinct query `input` values. */
  distinctInputs: string[]
  /** True when two or more distinct query terms resolve to this gene. */
  multiKey: boolean
}

function sameToken(a: string, b: string): boolean {
  const left = a.replace(/\*$/, "").toLowerCase()
  const right = b.replace(/\*$/, "").toLowerCase()
  return left === right
}

/**
 * Deduplicate matches and detect when multiple query terms hit one gene.
 * Chips are ordered by first appearance of the query input, then name.
 */
export function groupMatches(matches: GeneMatch[] | undefined | null): GroupedMatches {
  if (!matches?.length) {
    return { chips: [], distinctInputs: [], multiKey: false }
  }

  const chips: MatchChip[] = []
  const seenChip = new Set<string>()
  const inputOrder: string[] = []
  const seenInput = new Set<string>()

  for (const match of matches) {
    const input = match.input?.trim() || match.name
    const name = match.name?.trim() || input
    const ns = match.ns || "symbol"
    const inputKey = input.toLowerCase()
    if (!seenInput.has(inputKey)) {
      seenInput.add(inputKey)
      inputOrder.push(input)
    }
    const chipKey = `${ns.toLowerCase()}\0${name.toLowerCase()}\0${inputKey}`
    if (seenChip.has(chipKey)) continue
    seenChip.add(chipKey)
    chips.push({
      input,
      name,
      ns,
      showMapping: !sameToken(input, name),
    })
  }

  return {
    chips,
    distinctInputs: inputOrder,
    multiKey: inputOrder.length > 1,
  }
}
