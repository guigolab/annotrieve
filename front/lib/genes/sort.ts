import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import { groupMatches } from "@/lib/genes/matches"

/**
 * Sort genes by number of distinct matching query terms (desc), then by
 * raw match count, primary name, and local_id.
 */
export function compareGenesByMatches(
  a: AnnotationGeneRow,
  b: AnnotationGeneRow,
): number {
  const ga = groupMatches(a.matches)
  const gb = groupMatches(b.matches)
  if (gb.distinctInputs.length !== ga.distinctInputs.length) {
    return gb.distinctInputs.length - ga.distinctInputs.length
  }
  const ma = a.matches?.length ?? 0
  const mb = b.matches?.length ?? 0
  if (mb !== ma) return mb - ma
  const nameA = (a.primary_name || "").toLowerCase()
  const nameB = (b.primary_name || "").toLowerCase()
  if (nameA !== nameB) return nameA.localeCompare(nameB)
  return a.local_id - b.local_id
}

export function sortGenesByMatches(
  genes: AnnotationGeneRow[],
): AnnotationGeneRow[] {
  return [...genes].sort(compareGenesByMatches)
}
