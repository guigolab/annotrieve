import { create } from 'zustand'
import type { OrganismRecord, TaxonRecord, AssemblyRecord, BioProjectRecord } from '@/lib/api/types'
import { getAnnotationsStatsSummary } from '@/lib/api/annotations'

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

// Filter state interface
export interface FiltersState {
  // Taxon filters
  selectedTaxons: TaxonRecord[]
  selectedOrganisms: OrganismRecord[],
  selectedAssemblies: AssemblyRecord[],
  selectedBioprojects: BioProjectRecord[],
  
  // Assembly filters
  selectedAssemblyLevels: string[]
  selectedAssemblyStatuses: string[]
  onlyRefGenomes: boolean
  
  // Annotation metadata filters
  biotypes: string[]
  featureSources: string[]
  featureTypes: string[]
  pipelines: string[]
  providers: string[]
  databaseSources: string[]
}

// Annotations state interface (pagination and sorting only, no data storage)
export interface AnnotationsState {
  page: number
  itemsPerPage: number
  sortOption: SortOption
  stats: any | null
  statsLoading: boolean
}


// Combined store interface
export interface AnnotationsFiltersStore extends FiltersState, AnnotationsState {
  // Filter actions
  setSelectedTaxons: (taxons: TaxonRecord[]) => void
  setSelectedOrganisms: (organisms: OrganismRecord[]) => void
  setSelectedAssemblies: (assemblies: AssemblyRecord[]) => void
  setSelectedBioprojects: (bioprojects: BioProjectRecord[]) => void
  setSelectedAssemblyLevels: (levels: string[]) => void
  setSelectedAssemblyStatuses: (statuses: string[]) => void
  setOnlyRefGenomes: (value: boolean) => void
  setBiotypes: (biotypes: string[]) => void
  setFeatureTypes: (types: string[]) => void
  setFeatureSources: (sources: string[]) => void
  setPipelines: (pipelines: string[]) => void
  setProviders: (providers: string[]) => void
  setDatabaseSources: (sources: string[]) => void
  clearAllFilters: () => void
  
  // Annotations actions
  fetchAnnotationsStats: (showFavs?: boolean, favoriteIds?: string[]) => Promise<void>
  setAnnotationsPage: (page: number) => void
  setAnnotationsItemsPerPage: (itemsPerPage: number) => void
  setAnnotationsSortOption: (sortOption: SortOption) => void
  resetAnnotationsPage: () => void
  
  // Helper methods
  buildAnnotationsParams: (showFavs?: boolean, favoriteIds?: string[]) => Record<string, any>
  hasActiveFilters: () => boolean
}

// Default values
const defaultFilters: FiltersState = {
  selectedTaxons:[], 
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
}

const defaultAnnotations: AnnotationsState = {
  page: 1,
  itemsPerPage: 10,
  sortOption: 'none',
  stats: null,
  statsLoading: false,
}

