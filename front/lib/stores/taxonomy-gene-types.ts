import { create } from "zustand"

export type GeneType = "coding" | "non_coding" | "pseudogene"
export type TranscriptType = "mRNA" | "lncRNA" | "tRNA" | "miRNA"
export type BuscoType = "single_copy" | "duplicated" | "fragmented" | "missing"

export type StackMode = "genes" | "transcripts" | "busco"

const ALL_GENE_TYPES: GeneType[] = ["coding", "non_coding", "pseudogene"]
const ALL_TRANSCRIPT_TYPES: TranscriptType[] = ["mRNA", "lncRNA", "tRNA", "miRNA"]
const ALL_BUSCO_TYPES: BuscoType[] = ["single_copy", "duplicated", "fragmented", "missing"]

interface TaxonomyGeneTypesState {
  stackMode: StackMode
  selectedGeneTypes: Set<GeneType>
  selectedTranscriptTypes: Set<TranscriptType>
  selectedBuscoTypes: Set<BuscoType>
  setStackMode: (mode: StackMode) => void
  setSelectedGeneTypes: (set: Set<GeneType>) => void
  toggleGeneType: (type: GeneType) => void
  toggleTranscriptType: (type: TranscriptType) => void
  toggleBuscoType: (type: BuscoType) => void
  hasGeneType: (type: GeneType) => boolean
  hasTranscriptType: (type: TranscriptType) => boolean
  hasBuscoType: (type: BuscoType) => boolean
}

function createInitialGeneSet() {
  return new Set<GeneType>(ALL_GENE_TYPES)
}
function createInitialTranscriptSet() {
  return new Set<TranscriptType>(ALL_TRANSCRIPT_TYPES)
}
function createInitialBuscoSet() {
  return new Set<BuscoType>(ALL_BUSCO_TYPES)
}

export const useTaxonomyGeneTypesStore = create<TaxonomyGeneTypesState>()((set, get) => ({
  stackMode: "genes",
  selectedGeneTypes: createInitialGeneSet(),
  selectedTranscriptTypes: createInitialTranscriptSet(),
  selectedBuscoTypes: createInitialBuscoSet(),

  setStackMode: (mode) => set({ stackMode: mode }),

  setSelectedGeneTypes: (nextSet) => {
    if (nextSet.size < 1) return
    set({ selectedGeneTypes: new Set(nextSet) })
  },

  toggleGeneType: (type) => {
    const { selectedGeneTypes } = get()
    const next = new Set(selectedGeneTypes)
    if (next.has(type)) {
      if (next.size <= 1) return
      next.delete(type)
    } else {
      next.add(type)
    }
    set({ stackMode: "genes", selectedGeneTypes: next })
  },

  toggleTranscriptType: (type) => {
    const { selectedTranscriptTypes } = get()
    const next = new Set(selectedTranscriptTypes)
    if (next.has(type)) {
      if (next.size <= 1) return
      next.delete(type)
    } else {
      next.add(type)
    }
    set({ stackMode: "transcripts", selectedTranscriptTypes: next })
  },

  toggleBuscoType: (type) => {
    const { selectedBuscoTypes } = get()
    const next = new Set(selectedBuscoTypes)
    if (next.has(type)) {
      if (next.size <= 1) return
      next.delete(type)
    } else {
      next.add(type)
    }
    set({ stackMode: "busco", selectedBuscoTypes: next })
  },

  hasGeneType: (type) => get().selectedGeneTypes.has(type),
  hasTranscriptType: (type) => get().selectedTranscriptTypes.has(type),
  hasBuscoType: (type) => get().selectedBuscoTypes.has(type),
}))
