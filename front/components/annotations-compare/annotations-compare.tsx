"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { BarChart3, X, AlertCircle, Loader2, Info } from "lucide-react"
import type { Annotation, CustomAnnotation, FeaturesSummary } from "@/lib/types"
import {
  getAnnotationDisplayName,
  getAnnotationSubtitle,
  isCustomAnnotation,
  isPortalAnnotation,
} from "@/lib/annotation-display"
import { listAnnotations } from "@/lib/api/annotations"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { useUIStore } from "@/lib/stores/ui"
import { ComparisonStackedBarCard } from "./comparison-stacked-bar-card"
import { ComparisonStatsHeatmapCard } from "./comparison-stats-heatmap-card"
import {
  defaultEntityMode,
  hasGeneChartData,
  hasTranscriptChartData,
  type EntityMode,
  type GeneRowData,
  type TranscriptRowData,
} from "./comparison-chart-utils"
import { CollapsiblePageSidebar } from "@/components/layout/collapsible-page-sidebar"
import { useResponsiveSidebar } from "@/lib/hooks/use-responsive-sidebar"

const FAVORITES_LIST_WIDTH = 300

interface AnnotationsCompareProps {
  favoriteAnnotations: Annotation[]
  showFavs?: boolean,
  totalAnnotations: number
  selectionCount?: number
  customCount?: number
  onViewCustomAnnotation?: (annotation: CustomAnnotation) => void
  listSidebarOpen?: boolean
  onListSidebarOpenChange?: (open: boolean) => void
}

