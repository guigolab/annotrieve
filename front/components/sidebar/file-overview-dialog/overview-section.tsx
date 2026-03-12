"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { BarChart3, Code, Layers, Workflow, Info, ChevronDown, ChevronUp } from "lucide-react"
import { useState, useCallback } from "react"
import {
  GENE_CATEGORIES,
  CATEGORY_LABELS,
  getAllTranscriptTypes,
  getGeneCategoryStats,
  getTranscriptTypeStats,
  type GeneCategory,
} from '../file-overview-dialog-helpers'
import { StatisticsInfoDialog } from './statistics-info-dialog'

interface OverviewSectionProps {
  stats: any
}

const CATEGORY_CONFIG = {
  coding_genes: {
    icon: Code,
    colorClass: 'text-primary',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary',
  },
  non_coding_genes: {
    icon: Layers,
    colorClass: 'text-secondary',
    bgClass: 'bg-secondary/10',
    borderClass: 'border-secondary',
  },
  pseudogenes: {
    icon: Workflow,
    colorClass: 'text-accent',
    bgClass: 'bg-accent/10',
    borderClass: 'border-accent',
  },
}

const renderValue = (value: any): number => {
  if (typeof value === 'object' && value !== null) {
    if (value.parsedValue !== undefined) {
      return Number(value.parsedValue)
    }
    if (value.source !== undefined) {
      return Number(value.source)
    }
    return Number(value)
  }
  return Number(value) || 0
}

// Biotype Progress Bar Component with Load More
interface BiotypeProgressBarProps {
  biotypeCounts: Record<string, number>
  colorClass?: string
}

