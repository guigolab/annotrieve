import { apiGet } from './base'

export interface CountryFrequencies {
  [country: string]: number
}

export function getCountryFrequencies() {
  return apiGet<CountryFrequencies>('/analytics/frequencies/country')
}

export interface TopVisitor {
  country: string
  visits_count: number
}

/** @deprecated Prefer getTopCountries for public usage UI */
export function getTopVisitors(limit = 5) {
  return apiGet<TopVisitor[]>(`/analytics/top-visitors?limit=${limit}`)
}

export interface UsageSummary {
  unique_users: number
  active_30d: number
  countries: number
  returning_pct: number
  as_of: string
}

export function getUsageSummary() {
  return apiGet<UsageSummary>('/analytics/summary')
}

export interface TopCountry {
  country: string
  unique_users: number
}

export function getTopCountries(limit = 10) {
  return apiGet<TopCountry[]>(`/analytics/top-countries?limit=${limit}`)
}

export interface UsageCapabilityItem {
  id: string
  label: string
  unique_users: number
  request_count?: number
}

export interface UsageCapabilitiesResponse {
  items: UsageCapabilityItem[]
  as_of: string | null
}

export function getUsageCapabilities() {
  return apiGet<UsageCapabilitiesResponse>('/analytics/capabilities')
}

export interface TopEntityRow {
  id: string
  unique_users: number
  label?: string | null
  organism_name?: string | null
  assembly_accession?: string | null
  provider?: string | null
  database?: string | null
  rank?: string | null
}

export interface TopEntitiesResponse {
  top_assemblies: TopEntityRow[]
  top_annotations: TopEntityRow[]
  top_taxons: TopEntityRow[]
  as_of: string | null
}

export function getTopEntities() {
  return apiGet<TopEntitiesResponse>('/analytics/top-entities')
}
