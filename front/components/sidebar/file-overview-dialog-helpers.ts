import type { LegendItem } from 'chart.js'

export type GeneCategory = 'coding_genes' | 'non_coding_genes' | 'pseudogenes'

export const GENE_CATEGORIES: GeneCategory[] = ['coding_genes', 'non_coding_genes', 'pseudogenes']

export const CATEGORY_COLORS: Record<GeneCategory, string> = {
  coding_genes: '#3b82f6',
  non_coding_genes: '#8b5cf6',
  pseudogenes: '#10b981',
}

export const CATEGORY_LABELS: Record<GeneCategory, string> = {
  coding_genes: 'Coding Genes',
  non_coding_genes: 'Non-coding Genes',
  pseudogenes: 'Pseudogenes',
}

export interface ChartLegendConfig {
  onCategoryToggle: (category: GeneCategory) => void
  categoryKeys: GeneCategory[]
  stats: any
}

export const createLegendConfig = ({ onCategoryToggle, categoryKeys, stats }: ChartLegendConfig) => ({
  display: true,
  position: 'bottom' as const,
  labels: {
    font: { size: 11 },
    usePointStyle: true,
    padding: 15,
  },
  onClick: (e: any, legendItem: LegendItem, legend: any) => {
    const label = legendItem.text
    const cat = categoryKeys.find(c => CATEGORY_LABELS[c] === label && stats[c])
    if (cat) {
      onCategoryToggle(cat)
    }
  },
})

export const createPieLegendConfig = ({ onCategoryToggle, categoryKeys, stats }: ChartLegendConfig) => ({
  position: 'bottom' as const,
  labels: {
    font: { size: 11 },
    usePointStyle: true,
    padding: 15,
    generateLabels: (chart: any) => {
      const data = chart.data
      if (data.labels.length && data.datasets.length) {
        return data.labels.map((label: string, i: number) => {
          const cat = categoryKeys.filter(c => stats[c])[i]
          const isHidden = !chart.data.datasets[0].data[i] || chart.data.datasets[0].data[i] === 0
          return {
            text: typeof label === 'string' ? label.split(' (')[0] : label,
            fillStyle: data.datasets[0].backgroundColor[i],
            hidden: isHidden,
            index: i,
            strokeStyle: data.datasets[0].backgroundColor[i],
            lineWidth: 1,
          }
        })
      }
      return []
    },
  },
  onClick: (e: any, legendItem: LegendItem, legend: any) => {
    const index = legendItem.index
    if (index === undefined) return
    const cat = categoryKeys.filter(c => stats[c])[index]
    if (cat) {
      onCategoryToggle(cat)
    }
  },
})

export interface ChartTooltipConfig {
  formatValue?: (value: number) => string
  formatLabel?: (label: string, value: number, datasetLabel: string) => string
}

export const createTooltipConfig = (config?: ChartTooltipConfig) => ({
  callbacks: {
    label: (context: any) => {
      if (config?.formatLabel) {
        return config.formatLabel(
          context.label,
          context.parsed.y || context.parsed,
          context.dataset.label
        )
      }
      if (config?.formatValue) {
        return `${context.dataset.label}: ${config.formatValue(context.parsed.y || context.parsed)}`
      }
      return `${context.dataset.label}: ${(context.parsed.y || context.parsed).toLocaleString()}`
    },
  },
})

export const createBarChartOptions = (
  legendConfig: any,
  tooltipConfig: any,
  additionalOptions: any = {}
) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: legendConfig,
    tooltip: tooltipConfig,
  },
  ...additionalOptions,
})

export const createPieChartOptions = (
  legendConfig: any,
  tooltipConfig: any,
  additionalOptions: any = {}
) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: legendConfig,
    tooltip: {
      ...tooltipConfig,
      filter: (tooltipItem: any) => tooltipItem.parsed > 0,
    },
  },
  ...additionalOptions,
})

// Map old category keys to new structure keys
const CATEGORY_KEY_MAP: Record<GeneCategory, string> = {
  coding_genes: 'coding',
  non_coding_genes: 'non_coding',
  pseudogenes: 'pseudogene',
}

