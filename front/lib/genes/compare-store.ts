import { create } from "zustand"

export type TranscriptMode = "longest" | "choose"

export interface TranscriptPin {
  /** Stable key: `${annotationId}:${localId}` */
  id: string
  annotationId: string
  localId: number
  species: string
  source: number
  geneName: string
  seqid: string
  geneStart: number
  geneEnd: number
  strand: string
  sourceGeneId: string | null
  /** null until GFF resolves; then longest or user pick */
  transcriptId: string | null
}

export function pinIdFor(annotationId: string, localId: number): string {
  return `${annotationId}:${localId}`
}

export type PinGeneInput = Omit<TranscriptPin, "id" | "transcriptId"> & {
  transcriptId?: string | null
}

interface CompareState {
  pins: TranscriptPin[]
  transcriptMode: TranscriptMode
  pinGene: (input: PinGeneInput) => boolean
  unpin: (id: string) => void
  togglePin: (input: PinGeneInput) => boolean
  setPinTranscript: (id: string, transcriptId: string) => void
  setPins: (pins: TranscriptPin[]) => void
  clearPins: () => void
  setTranscriptMode: (mode: TranscriptMode) => void
}

export const useCompareStore = create<CompareState>((set, get) => ({
  pins: [],
  transcriptMode: "longest",

  pinGene: (input) => {
    const id = pinIdFor(input.annotationId, input.localId)
    const { pins } = get()
    if (pins.some((p) => p.id === id)) return true
    const pin: TranscriptPin = {
      id,
      annotationId: input.annotationId,
      localId: input.localId,
      species: input.species,
      source: input.source,
      geneName: input.geneName,
      seqid: input.seqid,
      geneStart: input.geneStart,
      geneEnd: input.geneEnd,
      strand: input.strand,
      sourceGeneId: input.sourceGeneId,
      transcriptId: input.transcriptId ?? null,
    }
    set({ pins: [...pins, pin] })
    return true
  },

  unpin: (id) => {
    set({ pins: get().pins.filter((p) => p.id !== id) })
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

  setTranscriptMode: (mode) => {
    if (mode === "longest") {
      set({
        transcriptMode: mode,
        pins: get().pins.map((p) => ({ ...p, transcriptId: null })),
      })
      return
    }
    set({ transcriptMode: mode })
  },
}))
