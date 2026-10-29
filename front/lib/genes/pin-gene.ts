import { listAnnotationGenes } from "@/lib/api/xrefs"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  pinIdFor,
  useCompareStore,
  type PinGeneInput,
  type TranscriptPin,
} from "@/lib/genes/compare-store"

export function pinInputFromGene(
  annotationId: string,
  species: string,
  source: number,
  gene: AnnotationGeneRow,
  fallbackName: string,
): PinGeneInput | null {
  if (!gene.seqid) return null
  return {
    annotationId,
    localId: gene.local_id,
    species,
    source,
    geneName: gene.primary_name || fallbackName,
    seqid: gene.seqid,
    geneStart: gene.start,
    geneEnd: gene.end,
    strand: gene.strand ?? ".",
    sourceGeneId: gene.source_gene_id ?? null,
  }
}

/** Name-based match used before localId is known (list pin column). */
export function findPinByGeneName(
  pins: TranscriptPin[],
  annotationId: string,
  geneName: string,
): TranscriptPin | undefined {
  const needle = geneName.toLowerCase()
  return pins.find(
    (p) =>
      p.annotationId === annotationId &&
      p.geneName.toLowerCase() === needle,
  )
}

export function isPinned(
  pins: TranscriptPin[],
  annotationId: string,
  geneName: string,
  localId?: number | null,
): boolean {
  if (localId != null) {
    const id = pinIdFor(annotationId, localId)
    if (pins.some((p) => p.id === id)) return true
  }
  return Boolean(findPinByGeneName(pins, annotationId, geneName))
}

/**
 * Resolve a gene by name in an annotation and toggle its Compare pin.
 */
export async function resolveAndTogglePin(args: {
  annotationId: string
  species: string
  source: number
  geneName: string
}): Promise<
  { status: "pinned" | "unpinned" } | { status: "error"; message: string }
> {
  const store = useCompareStore.getState()
  const existing = findPinByGeneName(
    store.pins,
    args.annotationId,
    args.geneName,
  )
  if (existing) {
    store.unpin(existing.id)
    return { status: "unpinned" }
  }

  try {
    const res = await listAnnotationGenes(args.annotationId, {
      names: [args.geneName],
      limit: 1,
      offset: 0,
    })
    const gene = res.results[0]
    const input = gene
      ? pinInputFromGene(
          args.annotationId,
          args.species,
          args.source,
          gene,
          args.geneName,
        )
      : null
    if (!input) {
      return {
        status: "error",
        message: "Gene not found in this annotation",
      }
    }
    const id = pinIdFor(input.annotationId, input.localId)
    if (store.pins.some((p) => p.id === id)) {
      store.unpin(id)
      return { status: "unpinned" }
    }
    store.togglePin(input)
    return { status: "pinned" }
  } catch {
    return { status: "error", message: "Could not resolve gene" }
  }
}

const RESOLVE_BY_NAME_LIMIT = 50

/** Resolve all gene cards matching a name within an annotation. */
export async function resolveGenesByName(
  annotationId: string,
  geneName: string,
): Promise<AnnotationGeneRow[]> {
  try {
    const res = await listAnnotationGenes(annotationId, {
      names: [geneName],
      limit: RESOLVE_BY_NAME_LIMIT,
      offset: 0,
    })
    return res.results
  } catch {
    return []
  }
}

/** Resolve first local_id for a gene name (drawer drill-in). */
export async function resolveGeneLocalId(
  annotationId: string,
  geneName: string,
): Promise<number | null> {
  const genes = await resolveGenesByName(annotationId, geneName)
  return genes[0]?.local_id ?? null
}