// Helper to get gene category stats from new structure
export const getGeneCategoryStats = (stats: any, category: GeneCategory) => {
  const newKey = CATEGORY_KEY_MAP[category]
  return stats?.gene_category_stats?.[newKey]
}

// Helper to get transcript type stats from new structure
export const getTranscriptTypeStats = (stats: any, transcriptType: string) => {
  return stats?.transcript_type_stats?.[transcriptType]
}

// Helper to get all transcript types from new structure
export const getAllTranscriptTypes = (stats: any): string[] => {
  if (!stats?.transcript_type_stats) return []
  return Object.keys(stats.transcript_type_stats).sort()
}

// Helper to get transcript types for a specific gene category
export const getTranscriptTypesForCategory = (stats: any, category: GeneCategory): string[] => {
  const categoryStats = getGeneCategoryStats(stats, category)
  if (!categoryStats?.transcript_type_counts) return []
  return Object.keys(categoryStats.transcript_type_counts).sort()
}

// Helper to get transcript count for a category (sum from transcript_type_stats)
export const getTranscriptCountForCategory = (stats: any, category: GeneCategory): number => {
  const categoryStats = getGeneCategoryStats(stats, category)
  if (!categoryStats?.transcript_type_counts) return 0
  return Object.values(categoryStats.transcript_type_counts).reduce((sum: number, count: any) => sum + (count || 0), 0)
}

// Helper to get transcripts per gene for a category
export const getTranscriptsPerGeneForCategory = (stats: any, category: GeneCategory): number => {
  const geneCount = getGeneCategoryStats(stats, category)?.total_count || 0
  const transcriptCount = getTranscriptCountForCategory(stats, category)
  return geneCount > 0 ? transcriptCount / geneCount : 0
}

// Helper to aggregate exon stats for a category
export const getExonStatsForCategory = (stats: any, category: GeneCategory) => {
  const transcriptTypes = getTranscriptTypesForCategory(stats, category)
  let totalCount = 0
  let totalLength = 0
  let count = 0
  
  transcriptTypes.forEach(type => {
    const typeStats = getTranscriptTypeStats(stats, type)
    const exonStats = typeStats?.exon_stats
    if (exonStats) {
      totalCount += exonStats.total_count || 0
      if (exonStats.length?.mean) {
        totalLength += exonStats.length.mean * (exonStats.total_count || 0)
        count += exonStats.total_count || 0
      }
    }
  })
  
  return {
    count: totalCount,
    length_stats: {
      mean: count > 0 ? totalLength / count : 0,
    }
  }
}

// Helper to aggregate CDS stats for a category
export const getCdsStatsForCategory = (stats: any, category: GeneCategory) => {
  const transcriptTypes = getTranscriptTypesForCategory(stats, category)
  let totalCount = 0
  let totalLength = 0
  let count = 0
  
  transcriptTypes.forEach(type => {
    const typeStats = getTranscriptTypeStats(stats, type)
    const cdsStats = typeStats?.cds_stats
    if (cdsStats) {
      totalCount += cdsStats.total_count || 0
      if (cdsStats.length?.mean) {
        totalLength += cdsStats.length.mean * (cdsStats.total_count || 0)
        count += cdsStats.total_count || 0
      }
    }
  })
  
  return {
    count: totalCount,
    length_stats: {
      mean: count > 0 ? totalLength / count : 0,
    }
  }
}

