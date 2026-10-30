import { create } from "zustand"

export type PinMode = "inspect" | "pin"

export const MAX_PINS = 40

export interface TranscriptPin {
  /** Stable key: `${annotationId}:${localId}` */
  id: string
  annotationId: string
  localId: number
  species: string
  source: number
  geneName: string
  /**
   * Lowercased queried / matched names that identify this pin in the
   * Annotations table (covers alias hits).
   */
  queryNames: string[]
  seqid: string
  geneStart: number
  geneEnd: number
  strand: string
  sourceGeneId: string | null
  /** null = use longest; otherwise a user-picked transcript id */
  transcriptId: string | null
}

export function pinIdFor(annotationId: string, localId: number): string {
  return `${annotationId}:${localId}`
}

export type PinGeneInput = Omit<
  TranscriptPin,
  "id" | "transcriptId" | "queryNames"
> & {
  transcriptId?: string | null
  queryNames?: string[]
}

function normalizeQueryNames(
  input: Pick<PinGeneInput, "geneName" | "queryNames">,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [
    ...(input.queryNames ?? []),
    input.geneName,
  ]) {
    const id = raw.trim().toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function toPin(input: PinGeneInput): TranscriptPin {
  return {
    id: pinIdFor(input.annotationId, input.localId),
    annotationId: input.annotationId,
    localId: input.localId,
    species: input.species,
    source: input.source,
    geneName: input.geneName,
    queryNames: normalizeQueryNames(input),
    seqid: input.seqid,
    geneStart: input.geneStart,
    geneEnd: input.geneEnd,
    strand: input.strand,
    sourceGeneId: input.sourceGeneId,
    transcriptId: input.transcriptId ?? null,
  }
}

interface CompareState {
  pins: TranscriptPin[]
  pinMode: PinMode
  pinGene: (input: PinGeneInput) => boolean
  pinMany: (inputs: PinGeneInput[]) => { added: number; truncated: boolean }
  unpin: (id: string) => void
  unpinMatching: (annotationId: string, name: string) => number
  togglePin: (input: PinGeneInput) => boolean
  setPinTranscript: (id: string, transcriptId: string | null) => void
  setPins: (pins: TranscriptPin[]) => void
  clearPins: () => void
  setPinMode: (mode: PinMode) => void
}

export const useCompareStore = create<CompareState>((set, get) => ({
  pins: [],
  pinMode: "inspect",

  pinGene: (input) => {
    const id = pinIdFor(input.annotationId, input.localId)
    const { pins } = get()
    if (pins.some((p) => p.id === id)) return true
    if (pins.length >= MAX_PINS) return false
    set({ pins: [...pins, toPin(input)] })
    return true
  },

  pinMany: (inputs) => {
    const { pins } = get()
    const byId = new Map(pins.map((p) => [p.id, p]))
    let added = 0
    let truncated = false
    for (const input of inputs) {
      const id = pinIdFor(input.annotationId, input.localId)
      if (byId.has(id)) continue
      if (byId.size >= MAX_PINS) {
        truncated = true
        break
      }
      byId.set(id, toPin(input))
      added += 1
    }
    if (added > 0) set({ pins: [...byId.values()] })
    return { added, truncated }
  },

  unpin: (id) => {
    set({ pins: get().pins.filter((p) => p.id !== id) })
  },

  unpinMatching: (annotationId, name) => {
    const needle = name.trim().toLowerCase()
    const before = get().pins
    const next = before.filter((p) => {
      if (p.annotationId !== annotationId) return true
      if (p.geneName.toLowerCase() === needle) return false
      return !p.queryNames.some((n) => n === needle)
    })
    const removed = before.length - next.length
    if (removed > 0) set({ pins: next })
    return removed
  },

  togglePin: (input) => {
    const id = pinIdFor(input.annotationId, input.localId)
    if (get().pins.some((p) => p.id === id)) {
      get().unpin(id)
      return true
    }
    return get().pinGene(input)
  },

  setPinTranscript: (id, transcriptId) => {
    set({
      pins: get().pins.map((p) =>
        p.id === id ? { ...p, transcriptId } : p,
      ),
    })
  },

  setPins: (pins) => set({ pins: [...pins] }),

  clearPins: () => set({ pins: [] }),

  setPinMode: (mode) => set({ pinMode: mode }),
}))
