import { create } from "zustand"

import type { CoverageRange } from "@/lib/genes/coverage"
import {
  clampCoverageRange,
  defaultCoverageRange,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES, defaultSources } from "@/lib/genes/filters"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { taxidsOf } from "@/lib/genes/taxa"
import { uniqueNames } from "@/lib/genes/tokenize"

export type PanelLevel = "list" | "annotation" | "gene"
export type PopoverId = "review" | "coverage" | null

export interface PanelStack {
  level: PanelLevel
  annotationId: string | null
  localId: number | null
  /** Species label for headers. */
  species: string | null
  source: number | null
}

export interface GenesV1State {
  /** Raw query text in the search input. */
  queryText: string
  /** Names sent to /hits (resolved set after Search / prefix apply). */
  queryNames: string[]
  /** Lowercased names excluded via Review names. */
  excluded: Set<string>
  /** Selected taxonomy node id. */
  t: string | null
  /** Selected gene name. */
  g: string | null
  sources: Set<number>
  coverage: CoverageRange | null
  expanded: Set<string>
  panel: PanelStack
  openPopover: PopoverId
  /** Include-scope taxa (labels + taxids). */
  includeTaxa: SelectedTaxon[]
  /** Exclude-scope taxa (labels + taxids). */
  excludeTaxa: SelectedTaxon[]
  /**
   * Overview rank: taxa at this rank become heatmap roots.
   * null = auto roots (include taxids / children of Eukaryota).
   */
  viewRank: string | null
  /**
   * Ephemeral: show the full annotation list without a slice.
   * Not synced to the URL; reset when the gene set changes.
   */
  listAll: boolean
  /** Hydrated from URL once. */
  urlReady: boolean

  setQueryText: (text: string) => void
  setQueryNames: (names: string[]) => void
  setExcluded: (excluded: Set<string>) => void
  toggleSource: (code: number) => void
  setSources: (sources: Set<number>) => void
  setCoverage: (range: CoverageRange | null, termCount: number) => void
  clearCoverage: () => void
  selectTaxon: (id: string | null) => void
  selectName: (name: string | null) => void
  selectCell: (taxonId: string, name: string) => void
  toggleExpanded: (id: string) => void
  setExpanded: (ids: Set<string>) => void
  openAnnotation: (opts: {
    annotationId: string
    species: string
    source: number
  }) => void
  openGene: (localId: number) => void
  popPanel: () => void
  resetPanel: () => void
  setPopover: (id: PopoverId) => void
  setTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
  /** Refresh labels once the flattened taxon tree is available. */
  relabelTaxa: (labelFor: (taxid: number) => string | undefined) => void
  setViewRank: (rank: string | null) => void
  resetViewFilters: () => void
  setListAll: (listAll: boolean) => void
  clearGeneSet: () => void
  hydrateFromUrl: (partial: Partial<{
    queryNames: string[]
    excluded: Set<string>
    t: string | null
    g: string | null
    sources: Set<number>
    coverage: CoverageRange | null
    annotationId: string | null
    localId: number | null
    includeTaxa: SelectedTaxon[]
    excludeTaxa: SelectedTaxon[]
    viewRank: string | null
  }>) => void
  setUrlReady: (ready: boolean) => void
}

/** Convenience getters used by hooks that still want bare taxid arrays. */
export function includeTaxids(state: Pick<GenesV1State, "includeTaxa">): number[] {
  return taxidsOf(state.includeTaxa)
}

export function excludeTaxids(state: Pick<GenesV1State, "excludeTaxa">): number[] {
  return taxidsOf(state.excludeTaxa)
}

const emptyPanel = (): PanelStack => ({
  level: "list",
  annotationId: null,
  localId: null,
  species: null,
  source: null,
})

function resetToList(panel: PanelStack): PanelStack {
  return emptyPanel()
}