// Helper to get transcript type data for a category
export const getTranscriptTypeDataForCategory = (stats: any, category: GeneCategory, transcriptType: string) => {
  const typeStats = getTranscriptTypeStats(stats, transcriptType)
  if (!typeStats) return null
  
  // Check if this transcript type is associated with this gene category
  const associatedGenes = typeStats.associated_genes
  const categoryKey = CATEGORY_KEY_MAP[category]
  const geneCount = associatedGenes?.gene_categories?.[categoryKey] || 0
  
  if (geneCount === 0) return null
  
  // Calculate per_gene
  const geneCategoryStats = getGeneCategoryStats(stats, category)
  const totalGenes = geneCategoryStats?.total_count || 0
  const perGene = totalGenes > 0 ? (typeStats.total_count || 0) / totalGenes : 0
  
  return {
    count: typeStats.total_count || 0,
    per_gene: perGene,
    exons_per_transcript: typeStats.exon_stats?.total_count && typeStats.total_count 
      ? typeStats.exon_stats.total_count / typeStats.total_count 
      : 0,
    length_stats: typeStats.length_stats ? {
      mean: typeStats.length_stats.mean || 0,
      median: 0, // Not available in new structure
    } : undefined,
    spliced_length_stats: typeStats.exon_stats?.concatenated_length ? {
      mean: typeStats.exon_stats.concatenated_length.mean || 0,
      median: 0, // Not available in new structure
    } : undefined,
    exon_length_stats: typeStats.exon_stats?.length ? {
      mean: typeStats.exon_stats.length.mean || 0,
      median: 0, // Not available in new structure
    } : undefined,
  }
}

export const calculateKPIs = (stats: any) => {
  const totalGenes = GENE_CATEGORIES.reduce((sum, cat) => {
    const categoryStats = getGeneCategoryStats(stats, cat)
    return sum + (categoryStats?.total_count || 0)
  }, 0)
  
  const totalTranscripts = GENE_CATEGORIES.reduce((sum, cat) => {
    return sum + getTranscriptCountForCategory(stats, cat)
  }, 0)
  
  // Calculate average exons per transcript
  let totalExons = 0
  let transcriptsWithExons = 0
  GENE_CATEGORIES.forEach(cat => {
    const exonStats = getExonStatsForCategory(stats, cat)
    const transcriptsCount = getTranscriptCountForCategory(stats, cat)
    if (transcriptsCount > 0) {
      totalExons += exonStats.count
      transcriptsWithExons += transcriptsCount
    }
  })
  const avgExonsPerTranscript = transcriptsWithExons > 0 ? (totalExons / transcriptsWithExons).toFixed(2) : '0'
  
  // Calculate mean gene length (weighted average)
  let totalLength = 0
  let totalCount = 0
  GENE_CATEGORIES.forEach(cat => {
    const categoryStats = getGeneCategoryStats(stats, cat)
    const count = categoryStats?.total_count || 0
    const meanLength = categoryStats?.length_stats?.mean || 0
    if (count > 0 && meanLength > 0) {
      totalLength += meanLength * count
      totalCount += count
    }
  })
  const meanGeneLength = totalCount > 0 ? Math.round(totalLength / totalCount) : 0
  
  // Find longest and shortest genes
  let longestGene = 0
  let shortestGene = Infinity
  GENE_CATEGORIES.forEach(cat => {
    const categoryStats = getGeneCategoryStats(stats, cat)
    const max = categoryStats?.length_stats?.max || 0
    const min = categoryStats?.length_stats?.min || Infinity
    if (max > longestGene) longestGene = max
    if (min < shortestGene && min > 0) shortestGene = min
  })
  
  return {
    totalGenes,
    totalTranscripts,
    avgExonsPerTranscript,
    meanGeneLength,
    longestGene,
    shortestGene,
  }
}

export const getFilteredTranscriptTypes = (
  allTypes: string[],
  selectedTypes: Set<string>
): string[] => {
  return selectedTypes.size === 0 
    ? allTypes 
    : allTypes.filter(type => selectedTypes.has(type))
}

export const createCategoryDatasets = (
  stats: any,
  transcriptTypes: string[],
  dataExtractor: (cat: GeneCategory, type: string) => number,
  selectedCategories: Set<GeneCategory>
) => {
  return GENE_CATEGORIES
    .filter(cat => {
      const categoryStats = getGeneCategoryStats(stats, cat)
      return categoryStats?.transcript_type_counts && Object.keys(categoryStats.transcript_type_counts).length > 0
    })
    .map(cat => ({
      label: CATEGORY_LABELS[cat],
      data: transcriptTypes.map(type => dataExtractor(cat, type)),
      backgroundColor: CATEGORY_COLORS[cat],
      hidden: !selectedCategories.has(cat),
    }))
}