export function AnnotationsCompare({
  favoriteAnnotations,
  showFavs = false,
  totalAnnotations,
  selectionCount,
  customCount,
  onViewCustomAnnotation,
  listSidebarOpen: listSidebarOpenProp,
  onListSidebarOpenChange,
}: AnnotationsCompareProps) {
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([])
  const internalSidebar = useResponsiveSidebar()
  const listSidebarOpen = listSidebarOpenProp ?? internalSidebar.sidebarOpen
  const setListSidebarOpen = onListSidebarOpenChange ?? internalSidebar.setSidebarOpen

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
      const displayName = getAnnotationDisplayName(annotation)
      organismCounts[displayName] = (organismCounts[displayName] || 0) + 1

      if (organismCounts[displayName] === 1) {
        labelMap[annotation.annotation_id] = displayName
      } else {
        labelMap[annotation.annotation_id] = `${displayName} (${organismCounts[displayName]})`
      }
    })
    
    return labelMap
  }

  // Create label map for all loaded annotations
  const organismLabelMap = createOrganismLabelMap(displayAnnotations)

  const selectionListContent = (
    <>
        {/* Header */}
        <div className="flex-shrink-0 mb-4 pt-4 sm:pt-6">
          {showFavs && selectionCount !== undefined && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
              <span>
                Favorites: <span className="font-semibold text-foreground">{selectionCount}</span>
              </span>
              <span>
                Loaded: <span className="font-semibold text-foreground">{displayAnnotations.length}</span>
              </span>
              {customCount != null && customCount > 0 && (
                <span>
                  Custom: <span className="font-semibold text-foreground">{customCount}</span>
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs text-muted-foreground">
              Compare up to {MAX_COMPARISON}
              {selectedForComparison.length > 0 && (
                <span className="font-semibold text-foreground ml-1">
                  ({selectedForComparison.length}/{MAX_COMPARISON})
                </span>
              )}
            </p>
            {selectedForComparison.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleClearSelection}
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {!showFavs && (
            <div className="text-xs text-muted-foreground">
              {displayAnnotations.length > 0 && effectiveTotalAnnotations > 0 && (
                <>Loaded {displayAnnotations.length} of {effectiveTotalAnnotations}</>
              )}
            </div>
          )}
        </div>

        {/* Annotation List - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-4 sm:pb-6 lg:flex-1">
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
                            {isCustomAnnotation(annotation) ? (
                              <Badge
                                variant="default"
                                className="text-[10px] px-1.5 py-0 h-4 bg-accent text-accent-foreground"
                              >
                                Your upload
                              </Badge>
                            ) : isPortalAnnotation(annotation) ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                {annotation.source_file_info.database}
                              </Badge>
                            ) : null}
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
                                if (isCustomAnnotation(annotation) && onViewCustomAnnotation) {
                                  onViewCustomAnnotation(annotation)
                                } else {
                                  openRightSidebar("file-overview", { annotation })
                                }
                              }}
                              title="View details"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {isCustomAnnotation(annotation) ? (
                          <p className="text-xs text-muted-foreground truncate" title={getAnnotationSubtitle(annotation)}>
                            {getAnnotationSubtitle(annotation)}
                          </p>
                        ) : isPortalAnnotation(annotation) ? (
                          <>
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
                          </>
                        ) : null}
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
    </>
  )

  return (
    <div
      className={
        showFavs
          ? "flex h-full min-h-0 overflow-hidden"
          : "flex flex-col lg:flex-row h-auto lg:h-full lg:min-h-0 lg:overflow-hidden"
      }
    >
      {showFavs ? (
        <CollapsiblePageSidebar
          open={listSidebarOpen}
          onOpenChange={setListSidebarOpen}
          width={FAVORITES_LIST_WIDTH}
          title="Annotations"
        >
          <div className="flex flex-col h-full min-h-0 px-3 sm:px-4">
            {selectionListContent}
          </div>
        </CollapsiblePageSidebar>
      ) : (
        <div className="lg:w-[300px] xl:w-[300px] flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-border pb-4 lg:pb-0 lg:h-full lg:min-h-0 flex-shrink-0 px-3 sm:px-4">
          {selectionListContent}
        </div>
      )}

      {/* Right Column - Comparison Stats */}
      <div className="flex-1 flex flex-col min-w-0 w-full min-h-0 px-3 sm:px-4 pt-4 sm:pt-6 pb-4 sm:pb-6 overflow-y-auto lg:overflow-hidden">
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
function findOverlappingItems(annotations: Annotation[], key: keyof FeaturesSummary): string[] {
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

  const geneData: GeneRowData[] = selectedAnnotations.map((ann) => ({
    annotation: ann,
    categories: ann.features_statistics?.gene_category_stats ?? {},
  }))

  const transcriptData: TranscriptRowData[] = selectedAnnotations.map((ann) => ({
    annotation: ann,
    transcriptTypeStats: ann.features_statistics?.transcript_type_stats ?? {},
  }))

  const hasGeneData = hasGeneChartData(geneData)
  const hasTranscriptData = hasTranscriptChartData(transcriptData)

  const annotationKey = selectedAnnotations.map((a) => a.annotation_id).join(",")
  const [entityMode, setEntityMode] = useState<EntityMode>("genes")

  useEffect(() => {
    setEntityMode(defaultEntityMode(geneData, transcriptData))
  }, [annotationKey])

  return (
    <div className="flex flex-col h-auto lg:h-full lg:min-h-0 lg:overflow-y-auto space-y-4 sm:space-y-6">

      <div className="space-y-3 flex-shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
      </div>

      {(hasGeneData || hasTranscriptData) && (
        <div className="space-y-4 flex-shrink-0">
          <ComparisonStackedBarCard
            entityMode={entityMode}
            onEntityModeChange={setEntityMode}
            geneData={geneData}
            transcriptData={transcriptData}
            organismLabelMap={organismLabelMap}
            hasGeneData={hasGeneData}
            hasTranscriptData={hasTranscriptData}
          />
          <ComparisonStatsHeatmapCard
            entityMode={entityMode}
            onEntityModeChange={setEntityMode}
            geneData={geneData}
            transcriptData={transcriptData}
            organismLabelMap={organismLabelMap}
            hasGeneData={hasGeneData}
            hasTranscriptData={hasTranscriptData}
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

