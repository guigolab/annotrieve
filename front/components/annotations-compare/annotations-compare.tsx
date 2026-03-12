"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { BarChart3, X, AlertCircle, ChevronDown, Loader2, Info } from "lucide-react"
import type { Annotation } from "@/lib/types"
import { listAnnotations } from "@/lib/api/annotations"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
} from 'chart.js'
import { useUIStore } from "@/lib/stores/ui"

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement
)

interface AnnotationsCompareProps {
  favoriteAnnotations: Annotation[]
  showFavs?: boolean,
  totalAnnotations: number
}

export function AnnotationsCompare({ favoriteAnnotations, showFavs = false, totalAnnotations }: AnnotationsCompareProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  
  // Lazy loading state
  const [loadedAnnotations, setLoadedAnnotations] = useState<Annotation[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [currentOffset, setCurrentOffset] = useState(0)
  const itemsPerPage = 20
  const observerTarget = useRef<HTMLDivElement>(null)
  
  const MAX_COMPARISON = 10
  const openRightSidebar = useUIStore((state) => state.openRightSidebar)
  const removeFromCart = useSelectedAnnotationsStore((state) => state.removeFromCart)

  // Get store state and actions
  const buildAnnotationsParams = useAnnotationsFiltersStore((state) => state.buildAnnotationsParams)
  const stats = useAnnotationsFiltersStore((state) => state.stats)
  
  // Get filter state to detect changes (for resetting loaded annotations)
  // Use correct property names from the store
  const selectedTaxons = useAnnotationsFiltersStore((state) => state.selectedTaxons)
  const selectedAssemblies = useAnnotationsFiltersStore((state) => state.selectedAssemblies)
  const selectedAssemblyLevels = useAnnotationsFiltersStore((state) => state.selectedAssemblyLevels)
  const selectedAssemblyStatuses = useAnnotationsFiltersStore((state) => state.selectedAssemblyStatuses)
  const onlyRefGenomes = useAnnotationsFiltersStore((state) => state.onlyRefGenomes)
  const biotypes = useAnnotationsFiltersStore((state) => state.biotypes)
  const featureTypes = useAnnotationsFiltersStore((state) => state.featureTypes)
  const pipelines = useAnnotationsFiltersStore((state) => state.pipelines)
  const providers = useAnnotationsFiltersStore((state) => state.providers)
  const databaseSources = useAnnotationsFiltersStore((state) => state.databaseSources)
  const sortOption = useAnnotationsFiltersStore((state) => state.sortOption)

  // Use totalAnnotations from props (favorites view) or calculate from stats/store (normal view)
  // If stats exist and have a total, use that; otherwise fall back to 0 or loaded count
  const totalAnnotationsFromStore = stats?.total ?? 0
  const effectiveTotalAnnotations = showFavs ? totalAnnotations : totalAnnotationsFromStore

  // Use loaded annotations or favorite annotations based on view mode
  const displayAnnotations = loadedAnnotations
  const allAnnotationsForStats = displayAnnotations // All annotations we have loaded

  // Fetch annotations - can be used for both initial load and loading more
  const loadAnnotations = useCallback(async (offset: number, reset: boolean = false) => {
    if (showFavs || loadingMore) return

    setLoadingMore(true)
    try {
      const params = buildAnnotationsParams(false, [])
      params.limit = itemsPerPage
      params.offset = offset

      const res = await listAnnotations(params as any)
      const fetchedAnnotations = (res as any)?.results || []
      const total = (res as any)?.total ?? 0

      if (fetchedAnnotations.length > 0) {
        setLoadedAnnotations(prev => {
          if (reset) {
            // Reset mode: replace all annotations
            return fetchedAnnotations
          } else {
            // Append mode: add new annotations, avoiding duplicates
            const existingIds = new Set(prev.map(a => a.annotation_id))
            const newAnnotations = fetchedAnnotations.filter((a: Annotation) => !existingIds.has(a.annotation_id))
            return [...prev, ...newAnnotations]
          }
        })
        setCurrentOffset(offset + fetchedAnnotations.length)
        setHasMore(offset + fetchedAnnotations.length < total)
      } else {
        setHasMore(false)
      }
    } catch (error) {
      console.error('Error loading annotations:', error)
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [showFavs, loadingMore, buildAnnotationsParams])

  // Fetch more annotations for lazy loading
  const loadMoreAnnotations = useCallback(() => {
    if (showFavs || loadingMore || !hasMore) return
    loadAnnotations(currentOffset, false)
  }, [showFavs, loadingMore, hasMore, currentOffset, loadAnnotations])

  // Create a filter key to detect filter changes
  // Extract taxids and assembly accessions from the store objects
  const selectedTaxids = selectedTaxons.map(t => t.taxid)
  const selectedAssemblyAccessions = selectedAssemblies.map(a => a.assembly_accession)
  const filterKey = JSON.stringify({
    selectedTaxids,
    selectedAssemblyAccessions,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    pipelines,
    providers,
    databaseSources,
    sortOption,
  })

  // Track previous filter key to detect filter changes
  const prevFilterKeyRef = useRef<string | null>(null)

  // Reset selected annotations when switching between favorites and default view
  useEffect(() => {
    setSelectedForComparison([])
    // Reset filter key ref when view changes
    prevFilterKeyRef.current = null
  }, [showFavs])

  // Reset selected annotations when filters change (only in non-favorites view)
  useEffect(() => {
    // Skip on initial mount or if in favorites view
    if (showFavs || prevFilterKeyRef.current === null) {
      prevFilterKeyRef.current = filterKey
      return
    }

    // Only reset if filter key actually changed
    if (prevFilterKeyRef.current !== filterKey) {
      setSelectedForComparison([])
      prevFilterKeyRef.current = filterKey
    }
  }, [filterKey, showFavs])

  // Initial load and reset when view mode or filters change
  useEffect(() => {
    if (!showFavs) return
    setLoadedAnnotations(favoriteAnnotations)
    setHasMore(false)
    setCurrentOffset(0)
  }, [showFavs, favoriteAnnotations])

  useEffect(() => {
    if (showFavs) return
    setLoadedAnnotations([])
    setCurrentOffset(0)
    setHasMore(true)
    loadAnnotations(0, true)
  }, [showFavs, filterKey, loadAnnotations])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (showFavs || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreAnnotations()
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loadingMore, showFavs, loadMoreAnnotations])


  const handleToggleAnnotation = (annotationId: string) => {
    setSelectedForComparison(prev => {
      if (prev.includes(annotationId)) {
        return prev.filter(id => id !== annotationId)
      } else {
        if (prev.length >= MAX_COMPARISON) {
          return prev
        }
        return [...prev, annotationId]
      }
    })
  }

  const handleClearSelection = () => {
    setSelectedForComparison([])
  }

  const handleSelectFirst10 = () => {
    if (displayAnnotations.length > 0) {
      const first10Ids = displayAnnotations.slice(0, MAX_COMPARISON).map(a => a.annotation_id)
      setSelectedForComparison(first10Ids)
    }
  }

  const selectedAnnotations = displayAnnotations.filter(a => 
    selectedForComparison.includes(a.annotation_id)
  )

  const handleRemoveFavorite = useCallback((annotationId: string) => {
    removeFromCart(annotationId)
    if (!showFavs) return
    setLoadedAnnotations(prev => prev.filter(a => a.annotation_id !== annotationId))
    setSelectedForComparison(prev => prev.filter(id => id !== annotationId))
  }, [removeFromCart, showFavs])

  // Create mapping for organism names with duplicates
  // Use all loaded annotations for proper labeling
  const createOrganismLabelMap = (annotations: Annotation[]) => {
    const organismCounts: Record<string, number> = {}
    const labelMap: Record<string, string> = {}
    
    annotations.forEach(annotation => {
      const organismName = annotation.organism_name
      organismCounts[organismName] = (organismCounts[organismName] || 0) + 1
      
      if (organismCounts[organismName] === 1) {
        labelMap[annotation.annotation_id] = organismName
      } else {
        labelMap[annotation.annotation_id] = `${organismName} (${organismCounts[organismName]})`
      }
    })
    
    return labelMap
  }

  // Create label map for all loaded annotations
  const organismLabelMap = createOrganismLabelMap(displayAnnotations)

  return (
    <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:h-full h-auto lg:overflow-hidden px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      {/* Left Column - Annotation Selection List */}
      <div className="lg:w-1/3 xl:w-1/4 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-border pb-4 lg:pb-0 lg:pr-6 flex-shrink-0">
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-foreground">Annotations</h3>
            <div className="flex items-center gap-2">
              {selectedForComparison.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-7 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
              {displayAnnotations.length > 0 && selectedForComparison.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectFirst10}
                  className="h-7 text-xs"
                >
                  Select First {MAX_COMPARISON}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Select up to {MAX_COMPARISON} to compare
            {selectedForComparison.length > 0 && (
              <span className="font-semibold text-foreground ml-1">
                ({selectedForComparison.length}/{MAX_COMPARISON})
              </span>
            )}
          </p>
          {!showFavs && (
            <div className="text-xs text-muted-foreground">
              {displayAnnotations.length > 0 && effectiveTotalAnnotations > 0 && (
                <>Loaded {displayAnnotations.length} of {effectiveTotalAnnotations}</>
              )}
            </div>
          )}
        </div>

        {/* Annotation List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 -mr-6 pr-6 lg:flex-1">
          {displayAnnotations.length === 0 && !loadingMore ? (
            <Card className="p-6 border-2 border-dashed">
              <div className="text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 opacity-50 mx-auto mb-2" />
                <p className="text-xs">No annotations available</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {displayAnnotations.map((annotation) => {
                const isSelected = selectedForComparison.includes(annotation.annotation_id)
                const isDisabled = !isSelected && selectedForComparison.length >= MAX_COMPARISON

                return (
                  <Card
                    key={annotation.annotation_id}
                    className={`p-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : isDisabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-primary/50 hover:bg-muted/50'
                    }`}
                    onClick={() => !isDisabled && handleToggleAnnotation(annotation.annotation_id)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={isDisabled}
                        onCheckedChange={() => !isDisabled && handleToggleAnnotation(annotation.annotation_id)}
                        className="mt-0.5 h-4 w-4"
                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 
                            className="text-sm font-medium text-foreground leading-tight"
                            title={organismLabelMap[annotation.annotation_id]}
                          >
                            {organismLabelMap[annotation.annotation_id]}
                          </h4>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {annotation.source_file_info.database}
                            </Badge>
                            {showFavs && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleRemoveFavorite(annotation.annotation_id)
                                }}
                                title="Remove from favorites"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground"
                              onClick={(event) => {
                                event.stopPropagation()
                                openRightSidebar("file-overview", { annotation })
                              }}
                              title="View details"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate" title={`${annotation.assembly_name} (${annotation.assembly_accession})`}>
                          {annotation.assembly_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground/80 font-mono truncate" title={annotation.assembly_accession}>
                          {annotation.assembly_accession}
                        </p>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>{new Date(annotation.source_file_info.release_date).toLocaleDateString()}</span>
                          {annotation.source_file_info.provider && (
                            <span>• {annotation.source_file_info.provider}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
              
              {/* Loading indicator and observer target for infinite scroll */}
              {!showFavs && (
                <div ref={observerTarget} className="flex justify-center items-center py-4">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Loading more annotations...</span>
                    </div>
                  )}
                  {!hasMore && displayAnnotations.length > 0 && (
                    <p className="text-xs text-muted-foreground">No more annotations to load</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column - Comparison Stats */}
      <div className="lg:w-2/3 xl:w-3/4 flex flex-col min-w-0 w-full lg:flex-1 lg:min-h-0">
        {selectedForComparison.length >= 2 ? (
          <ComparisonChartsSection 
            selectedAnnotations={selectedAnnotations}
            organismLabelMap={organismLabelMap}
          />
        ) : selectedForComparison.length === 1 ? (
          <Card className="p-6 sm:p-8 md:p-12 border-2 border-dashed">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 opacity-50 mx-auto mb-2 sm:mb-3" />
              <p className="text-xs sm:text-sm font-medium text-foreground mb-1">Select More Annotations</p>
              <p className="text-[10px] sm:text-xs">
                Select at least 2 annotations to view comparison charts.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8 md:p-12 border-2 border-dashed">
            <div className="text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 opacity-50 mx-auto mb-2 sm:mb-3" />
              <p className="text-xs sm:text-sm font-medium text-foreground mb-1">No Annotations Selected</p>
              <p className="text-[10px] sm:text-xs">
                Select annotations from the list to compare their statistics.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// Helper functions for overlap analysis
function findOverlappingItems(annotations: Annotation[], key: keyof Annotation['features_summary']): string[] {
  if (annotations.length === 0) return []
  
  // Get the first annotation's items as the base
  const firstItems = new Set(annotations[0].features_summary[key] as string[])
  
  // Find items that exist in all annotations
  const overlapping = Array.from(firstItems).filter(item => 
    annotations.every(ann => (ann.features_summary[key] as string[]).includes(item))
  )
  
  return overlapping.sort()
}

function findOverlappingRootTypes(annotations: Annotation[]): string[] {
  if (annotations.length === 0) return []
  
  const firstKeys = new Set(Object.keys(annotations[0].features_summary.root_type_counts))
  
  const overlapping = Array.from(firstKeys).filter(key => 
    annotations.every(ann => key in ann.features_summary.root_type_counts)
  )
  
  return overlapping.sort()
}

// Comparison Charts Section Component
function ComparisonChartsSection({ 
  selectedAnnotations,
  organismLabelMap
}: {
  selectedAnnotations: Annotation[]
  organismLabelMap: Record<string, string>
}) {

  // Find overlapping GFF structure elements
  const overlappingBiotypes = findOverlappingItems(selectedAnnotations, 'biotypes')
  const overlappingFeatureTypes = findOverlappingItems(selectedAnnotations, 'types')
  const overlappingRootTypes = findOverlappingRootTypes(selectedAnnotations)
  const overlappingAttributeKeys = findOverlappingItems(selectedAnnotations, 'attribute_keys')

  // Extract gene counts and length stats for each annotation using new structure
  const geneData = selectedAnnotations.map(ann => {    
    const featuresStatistics = ann.features_statistics
    
    // Use new gene_category_stats structure
    const codingGenes = featuresStatistics?.gene_category_stats?.['coding']
    const nonCodingGenes = featuresStatistics?.gene_category_stats?.['non_coding']
    const pseudogenes = featuresStatistics?.gene_category_stats?.['pseudogene']
    
    return {
      annotation: ann,
      codingGenes,
      nonCodingGenes,
      pseudogenes,
    }
  })

  // Extract transcript type stats for each annotation
  const transcriptData = selectedAnnotations.map(ann => {
    const featuresStatistics = ann.features_statistics
    // Use new transcript_type_stats structure
    const transcriptTypeStats = featuresStatistics?.transcript_type_stats || {}
    return {
      annotation: ann,
      transcriptTypeStats,
    }
  })

  // Check if any annotation has each gene type
  const hasCodingGenes = geneData.some(d => d.codingGenes !== null && d.codingGenes !== undefined)
  const hasNonCodingGenes = geneData.some(d => d.nonCodingGenes !== null && d.nonCodingGenes !== undefined)
  const hasPseudogenes = geneData.some(d => d.pseudogenes !== null && d.pseudogenes !== undefined)

  const [isGffSectionOpen, setIsGffSectionOpen] = useState(false)

  return (
    <div className="flex flex-col h-auto lg:h-full lg:min-h-0 lg:overflow-y-auto space-y-4 sm:space-y-6 mb-8">

      {/* GFF Structure Section - Collapsible */}
      <Collapsible open={isGffSectionOpen} onOpenChange={setIsGffSectionOpen}>
        <Card className="p-3 sm:p-4 flex-shrink-0">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
              <h4 className="text-base font-semibold text-foreground">GFF Structure Overlap</h4>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isGffSectionOpen ? 'transform rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-1 gap-3">
              <OverlapCard
                title="Common Biotypes"
                items={overlappingBiotypes}
                totalAnnotations={selectedAnnotations.length}
              />
              <OverlapCard
                title="Common Feature Types"
                items={overlappingFeatureTypes}
                totalAnnotations={selectedAnnotations.length}
              />
              <OverlapCard
                title="Common Root Types"
                items={overlappingRootTypes}
                totalAnnotations={selectedAnnotations.length}
              />
              <OverlapCard
                title="Common Attribute Keys"
                items={overlappingAttributeKeys}
                totalAnnotations={selectedAnnotations.length}
              />
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Gene Categories Comparison */}
      {(hasCodingGenes || hasNonCodingGenes || hasPseudogenes) && (
        <div className="space-y-4 flex-shrink-0">
          <GroupedGeneComparisonChart
            geneData={geneData}
            hasCodingGenes={hasCodingGenes}
            hasNonCodingGenes={hasNonCodingGenes}
            hasPseudogenes={hasPseudogenes}
            organismLabelMap={organismLabelMap}
          />

          <TranscriptTypeStackedBarChart
            transcriptData={transcriptData}
            organismLabelMap={organismLabelMap}
          />

          <TranscriptTypeHeatmap
            transcriptData={transcriptData}
            organismLabelMap={organismLabelMap}
          />
        </div>
      )}
    </div>
  )
}

// Overlap Card Component
function OverlapCard({ 
  title, 
  items, 
  totalAnnotations 
}: { 
  title: string
  items: string[]
  totalAnnotations: number
}) {
  const [expanded, setExpanded] = useState(false)
  const displayItems = expanded ? items : items.slice(0, 10)
  const hasMore = items.length > 10

  return (
    <Card className="p-2.5 sm:p-3 bg-muted/30">
      <div className="mb-2">
        <h5 className="text-xs sm:text-sm font-semibold text-foreground mb-0.5">{title}</h5>
        <p className="text-[10px] text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''} in all {totalAnnotations} annotation{totalAnnotations !== 1 ? 's' : ''}
        </p>
      </div>
      
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-1">
          No common items found
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {displayItems.map((item, idx) => (
              <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0 h-4">
                {item}
              </Badge>
            ))}
          </div>
          
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 h-6 text-[10px]"
            >
              {expanded ? 'Show Less' : `Show ${items.length - 10} More`}
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

// Grouped Gene Comparison Chart Component (Count or Length)
function GroupedGeneComparisonChart({ 
  geneData,
  hasCodingGenes,
  hasNonCodingGenes,
  hasPseudogenes,
  organismLabelMap
}: { 
  geneData: any[]
  hasCodingGenes: boolean
  hasNonCodingGenes: boolean
  hasPseudogenes: boolean
  organismLabelMap: Record<string, string>
}) {
  const [metricType, setMetricType] = useState<'count' | 'mean_length'>('count')
  
  // X-axis: Gene categories
  const labels = []
  if (hasCodingGenes) labels.push('Coding Genes')
  if (hasPseudogenes) labels.push('Pseudogenes')
  if (hasNonCodingGenes) labels.push('Non-coding Genes')
  
  // Create datasets for each annotation
  const colors = [
    '#3b82f6', // blue-500
    '#f97316', // orange-500
    '#a855f7', // purple-500
    '#10b981', // green-500
    '#ef4444', // red-500
    '#06b6d4', // cyan-500
    '#84cc16', // lime-500
    '#6366f1', // indigo-500
    '#ec4899', // pink-500
    '#f59e0b', // amber-500
    '#94a3b8', // slate-500
  ]
  
  const datasets = geneData.map((data, idx) => {
    const dataPoints = []
    
    if (metricType === 'count') {
      if (hasCodingGenes) dataPoints.push(data.codingGenes?.total_count || 0)
      if (hasPseudogenes) dataPoints.push(data.pseudogenes?.total_count || 0)
      if (hasNonCodingGenes) dataPoints.push(data.nonCodingGenes?.total_count || 0)
    } 
  
    else if (metricType === 'mean_length') {
      if (hasCodingGenes) {
        const lengthStats = data.codingGenes?.length_stats
        dataPoints.push(lengthStats?.mean || 0)
      }
      if (hasPseudogenes) {
        const lengthStats = data.pseudogenes?.length_stats
        dataPoints.push(lengthStats?.mean || 0)
      }
      if (hasNonCodingGenes) {
        const lengthStats = data.nonCodingGenes?.length_stats
        dataPoints.push(lengthStats?.mean || 0)
      }
    }

    
    return {
      label: organismLabelMap[data.annotation.annotation_id],
      data: dataPoints,
      backgroundColor: colors[idx % colors.length],
      borderColor: colors[idx % colors.length],
      borderWidth: 1,
    }
  })

  const chartData = {
    labels,
    datasets,
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: '#64748b',
          font: {
            size: 11,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#374151',
        borderWidth: 1,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y.toLocaleString()
            const suffix = metricType === 'count' ? '' : ' bp'
            return `${context.dataset.label}: ${value}${suffix}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 12,
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          display: false,
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 12,
          },
          callback: function(value: any) {
            return value.toLocaleString()
          },
        },
      },
    },
  }

  return (
    <Card className="p-3 sm:p-4 flex-shrink-0">
      <div className="mb-3">
        <h4 className="font-semibold text-sm sm:text-base text-foreground mb-1">
          Gene Category Comparison
        </h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">
          Compare gene metrics across different categories.
        </p>
          <Select value={metricType} onValueChange={(value: any) => setMetricType(value)}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">Gene Count</SelectItem>
            <SelectItem value="mean_length">Mean Length</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="h-[250px] sm:h-[300px]">
        <Bar data={chartData} options={options} />
      </div>
    </Card>
  )
}

// Transcript Type Stacked Bar Chart Component
function TranscriptTypeStackedBarChart({ 
  transcriptData,
  organismLabelMap
}: { 
  transcriptData: any[]
  organismLabelMap: Record<string, string>
}) {
  const [metricType, setMetricType] = useState<'count' | 'mean_length'>('count')
  
  // Extract all unique transcript types across all annotations
  const transcriptTypesSet = new Set<string>()
  transcriptData.forEach(data => {
    const typeStats = data.transcriptTypeStats
    if (typeStats) {
      Object.keys(typeStats).forEach(type => transcriptTypesSet.add(type))
    }
  })
  const types = Array.from(transcriptTypesSet).sort()
  
  if (types.length === 0) {
    return (
      <Card className="p-3 sm:p-4 flex-shrink-0">
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-muted-foreground italic">No transcript type data available</p>
        </div>
      </Card>
    )
  }

  // Generate colors for transcript types
  const typeColors = [
    '#3b82f6', '#f97316', '#a855f7', '#10b981', '#ef4444',
    '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6',
    '#6366f1', '#f43f5e', '#84cc16', '#0ea5e9', '#f59e0b',
    // Additional 30 complementary colors
    '#22c55e', '#eab308', '#dc2626', '#7c3aed', '#059669',
    '#ea580c', '#be185d', '#0891b2', '#65a30d', '#ca8a04',
    '#9333ea', '#16a34a', '#c2410c', '#9f1239', '#0e7490',
    '#4d7c0f', '#a16207', '#7e22ce', '#15803d', '#b91c1c',
    '#1e40af', '#c026d3', '#047857', '#d97706', '#be123c',
    '#0369a1', '#9333ea', '#059669', '#dc2626', '#7c2d12',
    '#1e3a8a', '#a21caf', '#065f46', '#b45309', '#991b1b',
  ]

  // Prepare stacked bar data - each annotation is a bar, transcript types are segments
  const labels = transcriptData.map(data => organismLabelMap[data.annotation.annotation_id])
  
  const datasets = types.map((type, idx) => ({
    label: type,
    data: transcriptData.map(data => {
      const typeStats = data.transcriptTypeStats?.[type]
      if (metricType === 'count') {
        return typeStats?.total_count || 0
      } else {
        return typeStats?.length_stats?.mean || 0
      }
    }),
    backgroundColor: typeColors[idx % typeColors.length],
    borderColor: typeColors[idx % typeColors.length],
    borderWidth: 1,
  }))

  const chartData = { labels, datasets }

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: '#64748b',
          font: { size: 10 },
          boxWidth: 12,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#374151',
        borderWidth: 1,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.x.toLocaleString()
            const suffix = metricType === 'count' ? ' transcripts' : ' bp'
            return `${context.dataset.label}: ${value}${suffix}`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          callback: function(value: any) {
            return value.toLocaleString()
          },
        },
        grid: {
          display: true,
          color: '#e2e8f0',
        },
      },
      y: {
        stacked: true,
        ticks: {
          color: '#64748b',
          font: { size: 11 },
        },
        grid: {
          display: false,
        },
      },
    },
  }

  return (
    <Card className="p-3 sm:p-4 flex-shrink-0">
      <div className="mb-3">
        <h4 className="font-semibold text-sm sm:text-base text-foreground mb-1">Transcript Type Distribution - Stacked</h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">
          Compare transcript types across annotations. Each bar represents an annotation, segments are transcript types.
        </p>
        <Select value={metricType} onValueChange={(value: any) => setMetricType(value)}>
          <SelectTrigger className="w-[140px] sm:w-[160px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">Transcript Count</SelectItem>
            <SelectItem value="mean_length">Mean Length</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="h-[250px] sm:h-[300px]">
        <Bar data={chartData} options={options} />
      </div>
    </Card>
  )
}

// Transcript Type Heatmap Component
function TranscriptTypeHeatmap({ 
  transcriptData,
  organismLabelMap
}: { 
  transcriptData: any[]
  organismLabelMap: Record<string, string>
}) {
  const [metricField, setMetricField] = useState<string>('length_min')
  
  // Extract all unique transcript types across all annotations
  const transcriptTypesSet = new Set<string>()
  transcriptData.forEach(data => {
    const typeStats = data.transcriptTypeStats
    if (typeStats) {
      Object.keys(typeStats).forEach(type => transcriptTypesSet.add(type))
    }
  })
  const types = Array.from(transcriptTypesSet).sort()
  
  if (types.length === 0) {
    return (
      <Card className="p-3 sm:p-4 flex-shrink-0">
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-muted-foreground italic">No transcript type data available</p>
        </div>
      </Card>
    )
  }

  // Helper function to extract value based on metric field
  const getMetricValue = (typeStats: any, field: string): number => {
    if (!typeStats) return 0
    
    // Length stats
    if (field === 'length_min') return typeStats.length_stats?.min || 0
    if (field === 'length_max') return typeStats.length_stats?.max || 0
  
    // Associated genes
    if (field === 'associated_genes_total') return typeStats.associated_genes?.total_count || 0
    if (field === 'associated_genes_coding') return typeStats.associated_genes?.gene_categories?.['coding'] || 0
    if (field === 'associated_genes_non_coding') return typeStats.associated_genes?.gene_categories?.['non_coding'] || 0
    if (field === 'associated_genes_pseudogene') return typeStats.associated_genes?.gene_categories?.['pseudogene'] || 0
    
    // Exon stats
    if (field === 'exon_total_count') return typeStats.exon_stats?.total_count || 0
    if (field === 'exon_length_min') return typeStats.exon_stats?.length?.min || 0
    if (field === 'exon_length_max') return typeStats.exon_stats?.length?.max || 0
    if (field === 'exon_length_mean') return typeStats.exon_stats?.length?.mean || 0
    if (field === 'exon_concat_min') return typeStats.exon_stats?.concatenated_length?.min || 0
    if (field === 'exon_concat_max') return typeStats.exon_stats?.concatenated_length?.max || 0
    if (field === 'exon_concat_mean') return typeStats.exon_stats?.concatenated_length?.mean || 0
    
    // CDS stats
    if (field === 'cds_total_count') return typeStats.cds_stats?.total_count || 0
    if (field === 'cds_length_min') return typeStats.cds_stats?.length?.min || 0
    if (field === 'cds_length_max') return typeStats.cds_stats?.length?.max || 0
    if (field === 'cds_length_mean') return typeStats.cds_stats?.length?.mean || 0
    if (field === 'cds_concat_min') return typeStats.cds_stats?.concatenated_length?.min || 0
    if (field === 'cds_concat_max') return typeStats.cds_stats?.concatenated_length?.max || 0
    if (field === 'cds_concat_mean') return typeStats.cds_stats?.concatenated_length?.mean || 0
    
    return 0
  }

  // Calculate max value for color scaling
  const allValues: number[] = []
  transcriptData.forEach(data => {
    types.forEach(type => {
      const typeStats = data.transcriptTypeStats?.[type]
      if (typeStats) {
        const value = getMetricValue(typeStats, metricField)
        allValues.push(value)
      }
    })
  })
  const maxValue = Math.max(...allValues, 1)

  // Helper to get color based on value - using blue palette consistent with app theme
  const getHeatmapColor = (value: number) => {
    const intensity = value / maxValue
    
    // Color palette from light blue to dark blue
    // Light: #dbeafe (blue-100) -> Dark: #1e40af (blue-800)
    const r = Math.floor(219 + intensity * (30 - 219))
    const g = Math.floor(234 + intensity * (64 - 234))
    const b = Math.floor(254 + intensity * (175 - 254))
    
    return `rgb(${r}, ${g}, ${b})`
  }

  return (
    <Card className="p-3 sm:p-4 flex-shrink-0">
      <div className="mb-3">
        <h4 className="font-semibold text-sm sm:text-base text-foreground mb-1">Transcript Type Heatmap</h4>
        <p className="text-[10px] sm:text-xs text-muted-foreground mb-3">
          Detailed matrix view of transcript types per annotation. Color intensity represents the selected metric.
        </p>
        <Select value={metricField} onValueChange={(value: any) => setMetricField(value)}>
          <SelectTrigger className="w-[160px] sm:w-[200px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            <SelectItem value="length_min">Length: Min</SelectItem>
            <SelectItem value="length_max">Length: Max</SelectItem>
            <SelectItem value="associated_genes_total">Associated Genes: Total</SelectItem>
            <SelectItem value="associated_genes_coding">Associated Genes: Coding</SelectItem>
            <SelectItem value="associated_genes_non_coding">Associated Genes: Non-coding</SelectItem>
            <SelectItem value="associated_genes_pseudogene">Associated Genes: Pseudogene</SelectItem>
            <SelectItem value="exon_total_count">Exon: Total Count</SelectItem>
            <SelectItem value="exon_length_min">Exon Length: Min</SelectItem>
            <SelectItem value="exon_length_max">Exon Length: Max</SelectItem>
            <SelectItem value="exon_length_mean">Exon Length: Mean</SelectItem>
            <SelectItem value="exon_concat_min">Exon Concatenated: Min</SelectItem>
            <SelectItem value="exon_concat_max">Exon Concatenated: Max</SelectItem>
            <SelectItem value="exon_concat_mean">Exon Concatenated: Mean</SelectItem>
            <SelectItem value="cds_total_count">CDS: Total Count</SelectItem>
            <SelectItem value="cds_length_min">CDS Length: Min</SelectItem>
            <SelectItem value="cds_length_max">CDS Length: Max</SelectItem>
            <SelectItem value="cds_length_mean">CDS Length: Mean</SelectItem>
            <SelectItem value="cds_concat_min">CDS Concatenated: Min</SelectItem>
            <SelectItem value="cds_concat_max">CDS Concatenated: Max</SelectItem>
            <SelectItem value="cds_concat_mean">CDS Concatenated: Mean</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-auto max-h-[400px] border border-border rounded-md">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="h-10">
              <th className="border border-border p-1.5 text-left text-xs font-semibold bg-muted sticky left-0 z-20">Annotation</th>
              {types.map(type => (
                <th key={type} className="border border-border p-1.5 text-xs font-semibold bg-muted">
                  {type}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transcriptData.map((data, idx) => {
              const annotationLabel = organismLabelMap[data.annotation.annotation_id]
              return (
                <tr key={idx}>
                  <td className="border border-border p-1.5 text-xs font-medium bg-muted sticky left-0 z-10">{annotationLabel}</td>
                  {types.map(type => {
                    const typeStats = data.transcriptTypeStats?.[type]
                    const value = getMetricValue(typeStats, metricField)
                    let displayValue = '-'
                    
                    if (value > 0) {
                      // Format based on metric type
                      if (metricField.includes('length') || metricField.includes('concat')) {
                        // Length values - show with bp suffix in tooltip, formatted number in cell
                        displayValue = value >= 1000 
                          ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
                          : value.toFixed(2)
                      } else {
                        // Count values - show as integer
                        displayValue = Number.isInteger(value) 
                          ? value.toLocaleString() 
                          : value.toFixed(2)
                      }
                    }
                    
                    const bgColor = value > 0 ? getHeatmapColor(value) : 'transparent'
                    const textColor = value > maxValue * 0.5 ? '#ffffff' : '#1e293b'
                    
                    // Determine suffix for tooltip
                    const suffix = (metricField.includes('length') || metricField.includes('concat')) ? ' bp' : ''
                    
                    return (
                      <td 
                        key={type}
                        className="border border-border p-1.5 text-center text-xs"
                        style={{ backgroundColor: bgColor, color: textColor }}
                        title={`${annotationLabel} - ${type}: ${displayValue}${suffix}`}
                      >
                        {displayValue}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
