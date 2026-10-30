import { listAnnotationGenes } from "@/lib/api/xrefs"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  pinIdFor,
  useCompareStore,
  type PinGeneInput,
  type TranscriptPin,
} from "@/lib/genes/compare-store"

function uniqueLower(names: Iterable<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const id = raw.trim().toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function pinKey(annotationId: string, geneName: string): string {
  return `${annotationId}\0${geneName.trim().toLowerCase()}`
}

/** Every annotationId×name key that should light up as pinned in the table. */
export function pinnedKeys(pins: TranscriptPin[]): Set<string> {
  const keys = new Set<string>()
  for (const pin of pins) {
    keys.add(pinKey(pin.annotationId, pin.geneName))
    for (const name of pin.queryNames) {
      keys.add(pinKey(pin.annotationId, name))
    }
  }
  return keys
}

/** Count of pinned genes per annotation id. */
export function pinCountByAnnotation(
  pins: TranscriptPin[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const pin of pins) {
    counts.set(pin.annotationId, (counts.get(pin.annotationId) ?? 0) + 1)
  }
  return counts
}

export function pinInputFromGene(
  annotationId: string,
  species: string,
  source: number,
  gene: AnnotationGeneRow,
  fallbackName: string,
): PinGeneInput | null {
  if (!gene.seqid) return null
  const geneName = gene.primary_name || fallbackName
  const queryNames = uniqueLower([
    ...(gene.matches?.map((m) => m.input) ?? []),
    geneName,
    fallbackName,
  ])
  return {
    annotationId,
    localId: gene.local_id,
    species,
    source,
    geneName,
    queryNames,
    seqid: gene.seqid,
    geneStart: gene.start,
    geneEnd: gene.end,
    strand: gene.strand ?? ".",
    sourceGeneId: gene.source_gene_id ?? null,
  }
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

function pinMatchesName(pin: TranscriptPin, needle: string): boolean {
  if (nameKey(pin.geneName) === needle) return true
  return pin.queryNames.some((n) => n === needle)
}

/** Name-based match used before localId is known (list pin column). */
export function findPinByGeneName(
  pins: TranscriptPin[],
  annotationId: string,
  geneName: string,
): TranscriptPin | undefined {
  const needle = nameKey(geneName)
  if (!needle) return undefined
  return pins.find(
    (p) => p.annotationId === annotationId && pinMatchesName(p, needle),
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

export interface ResolveGenesForNamesResult {
  /** First gene with a locus, keyed by lowercased queried name. */
  byName: Map<string, AnnotationGeneRow>
  /** Queried names that matched more than one gene. */
  ambiguousNames: string[]
  /** Queried names with no match (or no seqid). */
  missingNames: string[]
}

/**
 * Resolve many gene names in one annotation with a single request.
 * Groups rows by matches[].input so aliases map back to the queried name.
 */
export async function resolveGenesForNames(
  annotationId: string,
  names: string[],
  init?: RequestInit,
): Promise<ResolveGenesForNamesResult> {
  const unique = uniqueLower(names)
  const byName = new Map<string, AnnotationGeneRow>()
  const ambiguousNames: string[] = []
  const missingNames: string[] = []
  if (!unique.length) {
    return { byName, ambiguousNames, missingNames }
  }

  const res = await listAnnotationGenes(
    annotationId,
    {
      names: unique,
      limit: Math.min(200, Math.max(unique.length * 10, unique.length)),
      offset: 0,
    },
    init,
  )

  const groups = new Map<string, AnnotationGeneRow[]>()
  for (const gene of res.results) {
    const inputs = uniqueLower([
      ...(gene.matches?.map((m) => m.input) ?? []),
      gene.primary_name ?? "",
    ])
    for (const input of inputs) {
      if (!unique.includes(input)) continue
      const list = groups.get(input) ?? []
      list.push(gene)
      groups.set(input, list)
    }
  }

  for (const name of unique) {
    const rows = groups.get(name) ?? []
    const withLocus = rows.filter((g) => Boolean(g.seqid))
    if (!withLocus.length) {
      missingNames.push(name)
      continue
    }
    if (withLocus.length > 1) ambiguousNames.push(name)
    byName.set(name, withLocus[0]!)
  }

  return { byName, ambiguousNames, missingNames }
}

export type PinTarget = {
  annotationId: string
  species: string
  source: number
  geneNames: string[]
}

export type ResolveAndPinManyResult = {
  pinned: number
  missing: string[]
  ambiguous: number
  truncated: boolean
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i]!)
      }
    },
  )
  await Promise.all(workers)
  return results
}

/**
 * Resolve and pin many annotation×gene targets. One request per annotation.
 */
export async function resolveAndPinMany(
  targets: PinTarget[],
): Promise<ResolveAndPinManyResult> {
  const missing: string[] = []
  let ambiguous = 0
  const inputs: PinGeneInput[] = []

  await mapPool(targets, 4, async (target) => {
    if (!target.geneNames.length) return
    try {
      const resolved = await resolveGenesForNames(
        target.annotationId,
        target.geneNames,
      )
      ambiguous += resolved.ambiguousNames.length
      for (const name of resolved.missingNames) {
        missing.push(`${target.annotationId}:${name}`)
      }
      for (const [name, gene] of resolved.byName) {
        const input = pinInputFromGene(
          target.annotationId,
          target.species,
          target.source,
          gene,
          name,
        )
        if (input) inputs.push(input)
        else missing.push(`${target.annotationId}:${name}`)
      }
    } catch {
      for (const name of uniqueLower(target.geneNames)) {
        missing.push(`${target.annotationId}:${name}`)
      }
    }
  })

  const { added, truncated } = useCompareStore.getState().pinMany(inputs)
  return { pinned: added, missing, ambiguous, truncated }
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
  | { status: "pinned"; ambiguous: number }
  | { status: "unpinned"; removed: number }
  | { status: "error"; message: string }
> {
  const store = useCompareStore.getState()
  const existing = findPinByGeneName(
    store.pins,
    args.annotationId,
    args.geneName,
  )
  if (existing) {
    const removed = store.unpinMatching(args.annotationId, args.geneName)
    return { status: "unpinned", removed }
  }

  try {
    const resolved = await resolveGenesForNames(args.annotationId, [
      args.geneName,
    ])
    const gene = resolved.byName.get(nameKey(args.geneName))
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
      return { status: "unpinned", removed: 1 }
    }
    const ok = store.pinGene(input)
    if (!ok) {
      return {
        status: "error",
        message: `Pin limit reached (${store.pins.length})`,
      }
    }
    return {
      status: "pinned",
      ambiguous: resolved.ambiguousNames.length,
    }
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
