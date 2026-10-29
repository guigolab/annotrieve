import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"

/** Stable locus key: seqid|start|end|strand */
export function locusKey(gene: Pick<
  AnnotationGeneRow,
  "seqid" | "start" | "end" | "strand"
>): string {
  const strand = gene.strand === "+" || gene.strand === "-" ? gene.strand : "."
  return `${gene.seqid ?? ""}|${gene.start}|${gene.end}|${strand}`
}

/** Genes sharing the exact locus of `localId` (including itself). */
export function locusSiblings(
  genes: AnnotationGeneRow[],
  localId: number,
): AnnotationGeneRow[] {
  const active = genes.find((g) => g.local_id === localId)
  if (!active) return []
  const key = locusKey(active)
  return genes.filter((g) => locusKey(g) === key)
}

/** Short label for sibling chooser (strip `gene:` prefix). */
export function shortGeneId(gene: AnnotationGeneRow): string {
  const raw = gene.source_gene_id?.trim()
  if (!raw) return `id ${gene.local_id}`
  return raw.replace(/^gene:/i, "")
}
