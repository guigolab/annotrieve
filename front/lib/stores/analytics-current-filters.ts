import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { FiltersState } from "@/lib/stores/annotations-filters"

export const EMPTY_FILTERS_STATE: FiltersState = {
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

/** Pick and clone FiltersState fields from a larger store snapshot. */
export function pickFiltersState(
  state: FiltersState | Partial<FiltersState>
): FiltersState {
  return {
    selectedTaxons: [...(state.selectedTaxons ?? [])],
    selectedOrganisms: [...(state.selectedOrganisms ?? [])],
    selectedAssemblies: [...(state.selectedAssemblies ?? [])],
    selectedBioprojects: [...(state.selectedBioprojects ?? [])],
    selectedAssemblyLevels: [...(state.selectedAssemblyLevels ?? [])],
    selectedAssemblyStatuses: [...(state.selectedAssemblyStatuses ?? [])],
    onlyRefGenomes: state.onlyRefGenomes ?? false,
    biotypes: [...(state.biotypes ?? [])],
    featureTypes: [...(state.featureTypes ?? [])],
    featureSources: [...(state.featureSources ?? [])],
    pipelines: [...(state.pipelines ?? [])],
    providers: [...(state.providers ?? [])],
    databaseSources: [...(state.databaseSources ?? [])],
    buscoCompleteFrom: state.buscoCompleteFrom ?? null,
    buscoCompleteTo: state.buscoCompleteTo ?? null,
  }
}

export function filtersStateHasActive(filters: FiltersState | null | undefined): boolean {
  if (!filters) return false
  return (
    filters.selectedTaxons.length > 0 ||
    filters.selectedOrganisms.length > 0 ||
    filters.selectedAssemblies.length > 0 ||
    filters.selectedBioprojects.length > 0 ||
    filters.selectedAssemblyLevels.length > 0 ||
    filters.selectedAssemblyStatuses.length > 0 ||
    filters.onlyRefGenomes ||
    filters.biotypes.length > 0 ||
    filters.featureTypes.length > 0 ||
    filters.featureSources.length > 0 ||
    filters.pipelines.length > 0 ||
    filters.providers.length > 0 ||
    filters.databaseSources.length > 0 ||
    filters.buscoCompleteFrom != null ||
    filters.buscoCompleteTo != null
  )
}

interface AnalyticsCurrentFiltersStore {
  /** Frozen list-page filters at Analytics navigation; null = not set this session. */
  snapshot: FiltersState | null
  setSnapshot: (filters: FiltersState) => void
  clearSnapshot: () => void
  hasSnapshotFilters: () => boolean
}

export const useAnalyticsCurrentFiltersStore = create<AnalyticsCurrentFiltersStore>()(
  persist(
    (set, get) => ({
      snapshot: null,

      setSnapshot: (filters) => {
        set({ snapshot: pickFiltersState(filters) })
      },

      clearSnapshot: () => {
        set({ snapshot: null })
      },

      hasSnapshotFilters: () => filtersStateHasActive(get().snapshot),
    }),
    {
      name: "analytics-current-filters-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        snapshot: state.snapshot,
      }),
    }
  )
)
