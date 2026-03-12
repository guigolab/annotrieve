"use client"

export const MAJOR_RANKS = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species']

export function sortRanks(rankFrequencies: Record<string, number>) {
  return Object.entries(rankFrequencies)
    .filter(([rank]) => rank && rank !== 'no_value')
    .sort((a, b) => {
      const aIndex = MAJOR_RANKS.indexOf(a[0].toLowerCase())
      const bIndex = MAJOR_RANKS.indexOf(b[0].toLowerCase())
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a[0].localeCompare(b[0])
    })
}

export function formatRankLabel(rank: string) {
  if (!rank) return ''
  return rank.charAt(0).toUpperCase() + rank.slice(1)
}

