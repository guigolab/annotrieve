import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { OrganismRecord, TaxonRecord, AssemblyRecord, BioProjectRecord } from '@/lib/api/types'
import { getAnnotationsStatsSummary } from '@/lib/api/annotations'
import type { AnnotationsUrlParams } from '@/lib/annotations-url'
import { joinCsv } from '@/lib/csv-list'

export type SortOption =
  | 'none'
  | 'date_desc'
  | 'date_asc'
  | 'coding_genes_count_desc'
  | 'coding_genes_count_asc'
  | 'non_coding_genes_count_desc'
  | 'non_coding_genes_count_asc'
  | 'pseudogenes_count_desc'
  | 'pseudogenes_count_asc'
  | 'busco_complete_desc'
  | 'busco_complete_asc'

export type FilterSetterOptions = {
  syncUrl?: boolean
}

export interface PendingAnnotationsNav {
  incoming: AnnotationsUrlParams
  label: string
}

// Filter state interface
export interface FiltersState {
  selectedTaxons: TaxonRecord[]
  selectedOrganisms: OrganismRecord[]
  selectedAssemblies: AssemblyRecord[]
  selectedBioprojects: BioProjectRecord[]
  selectedAssemblyLevels: string[]
  selectedAssemblyStatuses: string[]
  onlyRefGenomes: boolean
  biotypes: string[]
  featureSources: string[]
  featureTypes: string[]
  pipelines: string[]
  providers: string[]
  databaseSources: string[]
  buscoCompleteFrom: number | null
  buscoCompleteTo: number | null
}

export interface AnnotationsState {
  page: number
  itemsPerPage: number
  sortOption: SortOption
  stats: any | null
  statsLoading: boolean
}

export interface AnnotationsFiltersStore extends FiltersState, AnnotationsState {
  lastKnownSearchParams: string
  filtersReady: boolean
  /** True while URL stub entities are being hydrated for chip labels. */
  filterEntitiesEnriching: boolean
  syncGeneration: number
  pendingAnnotationsNav: PendingAnnotationsNav | null

  setSelectedTaxons: (taxons: TaxonRecord[], options?: FilterSetterOptions) => void
  setSelectedOrganisms: (organisms: OrganismRecord[], options?: FilterSetterOptions) => void
  setSelectedAssemblies: (assemblies: AssemblyRecord[], options?: FilterSetterOptions) => void
  setSelectedBioprojects: (bioprojects: BioProjectRecord[], options?: FilterSetterOptions) => void
  setSelectedAssemblyLevels: (levels: string[], options?: FilterSetterOptions) => void
  setSelectedAssemblyStatuses: (statuses: string[], options?: FilterSetterOptions) => void
  setOnlyRefGenomes: (value: boolean, options?: FilterSetterOptions) => void
  setBiotypes: (biotypes: string[], options?: FilterSetterOptions) => void
  setFeatureTypes: (types: string[], options?: FilterSetterOptions) => void
  setFeatureSources: (sources: string[], options?: FilterSetterOptions) => void
  setPipelines: (pipelines: string[], options?: FilterSetterOptions) => void
  setProviders: (providers: string[], options?: FilterSetterOptions) => void
  setDatabaseSources: (sources: string[], options?: FilterSetterOptions) => void
  setBuscoCompleteRange: (from: number | null, to: number | null, options?: FilterSetterOptions) => void
  clearAllFilters: (options?: FilterSetterOptions) => void
  loadFilterSubset: (filters: FiltersState, options?: FilterSetterOptions) => void

  fetchAnnotationsStats: (showFavs?: boolean, favoriteIds?: string[]) => Promise<void>
  setAnnotationsPage: (page: number, options?: FilterSetterOptions) => void
  setAnnotationsItemsPerPage: (itemsPerPage: number, options?: FilterSetterOptions) => void
  setAnnotationsSortOption: (sortOption: SortOption, options?: FilterSetterOptions) => void
  resetAnnotationsPage: (options?: FilterSetterOptions) => void

