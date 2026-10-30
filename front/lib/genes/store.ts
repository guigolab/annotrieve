import { create } from "zustand"

import type { CoverageRange } from "@/lib/genes/coverage"
import {
  clampCoverageRange,
  defaultCoverageRange,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import {
  DEFAULT_GROUP,
  DEFAULT_KEEP,
  DEFAULT_SORT,
  DEFAULT_SORT_DIR,
  type AnnotationsSort,
  type AnnotationsSortDir,
  type GroupMode,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import { defaultSources } from "@/lib/genes/filters"
import {
  EMPTY_LIST_FILTERS,
  type GenesListFilters,
} from "@/lib/genes/list-filters"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import {
  EMPTY_SELECTION,
  reduceSelection,
  type DistributionSelection,
  type SelectionAction,
} from "@/lib/genes/selection"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { taxidsOf } from "@/lib/genes/taxa"
import { uniqueNames } from "@/lib/genes/tokenize"
import {
  DEFAULT_COUNT_UNIT,
  DEFAULT_VIEW,
  type CountUnit,
  type GenesView,
} from "@/lib/genes/view"

export type PopoverId = "coverage" | null

/** Open annotation drawer (null = closed). URL syncs `ann` / `gene`. */
export interface GenesDrawer {
  annotationId: string
  localId: number | null
  /** Species label for headers (may be null after URL hydrate). */
  species: string | null
  source: number | null
}

export interface GenesState {
  /** Raw query text in the search input. */
  queryText: string
  /** Names sent to /hits (resolved set after Search / prefix apply). */
  queryNames: string[]
  /**
   * Internal optimistic excludeTerms mask (URL `exclude=` / prune).
   * Not a user-facing Review UI concept (removed in P2).
   */
  excluded: Set<string>
  /** Include-only Annotations list filters (Show only hand-off). */
  listFilters: GenesListFilters
  /** In-memory Annotations table multi-select (rows = annotation ids). */
  annotationsSelection: DistributionSelection
  /** Anchor for Annotations table selection. */
  annotationsSelectionAnchor: {
    row: string | null
    col: string | null
  }
  sources: Set<number>
  coverage: CoverageRange | null
  keep: KeepPolicy
  group: GroupMode
  /** Null = no column sort (annotationId order). */
  sort: AnnotationsSort | null
  sortDir: AnnotationsSortDir
  /** Species / assembly search (URL `q`). */
  search: string
  expanded: Set<string>
  drawer: GenesDrawer | null
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
  /** Active lens: distribution | annotations | compare. */
  view: GenesView
  /** Heatmap count unit. */
  unit: CountUnit
  /** Hydrated from URL once. */
  urlReady: boolean

  setQueryText: (text: string) => void
  setQueryNames: (names: string[]) => void
  setExcluded: (excluded: Set<string>) => void
  toggleSource: (code: number) => void
  setSources: (sources: Set<number>) => void
  setCoverage: (range: CoverageRange | null, termCount: number) => void
  setListFilters: (filters: GenesListFilters) => void
  patchListFilters: (patch: Partial<GenesListFilters>) => void
  dispatchAnnotationsSelection: (action: SelectionAction) => void
  clearAnnotationsSelection: () => void
  setAnnotationsSelectionAnchor: (
    anchor: Partial<GenesState["annotationsSelectionAnchor"]>,
  ) => void
  setKeep: (keep: KeepPolicy) => void
  setGroup: (group: GroupMode) => void
  setSort: (sort: AnnotationsSort | null, sortDir?: AnnotationsSortDir) => void
  setSearch: (search: string) => void
  toggleExpanded: (id: string) => void
  setExpanded: (ids: Set<string>) => void
  openDrawer: (opts: {
    annotationId: string
    species: string | null
    source: number | null
    /** When set, open with that gene already expanded. */
    localId?: number | null
  }) => void
  /** Expand/collapse gene inline in the drawer (same id toggles closed). */
  setDrawerGene: (localId: number | null) => void
  closeDrawer: () => void
  setPopover: (id: PopoverId) => void
  setTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
  /** Refresh labels once the flattened taxon tree is available. */
  relabelTaxa: (labelFor: (taxid: number) => string | undefined) => void
  setViewRank: (rank: string | null) => void
  setView: (view: GenesView) => void
  setUnit: (unit: CountUnit) => void
  /**
   * Annotations list Reset: clears list filters, sources, coverage, keep,
   * group, sort, search, excluded, selections. Does not touch query,
   * viewRank, unit, or pins.
   */
  resetViewFilters: () => void
  clearGeneSet: () => void
  hydrateFromUrl: (partial: Partial<{
    queryNames: string[]
    excluded: Set<string>
    listFilters: GenesListFilters
    sources: Set<number>
    coverage: CoverageRange | null
    annotationId: string | null
    localId: number | null
    includeTaxa: SelectedTaxon[]
    excludeTaxa: SelectedTaxon[]
    viewRank: string | null
    view: GenesView
    unit: CountUnit
    keep: KeepPolicy
    group: GroupMode
    sort: AnnotationsSort | null
    sortDir: AnnotationsSortDir
    search: string
  }>) => void
  setUrlReady: (ready: boolean) => void
}

/** Convenience getters used by hooks that still want bare taxid arrays. */
export function includeTaxids(state: Pick<GenesState, "includeTaxa">): number[] {
  return taxidsOf(state.includeTaxa)
}

export function excludeTaxids(state: Pick<GenesState, "excludeTaxa">): number[] {
  return taxidsOf(state.excludeTaxa)
}

export const useGenesStore = create<GenesState>((set, get) => ({
  queryText: "",
  queryNames: [],
  excluded: new Set(),
  listFilters: { ...EMPTY_LIST_FILTERS },
  annotationsSelection: EMPTY_SELECTION,
  annotationsSelectionAnchor: { row: null, col: null },
  sources: defaultSources(),
  coverage: null,
  keep: DEFAULT_KEEP,
  group: DEFAULT_GROUP,
  sort: DEFAULT_SORT,
  sortDir: DEFAULT_SORT_DIR,
  search: "",
  expanded: new Set(),
  drawer: null,
  openPopover: null,
  includeTaxa: [],
  excludeTaxa: [],
  viewRank: null,
  view: DEFAULT_VIEW,
  unit: DEFAULT_COUNT_UNIT,
  urlReady: false,

  setQueryText: (text) => set({ queryText: text }),
  setQueryNames: (names) =>
    set({
      queryNames: names,
      drawer: null,
      listFilters: { ...EMPTY_LIST_FILTERS },
      annotationsSelection: EMPTY_SELECTION,
      annotationsSelectionAnchor: { row: null, col: null },
    }),
  setExcluded: (excluded) =>
    set({ excluded, drawer: null }),

  toggleSource: (code) => {
    const next = new Set(get().sources)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    set({ sources: next, drawer: null })
  },
  setSources: (sources) => set({ sources }),

  setCoverage: (range, termCount) => {
    if (!range || isDefaultCoverageRange(range, termCount)) {
      set({ coverage: null, drawer: null })
      return
    }
    set({
      coverage: clampCoverageRange(range, termCount),
      drawer: null,
    })
  },
  setListFilters: (filters) =>
    set({
      listFilters: filters,
      drawer: null,
    }),
  patchListFilters: (patch) => {
    const listFilters = { ...get().listFilters, ...patch }
    set({
      listFilters,
      drawer: null,
    })
  },

  dispatchAnnotationsSelection: (action) => {
    const next = reduceSelection(get().annotationsSelection, action)
    set({ annotationsSelection: next })
  },
  clearAnnotationsSelection: () =>
    set({
      annotationsSelection: EMPTY_SELECTION,
      annotationsSelectionAnchor: { row: null, col: null },
    }),
  setAnnotationsSelectionAnchor: (anchor) =>
    set({
      annotationsSelectionAnchor: {
        ...get().annotationsSelectionAnchor,
        ...anchor,
      },
    }),

  setKeep: (keep) => set({ keep }),
  setGroup: (group) => set({ group }),
  setSort: (sort, sortDir) =>
    set({
      sort,
      ...(sortDir !== undefined
        ? { sortDir }
        : sort == null
          ? { sortDir: DEFAULT_SORT_DIR }
          : {}),
    }),
  setSearch: (search) => set({ search }),

  toggleExpanded: (id) => {
    const next = new Set(get().expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ expanded: next })
  },
  setExpanded: (ids) => set({ expanded: ids }),

  openDrawer: ({ annotationId, species, source, localId }) =>
    set({
      drawer: {
        annotationId,
        localId: localId ?? null,
        species,
        source,
      },
    }),
  setDrawerGene: (localId) => {
    const drawer = get().drawer
    if (!drawer) return
    if (localId != null && drawer.localId === localId) {
      set({ drawer: { ...drawer, localId: null } })
      return
    }
    set({ drawer: { ...drawer, localId } })
  },
  closeDrawer: () => set({ drawer: null }),

  setPopover: (id) => set({ openPopover: id }),
  setTaxa: (include, exclude) =>
    set({
      includeTaxa: include,
      excludeTaxa: exclude,
      drawer: null,
      listFilters: {
        ...get().listFilters,
        includeTaxids: [],
        includeCells: [],
      },
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
      drawer: null,
      expanded: new Set(),
    }),
  setView: (view) => set({ view }),
  setUnit: (unit) => set({ unit }),
  resetViewFilters: () =>
    set({
      sources: defaultSources(),
      coverage: null,
      listFilters: { ...EMPTY_LIST_FILTERS },
      excluded: new Set(),
      keep: DEFAULT_KEEP,
      group: DEFAULT_GROUP,
      sort: DEFAULT_SORT,
      sortDir: DEFAULT_SORT_DIR,
      search: "",
      annotationsSelection: EMPTY_SELECTION,
      annotationsSelectionAnchor: { row: null, col: null },
      drawer: null,
      // Does not clear viewRank / unit / queryNames / pins
    }),
  clearGeneSet: () =>
    set({
      queryNames: [],
      queryText: "",
      excluded: new Set(),
      listFilters: { ...EMPTY_LIST_FILTERS },
      annotationsSelection: EMPTY_SELECTION,
      annotationsSelectionAnchor: { row: null, col: null },
      coverage: null,
      keep: DEFAULT_KEEP,
      group: DEFAULT_GROUP,
      sort: DEFAULT_SORT,
      sortDir: DEFAULT_SORT_DIR,
      search: "",
      drawer: null,
      expanded: new Set(),
      view: DEFAULT_VIEW,
      unit: DEFAULT_COUNT_UNIT,
    }),

  hydrateFromUrl: (partial) => {
    const cappedNames =
      partial.queryNames !== undefined
        ? uniqueNames(partial.queryNames, MAX_NAMES_GET)
        : undefined
    const nextDrawer =
      partial.annotationId !== undefined
        ? partial.annotationId
          ? {
              annotationId: partial.annotationId,
              localId: partial.localId ?? null,
              species: null as string | null,
              source: null as number | null,
            }
          : null
        : undefined

    set({
      ...(cappedNames !== undefined
        ? { queryNames: cappedNames, queryText: "" }
        : {}),
      ...(partial.excluded !== undefined ? { excluded: partial.excluded } : {}),
      ...(partial.listFilters !== undefined
        ? { listFilters: partial.listFilters }
        : {}),
      ...(partial.sources != null ? { sources: partial.sources } : {}),
      ...(partial.coverage !== undefined ? { coverage: partial.coverage } : {}),
      ...(partial.includeTaxa !== undefined
        ? { includeTaxa: partial.includeTaxa }
        : {}),
      ...(partial.excludeTaxa !== undefined
        ? { excludeTaxa: partial.excludeTaxa }
        : {}),
      ...(partial.viewRank !== undefined ? { viewRank: partial.viewRank } : {}),
      ...(partial.view !== undefined ? { view: partial.view } : {}),
      ...(partial.unit !== undefined ? { unit: partial.unit } : {}),
      ...(partial.keep !== undefined ? { keep: partial.keep } : {}),
      ...(partial.group !== undefined ? { group: partial.group } : {}),
      ...(partial.sort !== undefined ? { sort: partial.sort } : {}),
      ...(partial.sortDir !== undefined ? { sortDir: partial.sortDir } : {}),
      ...(partial.search !== undefined ? { search: partial.search } : {}),
      ...(nextDrawer !== undefined ? { drawer: nextDrawer } : {}),
    })
  },
  setUrlReady: (ready) => set({ urlReady: ready }),
}))

/**
 * Heatmap rank when store `viewRank` is null: kingdom if there are no include
 * taxa, otherwise auto (null). Never writes back into the store/URL.
 */
export function effectiveViewRank(
  viewRank: string | null,
  includeTaxidCount: number,
): string | null {
  if (viewRank != null) return viewRank
  return includeTaxidCount === 0 ? "kingdom" : null
}

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
