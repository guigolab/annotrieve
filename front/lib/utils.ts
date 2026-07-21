import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { FiltersState } from "@/lib/stores/annotations-filters"
import { joinCsv } from "@/lib/csv-list"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export { buildAnnotationsListUrl } from "@/lib/annotations-url"

const ENTITY_DETAILS_BASE_PATH = "/annotations/details"

export function buildEntityDetailsUrl(type: "taxon" | "assembly", id: string) {
  const param = type === "taxon" ? "taxon" : "assembly"
  return `${ENTITY_DETAILS_BASE_PATH}?${param}=${encodeURIComponent(id)}`
}

/**
 * Build API query parameters from filters state
 * Shared utility used across comparison charts and summary cards
 */
export function buildParamsFromFilters(filters: FiltersState): Record<string, any> {
  const params: Record<string, any> = {}
  
  if (filters.selectedTaxons.length > 0) {
    params.taxids = joinCsv(filters.selectedTaxons.map(t => String(t.taxid)))
  }
  if (filters.selectedAssemblies.length > 0) {
    params.assembly_accessions = joinCsv(filters.selectedAssemblies.map(a => a.assembly_accession))
  }
  if (filters.selectedBioprojects.length > 0) {
    params.bioproject_accessions = joinCsv(filters.selectedBioprojects.map(bp => bp.accession))
  }
  if (filters.selectedAssemblyLevels.length > 0) {
    params.assembly_levels = joinCsv(filters.selectedAssemblyLevels)
  }
  if (filters.selectedAssemblyStatuses.length > 0) {
    params.assembly_statuses = joinCsv(filters.selectedAssemblyStatuses)
  }
  if (filters.onlyRefGenomes) {
    params.refseq_categories = 'reference genome'
  }
  if (filters.biotypes.length > 0) {
    params.biotypes = joinCsv(filters.biotypes)
  }
  if (filters.featureTypes.length > 0) {
    params.feature_types = joinCsv(filters.featureTypes)
  }
  if (filters.featureSources.length > 0) {
    params.feature_sources = joinCsv(filters.featureSources)
  }
  if (filters.pipelines.length > 0) {
    params.pipelines = joinCsv(filters.pipelines)
  }
  if (filters.providers.length > 0) {
    params.providers = joinCsv(filters.providers)
  }
  if (filters.databaseSources.length > 0) {
    params.db_sources = joinCsv(filters.databaseSources)
  }
  if (filters.buscoCompleteFrom != null) {
    params.busco_complete_from = filters.buscoCompleteFrom
  }
  if (filters.buscoCompleteTo != null) {
    params.busco_complete_to = filters.buscoCompleteTo
  }

  return params
}

/**
 * Generate a normalized hash/signature of filters for efficient comparison
 * Sorts arrays and normalizes the structure to ensure consistent hashing
 */
export function getFiltersHash(filters: FiltersState): string {
  // Normalize and sort arrays for consistent hashing
  const normalized = {
    taxons: joinCsv(filters.selectedTaxons.map(t => String(t.taxid ?? '')).sort()),
    organisms: joinCsv(filters.selectedOrganisms.map(o => String(o.taxid ?? '')).sort()),
    assemblies: joinCsv(filters.selectedAssemblies.map(a => a.assembly_accession || '').sort()),
    bioprojects: joinCsv(filters.selectedBioprojects.map(bp => bp.accession).sort()),
    assemblyLevels: joinCsv([...filters.selectedAssemblyLevels].sort()),
    assemblyStatuses: joinCsv([...filters.selectedAssemblyStatuses].sort()),
    onlyRefGenomes: filters.onlyRefGenomes,
    biotypes: joinCsv([...filters.biotypes].sort()),
    featureTypes: joinCsv([...filters.featureTypes].sort()),
    featureSources: joinCsv([...filters.featureSources].sort()),
    pipelines: joinCsv([...filters.pipelines].sort()),
    providers: joinCsv([...filters.providers].sort()),
    databaseSources: joinCsv([...filters.databaseSources].sort()),
    buscoCompleteFrom: filters.buscoCompleteFrom ?? '',
    buscoCompleteTo: filters.buscoCompleteTo ?? '',
  }
  
  // Create a stable string representation
  return JSON.stringify(normalized)
}