  applyFiltersFromUrl: (
    state: FiltersState & Pick<AnnotationsState, 'page' | 'sortOption'>,
    options?: { incrementGeneration?: boolean }
  ) => void
  /** Replace stub entity records with hydrated labels without refetching the list. */
  enrichFilterEntitiesFromUrl: (partial: {
    selectedTaxons?: TaxonRecord[]
    selectedAssemblies?: AssemblyRecord[]
    selectedBioprojects?: BioProjectRecord[]
  }) => void
  setFilterEntitiesEnriching: (enriching: boolean) => void
  setLastKnownSearchParams: (qs: string) => void
  setFiltersReady: (ready: boolean) => void
  setPendingAnnotationsNav: (nav: PendingAnnotationsNav | null) => void
  setUrlCommitHandler: (handler: (() => void) | null) => void

  buildAnnotationsParams: (showFavs?: boolean, favoriteIds?: string[]) => Record<string, any>
  hasActiveFilters: () => boolean
}

const defaultFilters: FiltersState = {
  selectedTaxons: [],
  selectedOrganisms: [],
  selectedAssemblies: [],
  selectedBioprojects: [],
  selectedAssemblyLevels: [],
  selectedAssemblyStatuses: [],
  onlyRefGenomes: false,
  biotypes: [],
  featureTypes: [],
  featureSources: [],
  pipelines: [],
  providers: [],
  databaseSources: [],
  buscoCompleteFrom: null,
  buscoCompleteTo: null,
}

const defaultAnnotations: AnnotationsState = {
  page: 1,
  itemsPerPage: 10,
  sortOption: 'none',
  stats: null,
  statsLoading: false,
}

let urlCommitHandler: (() => void) | null = null

function shouldSyncUrl(options?: FilterSetterOptions): boolean {
  return options?.syncUrl !== false
}

function maybeCommitUrl(options?: FilterSetterOptions) {
  if (shouldSyncUrl(options)) {
    urlCommitHandler?.()
  }
}

