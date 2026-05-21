import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { FiltersState } from "@/lib/stores/annotations-filters"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ENTITY_DETAILS_BASE_PATH = "/annotations/details"
const ANNOTATIONS_LIST_PATH = "/annotations"

export function buildEntityDetailsUrl(type: "taxon" | "assembly", id: string) {
  const param = type === "taxon" ? "taxon" : "assembly"
  return `${ENTITY_DETAILS_BASE_PATH}?${param}=${encodeURIComponent(id)}`
}

export function buildAnnotationsListUrl(opts: {
  taxids?: string[]
  accessions?: string[]
}) {
  const params = new URLSearchParams()
  if (opts.taxids?.length) params.set("filter_taxids", opts.taxids.join(","))
  if (opts.accessions?.length) params.set("filter_accessions", opts.accessions.join(","))
  const qs = params.toString()
  return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
}

/**
 * Build API query parameters from filters state
 * Shared utility used across comparison charts and summary cards
 */
export function buildParamsFromFilters(filters: FiltersState): Record<string, any> {
  const params: Record<string, any> = {}
  
  if (filters.selectedTaxons.length > 0) {
    params.taxids = filters.selectedTaxons.map(t => t.taxid).join(',')
  }
  if (filters.selectedAssemblies.length > 0) {
    params.assembly_accessions = filters.selectedAssemblies.map(a => a.assembly_accession).join(',')
  }
  if (filters.selectedBioprojects.length > 0) {
    params.bioproject_accessions = filters.selectedBioprojects.map(bp => bp.accession).join(',')
  }
  if (filters.selectedAssemblyLevels.length > 0) {
    params.assembly_levels = filters.selectedAssemblyLevels.join(',')
  }
  if (filters.selectedAssemblyStatuses.length > 0) {
    params.assembly_statuses = filters.selectedAssemblyStatuses.join(',')
  }
  if (filters.onlyRefGenomes) {
    params.refseq_categories = 'reference genome'
  }
  if (filters.biotypes.length > 0) {
    params.biotypes = filters.biotypes.join(',')
  }
  if (filters.featureTypes.length > 0) {
    params.feature_types = filters.featureTypes.join(',')
  }
  if (filters.featureSources.length > 0) {
    params.feature_sources = filters.featureSources.join(',')
  }
  if (filters.pipelines.length > 0) {
    params.pipelines = filters.pipelines.join(',')
  }
  if (filters.providers.length > 0) {
    params.providers = filters.providers.join(',')
  }
  if (filters.databaseSources.length > 0) {
    params.db_sources = filters.databaseSources.join(',')
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
    taxons: filters.selectedTaxons.map(t => String(t.taxid ?? '')).sort().join(','),
    organisms: filters.selectedOrganisms.map(o => String(o.taxid ?? '')).sort().join(','),
    assemblies: filters.selectedAssemblies.map(a => a.assembly_accession || '').sort().join(','),
    bioprojects: filters.selectedBioprojects.map(bp => bp.accession).sort().join(','),
    assemblyLevels: [...filters.selectedAssemblyLevels].sort().join(','),
    assemblyStatuses: [...filters.selectedAssemblyStatuses].sort().join(','),
    onlyRefGenomes: filters.onlyRefGenomes,
    biotypes: [...filters.biotypes].sort().join(','),
    featureTypes: [...filters.featureTypes].sort().join(','),
    featureSources: [...filters.featureSources].sort().join(','),
    pipelines: [...filters.pipelines].sort().join(','),
    providers: [...filters.providers].sort().join(','),
    databaseSources: [...filters.databaseSources].sort().join(','),
    buscoCompleteFrom: filters.buscoCompleteFrom ?? '',
    buscoCompleteTo: filters.buscoCompleteTo ?? '',
  }
  
  // Create a stable string representation
  return JSON.stringify(normalized)
}