function BiotypeProgressBar({ biotypeCounts, colorClass = 'bg-secondary' }: BiotypeProgressBarProps) {
  const [showAll, setShowAll] = useState(false)
  
  const entries = Object.entries(biotypeCounts)
    .map(([key, value]) => [key, value as number] as [string, number])
    .sort(([, a], [, b]) => b - a)
  
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const displayLimit = 5
  const hasMore = entries.length > displayLimit
  const displayedEntries = showAll ? entries : entries.slice(0, displayLimit)
  
  if (entries.length === 0) return null
  
  return (
    <div className="space-y-2">
      
      {/* Progress bars */}
      <div className="space-y-2.5">
        {displayedEntries.map(([biotype, count]) => {
          const percentage = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={biotype} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate flex-1 mr-2">{biotype}</span>
                <span className="text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                  {count.toLocaleString()} ({percentage.toFixed(2)}%)
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                  style={{ width: `${Math.min(percentage, 100)}%` }}
                  title={`${biotype}: ${count.toLocaleString()} (${percentage.toFixed(2)}%)`}
                />
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Load More button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2"
          aria-label={showAll ? 'Show less biotypes' : 'Show more biotypes'}
        >
          {showAll ? (
            <>
              Show less
              <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              Show {entries.length - displayLimit} more
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      )}
    </div>
  )
}

export function OverviewSection({ stats }: OverviewSectionProps) {
  const allTranscriptTypes = getAllTranscriptTypes(stats)
  const [expandedCategories, setExpandedCategories] = useState<Record<GeneCategory, boolean>>({
    coding_genes: false,
    non_coding_genes: false,
    pseudogenes: false,
  })
  const [expandedTranscriptTypes, setExpandedTranscriptTypes] = useState<Record<string, boolean>>({})
  const [infoDialogOpen, setInfoDialogOpen] = useState(false)

  const toggleCategory = useCallback((cat: GeneCategory) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }, [])

  const toggleTranscriptType = useCallback((type: string) => {
    setExpandedTranscriptTypes(prev => ({
      ...prev,
      [type]: !prev[type],
    }))
  }, [])

  // Sort transcript types by total count and calculate category breakdowns
  const sortedTranscriptTypes = allTranscriptTypes
    .map(type => {
      const typeStats = getTranscriptTypeStats(stats, type)
      if (!typeStats) return null
      
      const totalCount = typeStats.total_count || 0
      
      
      return {
        type,
        totalCount,
        stats: typeStats,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.totalCount - a.totalCount)

  return (
    <>
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h4 className="text-sm font-semibold">GFF Overview</h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInfoDialogOpen(true)}
            title="How statistics are computed"
            className="hover:bg-accent transition-colors"
            aria-label="View statistics information"
          >
            <Info className="h-4 w-4 mr-1.5" />
            Info
          </Button>
        </div>
      
      <div className="space-y-6">
        {/* Gene Categories Section */}
        <div>
          <h5 className="text-xs font-medium mb-4 text-foreground">Gene Categories</h5>
          <div className="space-y-3">
            {GENE_CATEGORIES.map(cat => {
              const categoryStats = getGeneCategoryStats(stats, cat)
              if (!categoryStats) return null

              const config = CATEGORY_CONFIG[cat]
              const Icon = config.icon
              const isExpanded = expandedCategories[cat]
              const lengthStats = categoryStats.length_stats
              const min = renderValue(lengthStats?.min) || 0
              const max = renderValue(lengthStats?.max) || 0
              const mean = renderValue(lengthStats?.mean) || 0

              return (
                <Collapsible
                  key={cat}
                  open={isExpanded}
                  onOpenChange={() => toggleCategory(cat)}
                >
                  <Card className={`border-2 transition-all duration-200 hover:shadow-md ${config.borderClass} ${isExpanded ? 'shadow-sm' : ''}`}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="collapse"
                        className="w-full justify-between p-4 h-auto hover:bg-accent/5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${CATEGORY_LABELS[cat]} details`}
                      >
                        <div className="flex items-center gap-3 flex-1 text-left">
                          <div className={`p-2 rounded-lg ${config.bgClass} flex-shrink-0 transition-colors`}>
                            <Icon className={`h-5 w-5 ${config.colorClass}`} aria-hidden="true" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <h6 className={`text-sm font-semibold ${config.colorClass}`}>
                                {CATEGORY_LABELS[cat]}
                              </h6>
                              <Badge variant="outline" className="text-xs font-semibold">
                                {categoryStats.total_count?.toLocaleString() || 0} genes
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              <span>Min: <span className="font-mono font-medium">{min.toLocaleString()}</span> bp</span>
                              <span>Mean: <span className="font-mono font-medium">{mean.toLocaleString()}</span> bp</span>
                              <span>Max: <span className="font-mono font-medium">{max.toLocaleString()}</span> bp</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-2">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform duration-200" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" aria-hidden="true" />
                          )}
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent 
                      className="overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                    >
                      <div className="px-4 pb-4" aria-label={`${CATEGORY_LABELS[cat]} details`}>
                        <div className="space-y-5 pt-4 border-t border-border/50">
                          {/* Transcript Type Counts */}
                          {categoryStats.transcript_type_counts && Object.keys(categoryStats.transcript_type_counts).length > 0 ? (
                            <div>
                              <h6 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                Transcript Types ({Object.keys(categoryStats.transcript_type_counts).length})
                              </h6>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(categoryStats.transcript_type_counts)
                                  .sort(([, a], [, b]) => (b as number) - (a as number))
                                  .map(([type, count]) => (
                                    <Badge 
                                      key={type} 
                                      variant="outline" 
                                      className="text-xs transition-colors hover:bg-accent/50 cursor-default"
                                      title={`${type}: ${(count as number).toLocaleString()} transcripts`}
                                    >
                                      <span className="font-semibold">{type}</span>
                                      <span className="text-muted-foreground ml-1">{(count as number).toLocaleString()}</span>
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground italic py-2">
                              No transcript types available
                            </div>
                          )}

                          {/* Biotype Counts */}
                          {categoryStats.biotype_counts && Object.keys(categoryStats.biotype_counts).length > 0 ? (
                            <div>
                              <h6 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                Biotypes ({Object.keys(categoryStats.biotype_counts).length})
                              </h6>
                              <BiotypeProgressBar 
                                biotypeCounts={categoryStats.biotype_counts as Record<string, number>}
                                colorClass={config.bgClass.replace('/10', '')}
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )
            })}
          </div>
        </div>

        {/* Transcript Types Section */}
        {sortedTranscriptTypes.length > 0 ? (
          <div>
            <h5 className="text-xs font-medium mb-4 text-foreground">Transcript Types ({sortedTranscriptTypes.length})</h5>
            <div className="space-y-3">
              {sortedTranscriptTypes.map(({ type, totalCount, stats: typeStats }) => {
                if (!typeStats) return null
                const isExpanded = expandedTranscriptTypes[type]
                const lengthStats = typeStats.length_stats
                const min = renderValue(lengthStats?.min) || 0
                const max = renderValue(lengthStats?.max) || 0
                const mean = renderValue(lengthStats?.mean) || 0

                return (
                  <Collapsible
                    key={type}
                    open={isExpanded}
                    onOpenChange={() => toggleTranscriptType(type)}
                  >
                    <Card className={`transition-all duration-200 hover:shadow-md ${isExpanded ? 'shadow-sm' : ''}`}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="collapse"
                          className="w-full justify-between p-4 h-auto hover:bg-accent/5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${type} transcript details`}
                        >
                          <div className="flex items-center gap-3 flex-1 text-left">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <h6 className="text-sm font-semibold truncate">
                                  {type}
                                </h6>
                                <Badge variant="outline" className="text-xs font-semibold">
                                  {totalCount.toLocaleString()} transcripts
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                <span>Min: <span className="font-mono font-medium">{min.toLocaleString()}</span> bp</span>
                                <span>Mean: <span className="font-mono font-medium">{mean.toLocaleString()}</span> bp</span>
                                <span>Max: <span className="font-mono font-medium">{max.toLocaleString()}</span> bp</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-2">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground transition-transform duration-200" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" aria-hidden="true" />
                            )}
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent 
                        className="overflow-hidden transition-all duration-300 ease-in-out data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
                      >
                        <div className="px-4 pb-4" aria-label={`${type} transcript details`}>
                        <div className="space-y-5 pt-4 border-t border-border/50">
                          {/* Associated Genes */}
                          {typeStats.associated_genes && (
                            <div>
                              <div className="mb-3">
                                <h6 className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                                  Parent Genes
                                </h6>
                              </div>
                              <div className="space-y-3">
          
                                {typeStats.associated_genes.gene_categories && Object.keys(typeStats.associated_genes.gene_categories).length > 0 && (
                                  <div>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(typeStats.associated_genes.gene_categories)
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .map(([category, count]) => {
                                          // Map category keys to GeneCategory type for consistent colors
                                          const categoryMap: Record<string, GeneCategory> = {
                                            'coding': 'coding_genes',
                                            'non_coding': 'non_coding_genes',
                                            'pseudogene': 'pseudogenes',
                                          }
                                          const geneCategory = categoryMap[category]
                                          const config = geneCategory ? CATEGORY_CONFIG[geneCategory] : null
                                          const categoryLabel = category === 'coding' ? 'Coding Genes' 
                                            : category === 'non_coding' ? 'Non-coding Genes'
                                            : category === 'pseudogene' ? 'Pseudogenes'
                                            : category
                                          
                                          return (
                                            <Badge 
                                              key={category} 
                                              variant="outline" 
                                              className={`text-xs border-2 hover:bg-accent/50 ${config?.borderClass || ''}`}
                                              title={`${categoryLabel}: ${(count as number).toLocaleString()} parent genes`}
                                            >
                                              <span className={config?.colorClass || ''}>{categoryLabel}</span>
                                              <span className={config?.colorClass + ' ml-1' || 'ml-1'}>{(count as number).toLocaleString()}</span>
                                            </Badge>
                                          )
                                        })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Biotype Counts */}
                          {typeStats.biotype_counts && Object.keys(typeStats.biotype_counts).length > 0 ? (
                            <div>
                              <h6 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                Biotypes ({Object.keys(typeStats.biotype_counts).length})
                              </h6>
                              <BiotypeProgressBar 
                                biotypeCounts={typeStats.biotype_counts as Record<string, number>}
                                colorClass="bg-slate-500"
                              />
                            </div>
                          ) : null}

                          {/* Exon Stats */}
                          {typeStats.exon_stats && (
                            <div>
                              <h6 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                Exon Statistics
                              </h6>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total Count: </span>
                                  <span className="font-mono font-semibold">
                                    {typeStats.exon_stats.total_count?.toLocaleString() || 0}
                                  </span>
                                </div>
                                {typeStats.exon_stats.length?.mean && (
                                  <div>
                                    <span className="text-muted-foreground">Mean Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.length.mean).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.exon_stats.length?.min && (
                                  <div>
                                    <span className="text-muted-foreground">Min Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.length.min).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.exon_stats.length?.max && (
                                  <div>
                                    <span className="text-muted-foreground">Max Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.length.max).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.exon_stats.concatenated_length?.mean && (
                                  <div>
                                    <span className="text-muted-foreground">Mean Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.concatenated_length.mean).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.exon_stats.concatenated_length?.min && (
                                  <div>
                                    <span className="text-muted-foreground">Min Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.concatenated_length.min).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.exon_stats.concatenated_length?.max && (
                                  <div>
                                    <span className="text-muted-foreground">Max Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.exon_stats.concatenated_length.max).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* CDS Stats */}
                          {typeStats.cds_stats && (
                            <div>
                              <h6 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                CDS Statistics
                              </h6>
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Total Count: </span>
                                  <span className="font-mono font-semibold">
                                    {typeStats.cds_stats.total_count?.toLocaleString() || 0}
                                  </span>
                                </div>
                                {typeStats.cds_stats.length?.mean && (
                                  <div>
                                    <span className="text-muted-foreground">Mean Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.length.mean).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.cds_stats.length?.min && (
                                  <div>
                                    <span className="text-muted-foreground">Min Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.length.min).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.cds_stats.length?.max && (
                                  <div>
                                    <span className="text-muted-foreground">Max Length: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.length.max).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.cds_stats.concatenated_length?.mean && (
                                  <div>
                                    <span className="text-muted-foreground">Mean Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.concatenated_length.mean).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.cds_stats.concatenated_length?.min && (
                                  <div>
                                    <span className="text-muted-foreground">Min Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.concatenated_length.min).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                                {typeStats.cds_stats.concatenated_length?.max && (
                                  <div>
                                    <span className="text-muted-foreground">Max Concatenated: </span>
                                    <span className="font-mono font-semibold">
                                      {renderValue(typeStats.cds_stats.concatenated_length.max).toLocaleString()} bp
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>No transcript types available</p>
          </div>
        )}
        
      </div>
    </Card>

    <StatisticsInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} />
    </>
  )
}