export const useAnnotationsFiltersStore = create<AnnotationsFiltersStore>((set, get) => ({
  // Initial state
  ...defaultFilters,
  ...defaultAnnotations,

  
  // Filter actions
  setSelectedTaxons: (taxons: TaxonRecord[]) => {
    set({ selectedTaxons: taxons })
    get().resetAnnotationsPage()
  },
  setSelectedBioprojects: (bioprojects: BioProjectRecord[]) => {
    set({ selectedBioprojects: bioprojects })
    get().resetAnnotationsPage()
  },
  
  setSelectedOrganisms: (organisms: OrganismRecord[]) => {
    set({ selectedOrganisms: organisms })
    get().resetAnnotationsPage()
  },
  setSelectedAssemblies: (assemblies: AssemblyRecord[]) => {
    set({ selectedAssemblies: assemblies })
    get().resetAnnotationsPage()
  },
  setOnlyRefGenomes: (value: boolean) => {
    set({ onlyRefGenomes: value })
    get().resetAnnotationsPage()
  },

  setSelectedAssemblyLevels: (levels: string[]) => {
    set({ selectedAssemblyLevels: levels })
    get().resetAnnotationsPage()
  },
  
  setSelectedAssemblyStatuses: (statuses: string[]) => {
    set({ selectedAssemblyStatuses: statuses })
    get().resetAnnotationsPage()
  },
  

  setBiotypes: (biotypes: string[]) => {
    set({ biotypes })
    get().resetAnnotationsPage()
  },
  
  setFeatureTypes: (types: string[]) => {
    set({ featureTypes: types })
    get().resetAnnotationsPage()
  },
  
  setFeatureSources: (sources: string[]) => {
    set({ featureSources: sources })
    get().resetAnnotationsPage()
  },
  
  setPipelines: (pipelines: string[]) => {
    set({ pipelines })
    get().resetAnnotationsPage()
  },
  
  setProviders: (providers: string[]) => {
    set({ providers })
    get().resetAnnotationsPage()
  },
  
  setDatabaseSources: (sources: string[]) => {
    set({ databaseSources: sources })
    get().resetAnnotationsPage()
  },
  
  clearAllFilters: () => {
    set({ ...defaultFilters })
    get().resetAnnotationsPage()
  },
  
  // Build annotations params
  buildAnnotationsParams: (showFavs = false, favoriteIds: string[] = []) => {
    const state = get()
    const params: Record<string, any> = {
      limit: state.itemsPerPage,
      offset: (state.page - 1) * state.itemsPerPage,
    }
    
    // If showing favorites, only use favorite IDs and skip all other filters
    if (showFavs && favoriteIds.length > 0) {
      params.md5_checksums = favoriteIds.join(',')
      params.limit = favoriteIds.length + 1
      // Return early - don't add any other filter params
      return params
    }
    
    // Add taxon filters
    if (state.selectedTaxons.length > 0) {
      params.taxids = state.selectedTaxons.map(taxon => taxon.taxid).join(',')
    }
    
    // Add assembly filters
    if (state.selectedAssemblies.length > 0) {
      params.assembly_accessions = state.selectedAssemblies.map(assembly => assembly.assembly_accession).join(',')
    }
    if (state.selectedBioprojects.length > 0) {
      params.bioproject_accessions = state.selectedBioprojects.map(project => project.accession).join(',')
    }
    if (state.selectedAssemblyLevels.length > 0) {
      params.assembly_levels = state.selectedAssemblyLevels.join(',')
    }
    if (state.selectedAssemblyStatuses.length > 0) {
      params.assembly_statuses = state.selectedAssemblyStatuses.join(',')
    }
    if (state.onlyRefGenomes) {
      params.refseq_categories = 'reference genome'
    }
    
    // Add annotation metadata filters
    if (state.biotypes.length > 0) {
      params.biotypes = state.biotypes.join(',')
    }
    if (state.featureTypes.length > 0) {
      params.feature_types = state.featureTypes.join(',')
    }
    if (state.featureSources.length > 0) {
      params.feature_sources = state.featureSources.join(',')
    }
    if (state.pipelines.length > 0) {
      params.pipelines = state.pipelines.join(',')
    }
    if (state.providers.length > 0) {
      params.providers = state.providers.join(',')
    }
    if (state.databaseSources.length > 0) {
      params.db_sources = state.databaseSources.join(',')
    }
    
    // Add server-side sorting
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

  // Fetch annotations stats (separate function for lazy loading)
  fetchAnnotationsStats: async (showFavs = false, favoriteIds: string[] = []) => {
    const state = get()
    
    // Prevent concurrent fetches
    if (state.statsLoading) {
      return
    }
    
    set({ statsLoading: true })
    
    try {
      const params = state.buildAnnotationsParams(showFavs, favoriteIds)
      // Remove pagination params for stats
      delete params.limit
      delete params.offset
      
      const statsRes = await getAnnotationsStatsSummary(params as any)
      set({ 
        stats: statsRes, 
        statsLoading: false,
      })
    } catch (statsError: any) {
      console.error('Error fetching stats:', statsError)
      set({ 
        stats: null, 
        statsLoading: false,
      })
    }
  },
  
  // Annotations pagination and sorting
  setAnnotationsPage: (page: number) => {
    set({ page })
  },
  
  setAnnotationsItemsPerPage: (itemsPerPage: number) => {
    set({ itemsPerPage, page: 1 })
  },
  
  setAnnotationsSortOption: (sortOption: SortOption) => {
    set({ sortOption, page: 1 })
  },
  
  resetAnnotationsPage: () => {
    set({ page: 1 })
  },

  // Helper: check if any filters are active
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
      state.pipelines.length > 0 ||
      state.providers.length > 0 ||
      state.databaseSources.length > 0
    )
  },
}))

