/** Normalize API country names to match world-atlas GeoJSON properties.name */
export const COUNTRY_NAME_MAP: Record<string, string> = {
  "United States": "United States of America",
  "United Kingdom": "United Kingdom",
  Czechia: "Czech Republic",
  UAE: "United Arab Emirates",
  "United Arab Emirates": "United Arab Emirates",
}

export function normalizeCountryName(country: string): string {
  return COUNTRY_NAME_MAP[country] || country
}