export const useAnnotationsFiltersStore = create<AnnotationsFiltersStore>()(
  persist(
    (set, get) => ({
      ...defaultFilters,
      ...defaultAnnotations,
      lastKnownSearchParams: '',
      filtersReady: false,
      filterEntitiesEnriching: false,
      syncGeneration: 0,
      pendingAnnotationsNav: null,

      setUrlCommitHandler: (handler) => {
        urlCommitHandler = handler
      },

      setLastKnownSearchParams: (qs) => set({ lastKnownSearchParams: qs }),
      setFiltersReady: (ready) => set({ filtersReady: ready }),
      setFilterEntitiesEnriching: (enriching) => set({ filterEntitiesEnriching: enriching }),
      setPendingAnnotationsNav: (nav) => set({ pendingAnnotationsNav: nav }),

      applyFiltersFromUrl: (state, options) => {
        const incrementGeneration = options?.incrementGeneration !== false
        set((prev) => ({
          ...defaultFilters,
          selectedTaxons: state.selectedTaxons,
          selectedOrganisms: state.selectedOrganisms,
          selectedAssemblies: state.selectedAssemblies,
          selectedBioprojects: state.selectedBioprojects,
          selectedAssemblyLevels: state.selectedAssemblyLevels,
          selectedAssemblyStatuses: state.selectedAssemblyStatuses,
          onlyRefGenomes: state.onlyRefGenomes,
          biotypes: state.biotypes,
          featureTypes: state.featureTypes,
          featureSources: state.featureSources,
          pipelines: state.pipelines,
          providers: state.providers,
          databaseSources: state.databaseSources,
          buscoCompleteFrom: state.buscoCompleteFrom,
          buscoCompleteTo: state.buscoCompleteTo,
          page: state.page,
          sortOption: state.sortOption,
          syncGeneration: incrementGeneration ? prev.syncGeneration + 1 : prev.syncGeneration,
        }))
      },

      enrichFilterEntitiesFromUrl: (partial) => {
        set((prev) => ({
          selectedTaxons: partial.selectedTaxons ?? prev.selectedTaxons,
          selectedAssemblies: partial.selectedAssemblies ?? prev.selectedAssemblies,
          selectedBioprojects: partial.selectedBioprojects ?? prev.selectedBioprojects,
          filterEntitiesEnriching: false,
        }))
      },

      setSelectedTaxons: (taxons, options) => {
        set({ selectedTaxons: taxons, page: 1 })
        maybeCommitUrl(options)
      },
      setSelectedBioprojects: (bioprojects, options) => {
        set({ selectedBioprojects: bioprojects, page: 1 })
        maybeCommitUrl(options)
      },
      setSelectedOrganisms: (organisms, options) => {
        set({ selectedOrganisms: organisms, page: 1 })
        maybeCommitUrl(options)
      },
      setSelectedAssemblies: (assemblies, options) => {
        set({ selectedAssemblies: assemblies, page: 1 })
        maybeCommitUrl(options)
      },
      setOnlyRefGenomes: (value, options) => {
        set({ onlyRefGenomes: value, page: 1 })
        maybeCommitUrl(options)
      },
      setSelectedAssemblyLevels: (levels, options) => {
        set({ selectedAssemblyLevels: levels, page: 1 })
        maybeCommitUrl(options)
      },
      setSelectedAssemblyStatuses: (statuses, options) => {
        set({ selectedAssemblyStatuses: statuses, page: 1 })
        maybeCommitUrl(options)
      },
      setBiotypes: (biotypes, options) => {
        set({ biotypes, page: 1 })
        maybeCommitUrl(options)
      },
      setFeatureTypes: (types, options) => {
        set({ featureTypes: types, page: 1 })
        maybeCommitUrl(options)
      },
      setFeatureSources: (sources, options) => {
        set({ featureSources: sources, page: 1 })
        maybeCommitUrl(options)
      },
      setPipelines: (pipelines, options) => {
        set({ pipelines, page: 1 })
        maybeCommitUrl(options)
      },
      setProviders: (providers, options) => {
        set({ providers, page: 1 })
        maybeCommitUrl(options)
      },
      setDatabaseSources: (sources, options) => {
        set({ databaseSources: sources, page: 1 })
        maybeCommitUrl(options)
      },
      setBuscoCompleteRange: (from, to, options) => {
        set({ buscoCompleteFrom: from, buscoCompleteTo: to, page: 1 })
        maybeCommitUrl(options)
      },
      clearAllFilters: (options) => {
        set({ ...defaultFilters, page: 1 })
        maybeCommitUrl(options)
      },
      loadFilterSubset: (filters, options) => {
        set({
          ...defaultFilters,
          selectedTaxons: filters.selectedTaxons,
          selectedOrganisms: filters.selectedOrganisms,
          selectedAssemblies: filters.selectedAssemblies,
          selectedBioprojects: filters.selectedBioprojects,
          selectedAssemblyLevels: filters.selectedAssemblyLevels,
          selectedAssemblyStatuses: filters.selectedAssemblyStatuses,
          onlyRefGenomes: filters.onlyRefGenomes,
          biotypes: filters.biotypes,
          featureTypes: filters.featureTypes,
          featureSources: filters.featureSources,
          pipelines: filters.pipelines,
          providers: filters.providers,
          databaseSources: filters.databaseSources,
          buscoCompleteFrom: filters.buscoCompleteFrom,
          buscoCompleteTo: filters.buscoCompleteTo,
          page: 1,
        })
        maybeCommitUrl(options)
      },

      buildAnnotationsParams: (showFavs = false, favoriteIds: string[] = []) => {
        const state = get()
        const params: Record<string, any> = {
          limit: state.itemsPerPage,
          offset: (state.page - 1) * state.itemsPerPage,
        }

        if (showFavs && favoriteIds.length > 0) {
          params.md5_checksums = joinCsv(favoriteIds)
          params.limit = favoriteIds.length + 1
          return params
        }

        if (state.selectedTaxons.length > 0) {
          params.taxids = joinCsv(state.selectedTaxons.map((taxon) => String(taxon.taxid)))
        }
        if (state.selectedAssemblies.length > 0) {
          params.assembly_accessions = joinCsv(
            state.selectedAssemblies.map((assembly) => assembly.assembly_accession)
          )
        }
        if (state.selectedBioprojects.length > 0) {
          params.bioproject_accessions = joinCsv(
            state.selectedBioprojects.map((project) => project.accession)
          )
        }
        if (state.selectedAssemblyLevels.length > 0) {
          params.assembly_levels = joinCsv(state.selectedAssemblyLevels)
        }
        if (state.selectedAssemblyStatuses.length > 0) {
          params.assembly_statuses = joinCsv(state.selectedAssemblyStatuses)
        }
        if (state.onlyRefGenomes) {
          params.refseq_categories = 'reference genome'
        }
        if (state.biotypes.length > 0) {
          params.biotypes = joinCsv(state.biotypes)
        }
        if (state.featureTypes.length > 0) {
          params.feature_types = joinCsv(state.featureTypes)
        }
        if (state.featureSources.length > 0) {
          params.feature_sources = joinCsv(state.featureSources)
        }
        if (state.pipelines.length > 0) {
          params.pipelines = joinCsv(state.pipelines)
        }
        if (state.providers.length > 0) {
          params.providers = joinCsv(state.providers)
        }
        if (state.databaseSources.length > 0) {
          params.db_sources = joinCsv(state.databaseSources)
        }
        if (state.buscoCompleteFrom != null) {
          params.busco_complete_from = state.buscoCompleteFrom
        }
        if (state.buscoCompleteTo != null) {
          params.busco_complete_to = state.buscoCompleteTo
        }

        switch (state.sortOption) {
          case 'date_desc':
            params.sort_by = 'source_file_info.release_date'
            params.sort_order = 'desc'
            break
          case 'date_asc':
            params.sort_by = 'source_file_info.release_date'
            params.sort_order = 'asc'
            break
          case 'coding_genes_count_desc':
            params.sort_by = 'features_statistics.gene_category_stats.coding.total_count'
            params.sort_order = 'desc'
            break
          case 'coding_genes_count_asc':
            params.sort_by = 'features_statistics.gene_category_stats.coding.total_count'
            params.sort_order = 'asc'
            break
          case 'non_coding_genes_count_desc':
            params.sort_by = 'features_statistics.gene_category_stats.non_coding.total_count'
            params.sort_order = 'desc'
            break
          case 'non_coding_genes_count_asc':
            params.sort_by = 'features_statistics.gene_category_stats.non_coding.total_count'
            params.sort_order = 'asc'
            break
          case 'pseudogenes_count_desc':
            params.sort_by = 'features_statistics.gene_category_stats.pseudogene.total_count'
            params.sort_order = 'desc'
            break
          case 'pseudogenes_count_asc':
            params.sort_by = 'features_statistics.gene_category_stats.pseudogene.total_count'
            params.sort_order = 'asc'
            break
          case 'busco_complete_desc':
            params.sort_by = 'busco.complete'
            params.sort_order = 'desc'
            break
          case 'busco_complete_asc':
            params.sort_by = 'busco.complete'
            params.sort_order = 'asc'
            break
          case 'none':
          default:
            break
        }

        return params
      },

      fetchAnnotationsStats: async (showFavs = false, favoriteIds: string[] = []) => {
        const state = get()
        if (state.statsLoading) return

        const generationAtStart = state.syncGeneration
        set({ statsLoading: true })

        try {
          const params = state.buildAnnotationsParams(showFavs, favoriteIds)
          delete params.limit
          delete params.offset

          const statsRes = await getAnnotationsStatsSummary(params as any)
          if (get().syncGeneration !== generationAtStart) return

          set({
            stats: statsRes,
            statsLoading: false,
          })
        } catch (statsError: any) {
          console.error('Error fetching stats:', statsError)
          if (get().syncGeneration !== generationAtStart) return
          set({
            stats: null,
            statsLoading: false,
          })
        }
      },

      setAnnotationsPage: (page, options) => {
        set({ page })
        maybeCommitUrl(options)
      },
      setAnnotationsItemsPerPage: (itemsPerPage, options) => {
        set({ itemsPerPage, page: 1 })
        maybeCommitUrl(options)
      },
      setAnnotationsSortOption: (sortOption, options) => {
        set({ sortOption, page: 1 })
        maybeCommitUrl(options)
      },
      resetAnnotationsPage: (options) => {
        set({ page: 1 })
        maybeCommitUrl(options)
      },

      hasActiveFilters: () => {
        const state = get()
        return (
          state.selectedTaxons.length > 0 ||
          state.selectedOrganisms.length > 0 ||
          state.selectedAssemblies.length > 0 ||
          state.selectedBioprojects.length > 0 ||
          state.selectedAssemblyLevels.length > 0 ||
          state.selectedAssemblyStatuses.length > 0 ||
          state.onlyRefGenomes ||
          state.biotypes.length > 0 ||
          state.featureTypes.length > 0 ||
          state.featureSources.length > 0 ||
          state.pipelines.length > 0 ||
          state.providers.length > 0 ||
          state.databaseSources.length > 0 ||
          state.buscoCompleteFrom != null ||
          state.buscoCompleteTo != null
        )
      },
    }),
    {
      name: 'annotations-filters-session',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        lastKnownSearchParams: state.lastKnownSearchParams,
      }),
    }
  )
)
