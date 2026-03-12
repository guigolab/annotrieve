"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, BarChart3, Dna, FileText, Activity, Hash, Ruler, Layers, Code, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui"
import { ActiveFilters } from "@/components/annotations/active-filters"
import { GeneHistogramChart } from "@/components/annotations-stats/gene-histogram-chart"
import { TranscriptHistogramChart } from "@/components/annotations-stats/transcript-histogram-chart"
import { StatsSidebar } from "@/components/annotations-stats/stats-sidebar"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { getGeneStats, getTranscriptStats, getGeneCategoryDetails, getTranscriptTypeDetails, type GeneStatsSummary, type TranscriptStatsSummary, type GeneCategoryDetails, type TranscriptTypeDetails } from "@/lib/api/annotations"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"

export default function AnnotationsStatsPage() {
  const router = useRouter()
  const [geneStats, setGeneStats] = useState<GeneStatsSummary | null>(null)
  const [transcriptStats, setTranscriptStats] = useState<TranscriptStatsSummary | null>(null)
  const [geneStatsLoading, setGeneStatsLoading] = useState(true)
  const [transcriptStatsLoading, setTranscriptStatsLoading] = useState(true)
  const [selectedGeneCategory, setSelectedGeneCategory] = useState<string | null>(null)
  const [selectedTranscriptType, setSelectedTranscriptType] = useState<string | null>(null)
  const [geneCategoryDetails, setGeneCategoryDetails] = useState<GeneCategoryDetails | null>(null)
  const [transcriptTypeDetails, setTranscriptTypeDetails] = useState<TranscriptTypeDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [showAllGeneStats, setShowAllGeneStats] = useState(false)
  const [showAllTranscriptStats, setShowAllTranscriptStats] = useState(false)
  
  // Get filter values from store
  const buildAnnotationsParams = useAnnotationsFiltersStore((state) => state.buildAnnotationsParams)
  const hasActiveFilters = useAnnotationsFiltersStore((state) => state.hasActiveFilters)

  // Fetch gene stats - only on mount, filters don't change on this page
  useEffect(() => {
    let cancelled = false

    async function fetchGeneStats() {
      try {
        setGeneStatsLoading(true)
        const params = buildAnnotationsParams(false, [])
        // Remove pagination params
        delete params.limit
        delete params.offset
        
        const result = await getGeneStats(params)
        if (!cancelled) {
          setGeneStats(result)
        }
      } catch (error) {
        console.error('Error fetching gene stats:', error)
        if (!cancelled) {
          setGeneStats(null)
        }
      } finally {
        if (!cancelled) {
          setGeneStatsLoading(false)
        }
      }
    }

    fetchGeneStats()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only fetch on mount, filters are read from store but don't change here

  // Fetch transcript stats - only on mount, filters don't change on this page
  useEffect(() => {
    let cancelled = false

    async function fetchTranscriptStats() {
      try {
        setTranscriptStatsLoading(true)
        const params = buildAnnotationsParams(false, [])
        // Remove pagination params
        delete params.limit
        delete params.offset
        
        const result = await getTranscriptStats(params)
        if (!cancelled) {
          setTranscriptStats(result)
        }
      } catch (error) {
        console.error('Error fetching transcript stats:', error)
        if (!cancelled) {
          setTranscriptStats(null)
        }
      } finally {
        if (!cancelled) {
          setTranscriptStatsLoading(false)
        }
      }
    }

    fetchTranscriptStats()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only fetch on mount, filters are read from store but don't change here

  const handleBack = () => {
    router.push("/annotations")
  }

  // Handle gene category selection - deselect transcript type if selected
  const handleGeneCategorySelect = (category: string | null) => {
    setSelectedGeneCategory(category)
    setShowAllGeneStats(false)
    if (category) {
      setSelectedTranscriptType(null)
      setTranscriptTypeDetails(null)
      setShowAllTranscriptStats(false)
    }
  }

  // Handle transcript type selection - deselect gene category if selected
  const handleTranscriptTypeSelect = (type: string | null) => {
    setSelectedTranscriptType(type)
    setShowAllTranscriptStats(false)
    if (type) {
      setSelectedGeneCategory(null)
      setGeneCategoryDetails(null)
      setShowAllGeneStats(false)
    }
  }

  // Fetch gene category details when selected
  useEffect(() => {
    if (!selectedGeneCategory) {
      setGeneCategoryDetails(null)
      return
    }

    let cancelled = false

    async function fetchGeneCategoryDetails() {
      try {
        setDetailsLoading(true)
        const params = buildAnnotationsParams(false, [])
        delete params.limit
        delete params.offset
        
        const result = await getGeneCategoryDetails(selectedGeneCategory!, params)
        if (!cancelled) {
          setGeneCategoryDetails(result)
        }
      } catch (error) {
        console.error('Error fetching gene category details:', error)
        if (!cancelled) {
          setGeneCategoryDetails(null)
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false)
        }
      }
    }

    fetchGeneCategoryDetails()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGeneCategory]) // Only react to category selection, filters are read from store but don't change here

  // Fetch transcript type details when selected
  useEffect(() => {
    if (!selectedTranscriptType) {
      setTranscriptTypeDetails(null)
      return
    }

    let cancelled = false

    async function fetchTranscriptTypeDetails() {
      try {
        setDetailsLoading(true)
        const params = buildAnnotationsParams(false, [])
        delete params.limit
        delete params.offset
        
        const result = await getTranscriptTypeDetails(selectedTranscriptType!, params)
        if (!cancelled) {
          setTranscriptTypeDetails(result)
        }
      } catch (error) {
        console.error('Error fetching transcript type details:', error)
        if (!cancelled) {
          setTranscriptTypeDetails(null)
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false)
        }
      }
    }

    fetchTranscriptTypeDetails()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTranscriptType]) // Only react to type selection, filters are read from store but don't change here

  const formatLabel = (str: string) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const formatTranscriptTypeLabel = (str: string) => {
    return str.replace(/_/g, ' ')
  }

  const formatMetricLabel = (metric: string) => {
    const formatted = formatLabel(metric)
    const lowerFormatted = formatted.toLowerCase()
    let result: string
    if (lowerFormatted.startsWith('average')) {
      result = formatted
    } else {
      result = `Average ${formatted}`
    }
    return result.charAt(0).toUpperCase() + result.slice(1)
  }

  const getMetricIcon = (metric: string) => {
    const lowerMetric = metric.toLowerCase()
    if (lowerMetric.includes('count')) {
      return Hash
    } else if (lowerMetric.includes('length')) {
      return Ruler
    } else if (lowerMetric.includes('exon')) {
      return Layers
    } else if (lowerMetric.includes('cds') || lowerMetric.includes('coding')) {
      return Code
    }
    return BarChart3
  }

  const getMetricColor = (metric: string) => {
    const lowerMetric = metric.toLowerCase()
    if (lowerMetric.includes('exon')) {
      return {
        bg: 'bg-muted/50',
        text: 'text-foreground',
        border: 'border-border',
        iconBg: 'bg-blue-500/20',
        iconColor: 'text-blue-600'
      }
    } else if (lowerMetric.includes('cds') || lowerMetric.includes('coding')) {
      return {
        bg: 'bg-muted/50',
        text: 'text-foreground',
        border: 'border-border',
        iconBg: 'bg-green-500/20',
        iconColor: 'text-green-600'
      }
    }
    return {
      bg: 'bg-muted/50',
      text: 'text-foreground',
      border: 'border-border',
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground'
    }
  }

  return (
    <>
      <RightSidebar />
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Header */}
        <header className="px-6 pt-6 pb-4 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to annotations
                </Button>
              </div>
              <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                Statistics
              </h1>
              <p className="text-sm text-muted-foreground">
                View gene and transcript statistics with interactive histograms for the current filter selection.
              </p>
            </div>
          </div>
          
          {/* Active Filters - Read Only */}
          <div className="pt-2 flex items-center gap-3">
            <span className="font-bold text-sm text-foreground whitespace-nowrap">Active filters</span>
            {hasActiveFilters() ? (
              <ActiveFilters readOnly={true} />
            ) : (
              <span className="text-sm text-muted-foreground">No active filters</span>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar - Categories and Types */}
          <div className="w-64 flex-shrink-0 border-r border-border">
            <StatsSidebar
              geneStats={geneStats}
              transcriptStats={transcriptStats}
              geneStatsLoading={geneStatsLoading}
              transcriptStatsLoading={transcriptStatsLoading}
              selectedGeneCategory={selectedGeneCategory}
              selectedTranscriptType={selectedTranscriptType}
              onGeneCategorySelect={handleGeneCategorySelect}
              onTranscriptTypeSelect={handleTranscriptTypeSelect}
            />
          </div>

          {/* Right Main Content - Summary and Charts */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-background">
            <div className="p-4 space-y-4">
              {/* Gene Category View */}
              {selectedGeneCategory && (
                <>
                  {/* Header Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Dna className="h-6 w-6 text-primary" />
                      <h2 className="text-2xl font-semibold">{formatLabel(selectedGeneCategory)}</h2>
                    </div>
                    {geneCategoryDetails && (
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Annotations with values</div>
                        <div className="text-lg font-semibold">
                          {geneCategoryDetails.annotations_count > 0 || geneCategoryDetails.missing_annotations_count > 0
                            ? (
                                (geneCategoryDetails.annotations_count / 
                                 (geneCategoryDetails.annotations_count + geneCategoryDetails.missing_annotations_count) * 100)
                                  .toFixed(1)
                              )
                            : '0'
                          }%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {geneCategoryDetails.annotations_count.toLocaleString()} / {(geneCategoryDetails.annotations_count + geneCategoryDetails.missing_annotations_count).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Stats Cards */}
                  {detailsLoading && !geneCategoryDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Activity className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading category details...</p>
                      </div>
                    </div>
                  ) : geneCategoryDetails ? (() => {
                    const summaryEntries = geneCategoryDetails.summary 
                      ? Object.entries(geneCategoryDetails.summary).filter(([_, values]) => {
                          if (!values || typeof values !== 'object') return false
                          const mean = (values as any).mean
                          return mean !== undefined && mean !== null && typeof mean === 'number' && !isNaN(mean)
                        })
                      : []
                    const visibleEntries = showAllGeneStats ? summaryEntries : summaryEntries.slice(0, 3)
                    const hasMore = summaryEntries.length > 3
                    
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {visibleEntries.map(([metric, values]) => {
                            const mean = (values as any).mean
                            const Icon = getMetricIcon(metric)
                            const colors = getMetricColor(metric)
                            
                            return (
                              <Card key={metric} className={`p-4 border ${colors.border} hover:shadow-lg transition-all duration-200`}>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${colors.iconBg}`}>
                                      <Icon className={`h-5 w-5 ${colors.iconColor}`} />
                                    </div>
                                    <div className={`text-sm font-medium ${colors.text} flex-1`}>
                                      {formatMetricLabel(metric)}
                                    </div>
                                  </div>
                                  <div className={`text-3xl font-bold ${colors.text}`}>
                                    {mean.toFixed(2)}
                                    {metric.toLowerCase().includes('length') && (
                                      <span className="text-lg text-muted-foreground ml-1">bp</span>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            )
                          })}
                        </div>
                        {hasMore && (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAllGeneStats(!showAllGeneStats)}
                              className="gap-2"
                            >
                              {showAllGeneStats ? (
                                <>
                                  <ChevronUp className="h-4 w-4" />
                                  Show Less
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4" />
                                  Show More ({summaryEntries.length - 3} more)
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })() : null}

                  {/* Histogram Card */}
                  <Card className="p-4">
                    <GeneHistogramChart selectedCategory={selectedGeneCategory} />
                  </Card>
                </>
              )}

              {/* Transcript Type View */}
              {selectedTranscriptType && (
                <>
                  {/* Header Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-6 w-6 text-primary" />
                      <h2 className="text-2xl font-semibold">{formatTranscriptTypeLabel(selectedTranscriptType)}</h2>
                    </div>
                    {transcriptTypeDetails && (
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Annotations with values</div>
                        <div className="text-lg font-semibold">
                          {transcriptTypeDetails.annotations_count > 0 || transcriptTypeDetails.missing_annotations_count > 0
                            ? (
                                (transcriptTypeDetails.annotations_count / 
                                 (transcriptTypeDetails.annotations_count + transcriptTypeDetails.missing_annotations_count) * 100)
                                  .toFixed(1)
                              )
                            : '0'
                          }%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {transcriptTypeDetails.annotations_count.toLocaleString()} / {(transcriptTypeDetails.annotations_count + transcriptTypeDetails.missing_annotations_count).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Summary Stats Cards */}
                  {detailsLoading && !transcriptTypeDetails ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <Activity className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading type details...</p>
                      </div>
                    </div>
                  ) : transcriptTypeDetails ? (() => {
                    const summaryEntries = transcriptTypeDetails.summary 
                      ? Object.entries(transcriptTypeDetails.summary).filter(([_, values]) => {
                          if (!values || typeof values !== 'object') return false
                          const mean = (values as any).mean
                          return mean !== undefined && mean !== null && typeof mean === 'number' && !isNaN(mean)
                        })
                      : []
                    const visibleEntries = showAllTranscriptStats ? summaryEntries : summaryEntries.slice(0, 3)
                    const hasMore = summaryEntries.length > 3
                    
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {visibleEntries.map(([metric, values]) => {
                            const mean = (values as any).mean
                            const Icon = getMetricIcon(metric)
                            const colors = getMetricColor(metric)
                            
                            return (
                              <Card key={metric} className={`p-4 border ${colors.border} hover:shadow-lg transition-all duration-200`}>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${colors.iconBg}`}>
                                      <Icon className={`h-5 w-5 ${colors.iconColor}`} />
                                    </div>
                                    <div className={`text-sm font-medium ${colors.text} flex-1`}>
                                      {formatMetricLabel(metric)}
                                    </div>
                                  </div>
                                  <div className={`text-3xl font-bold ${colors.text}`}>
                                    {mean.toFixed(2)}
                                    {metric.toLowerCase().includes('length') && (
                                      <span className="text-lg text-muted-foreground ml-1">bp</span>
                                    )}
                                  </div>
                                </div>
                              </Card>
                            )
                          })}
                        </div>
                        {hasMore && (
                          <div className="flex justify-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAllTranscriptStats(!showAllTranscriptStats)}
                              className="gap-2"
                            >
                              {showAllTranscriptStats ? (
                                <>
                                  <ChevronUp className="h-4 w-4" />
                                  Show Less
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-4 w-4" />
                                  Show More ({summaryEntries.length - 3} more)
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })() : null}

                  {/* Histogram Card */}
                  <Card className="p-4">
                    <TranscriptHistogramChart selectedType={selectedTranscriptType} />
                  </Card>
                </>
              )}

              {/* Empty State */}
              {!selectedGeneCategory && !selectedTranscriptType && (
                <div className="flex items-center justify-center py-12 border border-dashed rounded-lg bg-muted/30">
                  <div className="text-center text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium mb-1">No selection</p>
                    <p className="text-sm">Select a gene category or transcript type from the sidebar to view details and histograms</p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

