/** A taxon chosen for include/exclude scoping on the Genes page. */
export interface SelectedTaxon {
  taxid: number
  label: string
}

export function taxidsOf(taxa: SelectedTaxon[]): number[] {
  return taxa.map((t) => t.taxid)
}

/** Build SelectedTaxon list from URL taxids, using labels when available. */
export function taxaFromIds(
  ids: number[],
  labelFor?: (taxid: number) => string | undefined,
): SelectedTaxon[] {
  return ids.map((taxid) => ({
    taxid,
    label: labelFor?.(taxid) ?? String(taxid),
  }))
}

export function sameTaxa(a: SelectedTaxon[], b: SelectedTaxon[]): boolean {
  if (a.length !== b.length) return false
  const ids = new Set(a.map((t) => t.taxid))
  return b.every((t) => ids.has(t.taxid))
}
