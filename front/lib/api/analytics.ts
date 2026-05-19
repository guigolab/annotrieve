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

export function getTopVisitors(limit = 5) {
  return apiGet<TopVisitor[]>(`/analytics/top-visitors?limit=${limit}`)
}