export const useGenesV1Store = create<GenesV1State>((set, get) => ({
  queryText: "",
  queryNames: [],
  excluded: new Set(),
  t: null,
  g: null,
  sources: defaultSources(),
  coverage: null,
  expanded: new Set(),
  panel: emptyPanel(),
  openPopover: null,
  includeTaxa: [],
  excludeTaxa: [],
  viewRank: null,
  listAll: false,
  urlReady: false,

  setQueryText: (text) => set({ queryText: text }),
  setQueryNames: (names) =>
    set({
      queryNames: names,
      panel: resetToList(get().panel),
      t: null,
      g: null,
      listAll: false,
    }),
  setExcluded: (excluded) =>
    set({ excluded, panel: resetToList(get().panel) }),

  toggleSource: (code) => {
    const next = new Set(get().sources)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    set({ sources: next, panel: resetToList(get().panel) })
  },
  setSources: (sources) => set({ sources }),

  setCoverage: (range, termCount) => {
    if (!range || isDefaultCoverageRange(range, termCount)) {
      set({ coverage: null, panel: resetToList(get().panel) })
      return
    }
    set({
      coverage: clampCoverageRange(range, termCount),
      panel: resetToList(get().panel),
    })
  },
  clearCoverage: () => set({ coverage: null, panel: resetToList(get().panel) }),

  selectTaxon: (id) => {
    const cur = get().t
    const next = cur === id ? null : id
    set({ t: next, panel: resetToList(get().panel) })
  },
  selectName: (name) => {
    const cur = get().g
    const next =
      cur && name && cur.toLowerCase() === name.toLowerCase() ? null : name
    set({ g: next, panel: resetToList(get().panel) })
  },
  selectCell: (taxonId, name) => {
    const { t, g } = get()
    const same =
      t === taxonId &&
      g != null &&
      g.toLowerCase() === name.toLowerCase()
    set({
      t: same ? null : taxonId,
      g: same ? null : name,
      panel: resetToList(get().panel),
    })
  },

  toggleExpanded: (id) => {
    const next = new Set(get().expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ expanded: next })
  },
  setExpanded: (ids) => set({ expanded: ids }),

  openAnnotation: ({ annotationId, species, source }) =>
    set({
      panel: {
        level: "annotation",
        annotationId,
        localId: null,
        species,
        source,
      },
    }),
  openGene: (localId) => {
    const panel = get().panel
    if (!panel.annotationId) return
    set({
      panel: { ...panel, level: "gene", localId },
    })
  },
  popPanel: () => {
    const panel = get().panel
    if (panel.level === "gene") {
      set({
        panel: { ...panel, level: "annotation", localId: null },
      })
    } else if (panel.level === "annotation") {
      set({ panel: emptyPanel() })
    }
  },
  resetPanel: () => set({ panel: emptyPanel() }),

  setPopover: (id) => set({ openPopover: id }),
  setTaxa: (include, exclude) =>
    set({
      includeTaxa: include,
      excludeTaxa: exclude,
      panel: resetToList(get().panel),
      t: null,
      viewRank: null,
    }),
  relabelTaxa: (labelFor) => {
    const map = (list: SelectedTaxon[]) =>
      list.map((taxon) => {
        const label = labelFor(taxon.taxid)
        return label && label !== taxon.label ? { ...taxon, label } : taxon
      })
    set({
      includeTaxa: map(get().includeTaxa),
      excludeTaxa: map(get().excludeTaxa),
    })
  },
  setViewRank: (rank) =>
    set({
      viewRank: rank,
      t: null,
      panel: resetToList(get().panel),
      expanded: new Set(),
    }),
  resetViewFilters: () =>
    set({
      sources: defaultSources(),
      coverage: null,
      t: null,
      g: null,
      viewRank: null,
      panel: emptyPanel(),
    }),
  setListAll: (listAll) => set({ listAll }),
  clearGeneSet: () =>
    set({
      queryNames: [],
      queryText: "",
      excluded: new Set(),
      t: null,
      g: null,
      listAll: false,
      coverage: null,
      panel: emptyPanel(),
      expanded: new Set(),
    }),

  hydrateFromUrl: (partial) => {
    const cappedNames =
      partial.queryNames !== undefined
        ? uniqueNames(partial.queryNames, MAX_NAMES_GET)
        : undefined
    const nextPanel =
      partial.annotationId !== undefined
        ? partial.annotationId
          ? {
              level: (partial.localId != null ? "gene" : "annotation") as PanelLevel,
              annotationId: partial.annotationId,
              localId: partial.localId ?? null,
              species: null,
              source: null,
            }
          : emptyPanel()
        : undefined
    set({
      ...(cappedNames !== undefined
        ? { queryNames: cappedNames, queryText: "", listAll: false }
        : {}),
      ...(partial.excluded !== undefined ? { excluded: partial.excluded } : {}),
      ...(partial.t !== undefined ? { t: partial.t } : {}),
      ...(partial.g !== undefined ? { g: partial.g } : {}),
      ...(partial.sources != null ? { sources: partial.sources } : {}),
      ...(partial.coverage !== undefined ? { coverage: partial.coverage } : {}),
      ...(partial.includeTaxa !== undefined
        ? { includeTaxa: partial.includeTaxa }
        : {}),
      ...(partial.excludeTaxa !== undefined
        ? { excludeTaxa: partial.excludeTaxa }
        : {}),
      ...(partial.viewRank !== undefined ? { viewRank: partial.viewRank } : {}),
      ...(nextPanel !== undefined ? { panel: nextPanel } : {}),
    })
  },
  setUrlReady: (ready) => set({ urlReady: ready }),
}))

/** Active (non-excluded) resolved names. */
export function activeNames(
  resolved: string[],
  excluded: Set<string>,
): string[] {
  return resolved.filter((n) => !excluded.has(n.toLowerCase()))
}

export function effectiveCoverage(
  coverage: CoverageRange | null,
  termCount: number,
): CoverageRange {
  return coverage ?? defaultCoverageRange(termCount)
}

export function sourcesLabel(sources: Set<number>): string | null {
  if (sources.size === ALL_SOURCE_CODES.length) return null
  return [...sources].sort((a, b) => a - b).join(",")
}
