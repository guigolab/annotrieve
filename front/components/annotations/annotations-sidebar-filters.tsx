"use client"

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react"
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from "react"
import { Checkbox, Button, Label } from "@/components/ui"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ChevronDown, Loader2, ArrowRight, Search } from "lucide-react"
import { getAssembliesStats } from "@/lib/api/assemblies"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { getTaxon, getTaxonRankFrequencies, listTaxons } from "@/lib/api/taxons"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { AssemblyRecord, OrganismRecord, TaxonRecord, BioProjectRecord } from "@/lib/api/types"
import { listBioprojects } from "@/lib/api/bioprojects"
import { cn } from "@/lib/utils"
import { CompactTaxonomicTree } from "@/components/taxonomy/compact-taxonomic-tree"
import { createAssemblySearchModel, createOrganismSearchModel, createTaxonSearchModel } from "@/lib/search-models"
import { QuickSearchSection } from "./annotations-sidebar-filters/components/quick-search-section"
import { FilterAccordionSection } from "./annotations-sidebar-filters/components/filter-accordion-section"
import { sortRanks, formatRankLabel } from "./annotations-sidebar-filters/utils"
import { CommonSearchResult } from "@/lib/types"
import { FilterSubsetsManager } from "./annotations-sidebar-filters/filter-subsets-manager"

const FILTER_PARAM_EXCLUDE_MAP: Record<string, string> = {
  'biotype': 'biotypes',
  'feature-types': 'feature_types',
  'feature-sources': 'feature_sources',
  'pipelines': 'pipelines',
  'providers': 'providers',
  'database-sources': 'db_sources',
  'assembly-levels': 'assembly_levels',
  'assembly-statuses': 'assembly_statuses',
  'refseq-categories': 'refseq_categories'
}

const FILTER_FIELD_NAME_MAP: Record<string, string> = {
  'biotype': 'biotype',
  'feature-types': 'feature_type',
  'feature-sources': 'feature_source',
  'pipelines': 'pipeline',
  'providers': 'provider',
  'database-sources': 'database',
  'assembly-levels': 'assembly_level',
  'assembly-statuses': 'assembly_status',
  'refseq-categories': 'refseq_category'
}

const TAXON_SORT_PARAMS = {
  sort_by: 'annotations_count',
  sort_order: 'desc'
}

interface CollapsibleSectionProps {
  title: string
  description?: string
  isOpen: boolean
  onToggle: () => void
  isLoading?: boolean
  btnAction?: () => void
  btnText?: string
  icon?: ReactNode
  children: ReactNode
}

const COLLAPSIBLE_ANIMATION_DURATION = 300
const COLLAPSIBLE_SKELETON_WIDTHS = ["w-5/6", "w-full", "w-2/3"] as const
const BIOPROJECTS_PAGE_SIZE = 30
const BIOPROJECT_SEARCH_DEBOUNCE = 400

function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue
    try {
      const storedValue = window.localStorage.getItem(key)
      return storedValue !== null ? JSON.parse(storedValue) : defaultValue
    } catch (error) {
      console.warn(`Failed to read persistent state for ${key}:`, error)
      return defaultValue
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn(`Failed to persist state for ${key}:`, error)
    }
  }, [key, value])

  return [value, setValue] as const
}

function CollapsibleSection({
  title,
  description,
  isOpen,
  onToggle,
  isLoading = false,
  btnAction,
  btnText,
  icon,
  children
}: CollapsibleSectionProps) {
  const contentId = `section-${title?.toString().toLowerCase().replace(/\s+/g, '-')}`
  const chevronLabel = `${isOpen ? "Collapse" : "Expand"} ${title ?? "section"} section`
  const [shouldRenderContent, setShouldRenderContent] = useState(isOpen)
  const [contentHeight, setContentHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (isOpen) {
      setShouldRenderContent(true)
    } else {
      timeoutId = setTimeout(() => setShouldRenderContent(false), COLLAPSIBLE_ANIMATION_DURATION)
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!shouldRenderContent || !contentRef.current) return

    const node = contentRef.current
    const updateHeight = () => {
      setContentHeight(node.scrollHeight)
    }

    updateHeight()

    let resizeObserver: ResizeObserver | null = null
    let resizeListenerAttached = false

    const globalWindow = typeof window !== "undefined" ? window : undefined

    if (globalWindow && "ResizeObserver" in globalWindow) {
      resizeObserver = new ResizeObserver(() => updateHeight())
      resizeObserver.observe(node)
    } else if (globalWindow) {
      ; (globalWindow as any).addEventListener("resize", updateHeight)
      resizeListenerAttached = true
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      } else if (resizeListenerAttached && globalWindow) {
        ; (globalWindow as any).removeEventListener("resize", updateHeight)
      }
    }
  }, [shouldRenderContent])

  const handleHeaderKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault()
      onToggle()
    }
  }, [onToggle])

  return (
    <div className="overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="group w-full flex items-center justify-between px-4 py-4 hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
          <span className="text-sm font-semibold truncate">{title}</span>
        </div>
        <div className="text-muted-foreground transition-transform duration-200 ease-in-out group-hover:text-foreground">
          <ChevronDown
            className={`h-4 w-4 shrink-0 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
            role="img"
            aria-label={chevronLabel}
            focusable={false}
          />
        </div>
      </div>

      <div
        id={contentId}
        aria-hidden={!isOpen}
        className="bg-muted/60 shadow-inner0 overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isOpen ? `${contentHeight}px` : 0 }}
      >
        <div ref={contentRef} className="p-4 space-y-3">
          {shouldRenderContent && (
            <>
              {description && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                  {btnAction && (
                    <Button variant="link" className="text-accent text-xs px-0 h-auto" onClick={btnAction}>
                      {btnText}
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              )}
              {isOpen && isLoading && (
                <div className="space-y-2 py-1" role="status" aria-live="polite">
                  {COLLAPSIBLE_SKELETON_WIDTHS.map((widthClass, index) => (
                    <div
                      key={`${widthClass}-${index}`}
                      className={`h-3 rounded bg-muted-foreground/30 animate-pulse ${widthClass}`}
                    />
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {children}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function AnnotationsSidebarFilters() {
  const store = useAnnotationsFiltersStore()
  const {
    selectedTaxons,
    selectedAssemblies,
    selectedBioprojects,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    featureSources,
    pipelines,
    providers,
    databaseSources,
    setSelectedTaxons,
    setSelectedAssemblies,
    setSelectedBioprojects,
    setSelectedAssemblyLevels,
    setSelectedAssemblyStatuses,
    setOnlyRefGenomes,
    setBiotypes,
    setFeatureTypes,
    setPipelines,
    setProviders,
    setDatabaseSources,
  } = store


  // Taxonomy section
  const [rankFrequencies, setRankFrequencies] = useState<Record<string, number>>({})
  const [loadingRanks, setLoadingRanks] = useState(false)
  const [selectedRank, setSelectedRank] = useState<string | null>(null)
  const [rankTaxons, setRankTaxons] = useState<TaxonRecord[]>([])
  const [loadingTaxons, setLoadingTaxons] = useState(false)
  const [loadingMoreTaxons, setLoadingMoreTaxons] = useState(false)
  const [hasMoreTaxons, setHasMoreTaxons] = useState(false)
  const [taxonsOffset, setTaxonsOffset] = useState(0)
  const [totalTaxons, setTotalTaxons] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const observerTargetRef = useRef<HTMLDivElement>(null)
  const quickSearchModels = useMemo(
    () => [
      createOrganismSearchModel(5),
      createTaxonSearchModel(5, { requireChildren: true }),
      createAssemblySearchModel(5),
    ],
    []
  )

  // Tree rank selection (separate from rank section)
  const [treeSelectedRank, setTreeSelectedRank] = useState<string | null>(null)
  const [treeRankRoots, setTreeRankRoots] = useState<TaxonRecord[]>([])
  const [loadingTreeRankRoots, setLoadingTreeRankRoots] = useState(false)
  const [treeRankRootsOffset, setTreeRankRootsOffset] = useState(0)
  const [hasMoreTreeRankRoots, setHasMoreTreeRankRoots] = useState(false)
  const [totalTreeRankRoots, setTotalTreeRankRoots] = useState(0)

  // BioProject filters
  const [bioprojects, setBioprojects] = useState<BioProjectRecord[]>([])
  const [bioprojectsTotal, setBioprojectsTotal] = useState(0)
  const [bioprojectOffset, setBioprojectOffset] = useState(0)
  const [bioprojectHasMore, setBioprojectHasMore] = useState(false)
  const [loadingBioprojects, setLoadingBioprojects] = useState(false)
  const [bioprojectSearchQuery, setBioprojectSearchQuery] = useState("")
  const [debouncedBioprojectSearchQuery, setDebouncedBioprojectSearchQuery] = useState("")
  const bioprojectScrollRef = useRef<HTMLDivElement>(null)
  const bioprojectObserverRef = useRef<HTMLDivElement>(null)
  const lastFetchedQueryRef = useRef<string>("")
  const [isBioprojectSectionOpen, setIsBioprojectSectionOpen] = usePersistentState<boolean>("annotations-sidebar:bioprojects-open", false)

  // Assembly filters - lazy loaded
  const [assemblyLevelOptions, setAssemblyLevelOptions] = useState<Record<string, number>>({})
  const [assemblyStatusOptions, setAssemblyStatusOptions] = useState<Record<string, number>>({})
  const [refseqCategoryOptions, setRefseqCategoryOptions] = useState<Record<string, number>>({})
  const [assemblyFiltersLoaded, setAssemblyFiltersLoaded] = useState(false)
  const [loadingAssemblyFilters, setLoadingAssemblyFilters] = useState(false)

  // Metadata filters - lazy loaded
  const [biotypeOptions, setBiotypeOptions] = useState<Record<string, number>>({})
  const [featureTypeOptions, setFeatureTypeOptions] = useState<Record<string, number>>({})
  const [pipelineOptions, setPipelineOptions] = useState<Record<string, number>>({})
  const [providerOptions, setProviderOptions] = useState<Record<string, number>>({})
  const [databaseSourcesOptions, setDatabaseSourcesOptions] = useState<Record<string, number>>({})
  const [featureSourceOptions, setFeatureSourceOptions] = useState<Record<string, number>>({})
  const [gffSummaryAccordionValue, setGffSummaryAccordionValue] = usePersistentState<string | null>("annotations-sidebar:gff-summary-open", null)
  const [gffSourceAccordionValue, setGffSourceAccordionValue] = usePersistentState<string | null>("annotations-sidebar:gff-source-open", null)
  const [loadingSection, setLoadingSection] = useState<string | null>(null)
  const [filterSectionSearchQueries, setFilterSectionSearchQueries] = useState<Record<string, string>>({})
  const [isTaxonomySectionOpen, setIsTaxonomySectionOpen] = usePersistentState<boolean>("annotations-sidebar:taxonomy-open", false)
  const [isAssemblySectionOpen, setIsAssemblySectionOpen] = usePersistentState<boolean>("annotations-sidebar:assemblies-open", false)

  const filterOptionSetters = useMemo<Record<string, (data: Record<string, number>) => void>>(
    () => ({
      'biotype': setBiotypeOptions,
      'feature-types': setFeatureTypeOptions,
      'feature-sources': setFeatureSourceOptions,
      'pipelines': setPipelineOptions,
      'providers': setProviderOptions,
      'database-sources': setDatabaseSourcesOptions,
      'assembly-levels': setAssemblyLevelOptions,
      'assembly-statuses': setAssemblyStatusOptions,
      'refseq-categories': setRefseqCategoryOptions
    }),
    [
      setBiotypeOptions,
      setFeatureTypeOptions,
      setFeatureSourceOptions,
      setPipelineOptions,
      setProviderOptions,
      setDatabaseSourcesOptions,
      setAssemblyLevelOptions,
      setAssemblyStatusOptions,
      setRefseqCategoryOptions
    ]
  )

  // Cache for filter options to avoid redundant API calls
  const filterCacheRef = useRef<Map<string, { data: Record<string, number>, timestamp: number }>>(new Map())
  const CACHE_TTL = 30000 // 30 seconds

  const fetchBioprojects = useCallback(async (reset = false) => {
    if (loadingBioprojects) return
    setLoadingBioprojects(true)
    try {
      const currentOffset = reset ? 0 : bioprojectOffset
      const params: any = {
        limit: BIOPROJECTS_PAGE_SIZE,
        offset: currentOffset,
        sort_by: 'assemblies_count',
        sort_order: 'desc'
      }
      if (debouncedBioprojectSearchQuery.trim()) {
        params.filter = debouncedBioprojectSearchQuery.trim()
      }
      const response = await listBioprojects(params)
      const results = response?.results ?? []
      const total = response?.total ?? results.length
      setBioprojectsTotal(total)
      const nextOffset = currentOffset + results.length
      setBioprojectOffset(nextOffset)
      setBioprojectHasMore(nextOffset < total)
      setBioprojects(prev => {
        if (reset) {
          return results
        }
        const seen = new Set(prev.map(bp => bp.accession))
        const merged = [...prev]
        results.forEach(bp => {
          if (!seen.has(bp.accession)) {
            merged.push(bp)
          }
        })
        return merged
      })
    } catch (error) {
      console.error("Error loading bioprojects:", error)
    } finally {
      setLoadingBioprojects(false)
    }
  }, [bioprojectOffset, loadingBioprojects, debouncedBioprojectSearchQuery])

  const loadMoreBioprojects = useCallback(() => {
    if (loadingBioprojects || !bioprojectHasMore) return
    fetchBioprojects(false)
  }, [bioprojectHasMore, fetchBioprojects, loadingBioprojects])

  const handleBioprojectToggle = useCallback((project: BioProjectRecord) => {
    if (selectedBioprojects.some(bp => bp.accession === project.accession)) {
      setSelectedBioprojects(selectedBioprojects.filter(bp => bp.accession !== project.accession))
    } else {
      setSelectedBioprojects([...selectedBioprojects, project])
    }
  }, [selectedBioprojects, setSelectedBioprojects])

  const clearBioprojectSelection = useCallback(() => {
    setSelectedBioprojects([])
  }, [setSelectedBioprojects])

  // Build params for filter fetching
  const buildFilterParams = useCallback((excludeField?: string) => {
    const params: Record<string, any> = {}

    if (selectedTaxons.length > 0) {
      params.taxids = selectedTaxons.map(t => t.taxid).join(',')
    }
    if (selectedAssemblies.length > 0) {
      params.assembly_accessions = selectedAssemblies.map(a => a.assembly_accession).join(',')
    }
    if (selectedBioprojects.length > 0) {
      params.bioproject_accessions = selectedBioprojects.map(bp => bp.accession).join(',')
    }
    if (selectedAssemblyLevels.length > 0) {
      params.assembly_levels = selectedAssemblyLevels.join(',')
    }
    if (selectedAssemblyStatuses.length > 0) {
      params.assembly_statuses = selectedAssemblyStatuses.join(',')
    }
    if (onlyRefGenomes) {
      params.refseq_categories = 'reference genome'
    }
    if (biotypes.length > 0) {
      params.biotypes = biotypes.join(',')
    }
    if (featureTypes.length > 0) {
      params.feature_types = featureTypes.join(',')
    }
    if (featureSources.length > 0) {
      params.feature_sources = featureSources.join(',')
    }
    if (pipelines.length > 0) {
      params.pipelines = pipelines.join(',')
    }
    if (providers.length > 0) {
      params.providers = providers.join(',')
    }
    if (databaseSources.length > 0) {
      params.db_sources = databaseSources.join(',')
    }

    // Exclude the field being fetched to avoid circular dependency
    if (excludeField) {
      const paramToExclude = FILTER_PARAM_EXCLUDE_MAP[excludeField]
      if (paramToExclude) {
        delete params[paramToExclude]
      }
    }

    return params
  }, [
    selectedTaxons,
    selectedAssemblies,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    featureSources,
    pipelines,
    providers,
    databaseSources,
    selectedBioprojects
  ])

  // Track pending loads to prevent duplicate requests
  const pendingLoadsRef = useRef<Set<string>>(new Set())

  // Debounce filter reloads when parent filters change
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const loadFilterOptions = useCallback(async (field: string, type: 'annotation' | 'assembly') => {
    // Check cache first
    const cacheKey = `${field}-${type}-${JSON.stringify(buildFilterParams(field))}`
    const cached = filterCacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      filterOptionSetters[field]?.(cached.data)
      return
    }

    // Prevent duplicate requests
    if (pendingLoadsRef.current.has(cacheKey)) return
    pendingLoadsRef.current.add(cacheKey)

    setLoadingSection(field)
    try {
      const params = buildFilterParams(field)
      const apiFieldName = FILTER_FIELD_NAME_MAP[field] || field

      let result: Record<string, number> = {}
      if (type === 'annotation') {
        result = await getAnnotationsFrequencies(apiFieldName, params).catch(() => ({}))
      } else {
        result = await getAssembliesStats(params, apiFieldName).catch(() => ({}))
      }

      // Cache the result
      filterCacheRef.current.set(cacheKey, { data: result, timestamp: Date.now() })

      // Update state - only update if we got results (don't clear existing options)
      if (Object.keys(result).length > 0) {
        filterOptionSetters[field]?.(result)
      }
    } catch (error) {
      console.error(`Error fetching filter options for ${field}:`, error)
    } finally {
      setLoadingSection(null)
      pendingLoadsRef.current.delete(cacheKey)
    }
  }, [buildFilterParams, filterOptionSetters])

  // Load assembly filters once on mount (static, no parameters)
  useEffect(() => {
    if (!assemblyFiltersLoaded && !loadingAssemblyFilters) {
      setLoadingAssemblyFilters(true)

      // Fetch without any filter parameters (static frequencies)
      Promise.all([
        getAssembliesStats({}, 'assembly_level').catch(() => ({})),
        getAssembliesStats({}, 'assembly_status').catch(() => ({})),
        getAssembliesStats({}, 'refseq_category').catch(() => ({}))
      ]).then(([levels, statuses, refseq]) => {
        setAssemblyLevelOptions(levels || {})
        setAssemblyStatusOptions(statuses || {})
        setRefseqCategoryOptions(refseq || {})
        setAssemblyFiltersLoaded(true)
      }).catch((error) => {
        console.error('Error loading assembly filters:', error)
        setAssemblyFiltersLoaded(true)
      }).finally(() => {
        setLoadingAssemblyFilters(false)
      })
    }
  }, [assemblyFiltersLoaded, loadingAssemblyFilters])

  // Only reload metadata filters when parent filters (taxons/assemblies) change
  // NOT when metadata filters themselves change, and NOT when assembly filter properties change
  useEffect(() => {
    const openSection = gffSummaryAccordionValue || gffSourceAccordionValue
    if (!openSection) return

    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current)
    }

    reloadTimeoutRef.current = setTimeout(() => {
      // Clear cache for the open metadata section
      filterCacheRef.current.forEach((_, key) => {
        if (key === openSection) {
          filterCacheRef.current.delete(key)
        }
      })

      // Reload the open metadata section
      loadFilterOptions(openSection, 'annotation')
    }, 500) // 500ms debounce

    return () => {
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current)
      }
    }
    // Only depend on taxons and assemblies (the actual records), NOT on filter properties or metadata filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaxons, selectedAssemblies, gffSummaryAccordionValue, gffSourceAccordionValue, loadFilterOptions])

  // Load rank frequencies
  useEffect(() => {
    if (Object.keys(rankFrequencies).length === 0 && !loadingRanks) {
      setLoadingRanks(true)
      getTaxonRankFrequencies()
        .then(data => setRankFrequencies(data || {}))
        .catch(() => setRankFrequencies({}))
        .finally(() => setLoadingRanks(false))
    }
  }, [rankFrequencies, loadingRanks])

  // Load taxons when rank is selected
  useEffect(() => {
    if (!selectedRank) {
      setRankTaxons([])
      setHasMoreTaxons(false)
      setTaxonsOffset(0)
      setTotalTaxons(0)
      return
    }

    setLoadingTaxons(true)
    setTaxonsOffset(0)
    const limit = 50

    listTaxons({ rank: selectedRank, limit, offset: 0, ...TAXON_SORT_PARAMS })
      .then(response => {
        const results = (response as any)?.results || []
        const total = (response as any)?.total || 0
        setRankTaxons(results)
        setTotalTaxons(total)
        setHasMoreTaxons(results.length < total)
        setTaxonsOffset(results.length)
      })
      .catch(error => {
        console.error("Error loading taxons by rank:", error)
        setRankTaxons([])
        setHasMoreTaxons(false)
        setTotalTaxons(0)
      })
      .finally(() => setLoadingTaxons(false))
  }, [selectedRank])

  // Load more taxons for infinite scroll
  const loadMoreTaxons = useCallback(async () => {
    if (!selectedRank || loadingMoreTaxons || !hasMoreTaxons) return

    setLoadingMoreTaxons(true)
    const limit = 50

    try {
      const response = await listTaxons({ rank: selectedRank, limit, offset: taxonsOffset, ...TAXON_SORT_PARAMS })
      const results = (response as any)?.results || []
      const total = (response as any)?.total || 0

      setRankTaxons(prev => [...prev, ...results])
      setTaxonsOffset(prev => prev + results.length)
      setHasMoreTaxons(taxonsOffset + results.length < total)
    } catch (error) {
      console.error("Error loading more taxons:", error)
    } finally {
      setLoadingMoreTaxons(false)
    }
  }, [selectedRank, loadingMoreTaxons, hasMoreTaxons, taxonsOffset])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!hasMoreTaxons || !selectedRank) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreTaxons && !loadingMoreTaxons) {
          loadMoreTaxons()
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '50px',
        threshold: 0.1
      }
    )

    const currentTarget = observerTargetRef.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMoreTaxons, loadingMoreTaxons, loadMoreTaxons, selectedRank])

  // Fetch taxons by rank for tree when tree rank is selected
  useEffect(() => {
    if (!treeSelectedRank) {
      setTreeRankRoots([])
      setTreeRankRootsOffset(0)
      setHasMoreTreeRankRoots(false)
      setTotalTreeRankRoots(0)
      return
    }

    setLoadingTreeRankRoots(true)
    setTreeRankRootsOffset(0)
    const limit = 50

    listTaxons({ rank: treeSelectedRank, limit, offset: 0, ...TAXON_SORT_PARAMS })
      .then(response => {
        const results = (response as any)?.results || []
        const total = (response as any)?.total || 0
        setTreeRankRoots(results)
        setTotalTreeRankRoots(total)
        setHasMoreTreeRankRoots(results.length < total)
        setTreeRankRootsOffset(results.length)
      })
      .catch(error => {
        console.error("Error loading taxons by rank for tree:", error)
        setTreeRankRoots([])
        setHasMoreTreeRankRoots(false)
        setTotalTreeRankRoots(0)
      })
      .finally(() => setLoadingTreeRankRoots(false))
  }, [treeSelectedRank])

  // Load more tree rank roots for infinite scroll
  const loadMoreTreeRankRoots = useCallback(async () => {
    if (!treeSelectedRank || loadingTreeRankRoots || !hasMoreTreeRankRoots) return

    setLoadingTreeRankRoots(true)
    const limit = 50

    try {
      const response = await listTaxons({ rank: treeSelectedRank, limit, offset: treeRankRootsOffset, ...TAXON_SORT_PARAMS })
      const results = (response as any)?.results || []
      const total = (response as any)?.total || 0

      // Deduplicate by taxid
      setTreeRankRoots(prev => {
        const existingTaxids = new Set(prev.map(r => r.taxid))
        const uniqueNew = results.filter((r: TaxonRecord) => !existingTaxids.has(r.taxid))
        return [...prev, ...uniqueNew]
      })

      setTreeRankRootsOffset(prev => prev + results.length)
      setHasMoreTreeRankRoots(treeRankRootsOffset + results.length < total)
    } catch (error) {
      console.error("Error loading more taxons by rank for tree:", error)
    } finally {
      setLoadingTreeRankRoots(false)
    }
  }, [treeSelectedRank, loadingTreeRankRoots, hasMoreTreeRankRoots, treeRankRootsOffset])

  // Debounce bioproject search query
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedBioprojectSearchQuery(bioprojectSearchQuery)
    }, BIOPROJECT_SEARCH_DEBOUNCE)
    return () => clearTimeout(timeoutId)
  }, [bioprojectSearchQuery])

  // Reset pagination and fetch when search query changes or section opens
  useEffect(() => {
    if (!isBioprojectSectionOpen) return

    // Avoid duplicate fetches for the same query
    const currentQuery = debouncedBioprojectSearchQuery.trim()
    if (lastFetchedQueryRef.current === currentQuery && bioprojects.length > 0) {
      return
    }

    lastFetchedQueryRef.current = currentQuery
    setBioprojectOffset(0)
    setBioprojects([])

    // Use the current values directly instead of the callback
    const fetch = async () => {
      if (loadingBioprojects) return
      setLoadingBioprojects(true)
      try {
        const params: any = {
          limit: BIOPROJECTS_PAGE_SIZE,
          offset: 0,
          sort_by: 'assemblies_count',
          sort_order: 'desc'
        }
        if (currentQuery) {
          params.filter = currentQuery
        }
        const response = await listBioprojects(params)
        const results = response?.results ?? []
        const total = response?.total ?? results.length
        setBioprojectsTotal(total)
        setBioprojectOffset(results.length)
        setBioprojectHasMore(results.length < total)
        setBioprojects(results)
      } catch (error) {
        console.error("Error loading bioprojects:", error)
      } finally {
        setLoadingBioprojects(false)
      }
    }

    fetch()
  }, [debouncedBioprojectSearchQuery, isBioprojectSectionOpen])

  useEffect(() => {
    if (!isBioprojectSectionOpen) return
    const target = bioprojectObserverRef.current
    const rootNode = bioprojectScrollRef.current || undefined
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreBioprojects()
        }
      },
      {
        root: rootNode,
        rootMargin: '80px',
        threshold: 0.1
      }
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [isBioprojectSectionOpen, loadMoreBioprojects])

  const handleGffSummaryAccordionChange = (value?: string) => {
    const nextValue = value ?? null

    if (!nextValue && gffSummaryAccordionValue) {
      setFilterSectionSearchQueries(prev => {
        const updated = { ...prev }
        delete updated[gffSummaryAccordionValue]
        return updated
      })
    }

    setGffSummaryAccordionValue(nextValue)
    if (nextValue) {
      loadFilterOptions(nextValue, 'annotation')
    }
  }

  const summaryFilterSections = useMemo(
    () => [
      {
        key: "biotype",
        title: "Biotypes",
        description: "Biological types (e.g., protein_coding, lncRNA)",
        options: biotypeOptions,
        selected: biotypes,
        onChange: setBiotypes
      },
      {
        key: "feature-types",
        title: "Feature Types",
        description: "Genomic feature types (e.g., gene, transcript, exon)",
        options: featureTypeOptions,
        selected: featureTypes,
        onChange: setFeatureTypes
      },
    ],
    [biotypeOptions, biotypes, setBiotypes, featureTypeOptions, featureTypes, setFeatureTypes]
  )

  const sourceMetadataSections = useMemo(
    () => [
      {
        key: "pipelines",
        title: "Pipelines",
        description: "Annotation pipelines used to generate the annotations",
        options: pipelineOptions,
        selected: pipelines,
        onChange: setPipelines
      },
      {
        key: "providers",
        title: "Providers",
        description: "Data providers that supplied the annotations",
        options: providerOptions,
        selected: providers,
        onChange: setProviders
      },
      {
        key: "database-sources",
        title: "Database Sources",
        description: "Source databases (e.g., RefSeq, Ensembl, GenBank)",
        options: databaseSourcesOptions,
        selected: databaseSources,
        onChange: setDatabaseSources
      }
    ],
    [pipelineOptions, pipelines, setPipelines, providerOptions, providers, setProviders, databaseSourcesOptions, databaseSources, setDatabaseSources]
  )

  const handleGffSourceAccordionChange = (value?: string) => {
    const nextValue = value ?? null

    if (!nextValue && gffSourceAccordionValue) {
      setFilterSectionSearchQueries(prev => {
        const updated = { ...prev }
        delete updated[gffSourceAccordionValue]
        return updated
      })
    }

    setGffSourceAccordionValue(nextValue)
    if (nextValue) {
      loadFilterOptions(nextValue, 'annotation')
    }
  }

  const sortedRanks = sortRanks(rankFrequencies)


  const handleTaxonToggle = useCallback((taxon: TaxonRecord) => {
    if (selectedTaxons.some(t => t.taxid === taxon.taxid)) {
      setSelectedTaxons(selectedTaxons.filter(t => t.taxid !== taxon.taxid))
    } else {
      setSelectedTaxons([...selectedTaxons, taxon])
    }
  }, [selectedTaxons, setSelectedTaxons])

  const handleQuickSearchSelect = useCallback(
    async (result: CommonSearchResult<AssemblyRecord | TaxonRecord | OrganismRecord>) => {
      if (result.modelKey === "assembly") {
        const assembly = result.data as AssemblyRecord
        if (!selectedAssemblies.find((a) => a.assembly_accession === assembly.assembly_accession)) {
          setSelectedAssemblies([...selectedAssemblies, assembly])
        }
      }
      else {
        // map organism to taxon for filtering
        const taxon = result.modelKey === "taxon" ? result.data as TaxonRecord : await getTaxon(result.data.taxid)
        if (!selectedTaxons.find((t) => t.taxid === taxon.taxid)) {
          setSelectedTaxons([...selectedTaxons, taxon])
        }
      }
    },
    [selectedAssemblies, selectedTaxons, setSelectedAssemblies, setSelectedTaxons]
  )

  return (
    <>
      <div className="w-full border-r bg-background h-full flex flex-col">

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          <QuickSearchSection
            models={quickSearchModels}
            onSelect={handleQuickSearchSelect}
          />
          {/* Taxonomy Section */}
          <CollapsibleSection
            title="Taxonomy"
            description="Browse and select ranks or individual taxons."
            isOpen={isTaxonomySectionOpen}
            onToggle={() => setIsTaxonomySectionOpen((prev) => !prev)}
            isLoading={loadingRanks && treeRankRoots.length === 0}
          >
            <div className="space-y-4">
              {/* Rank Selection */}
              <div className="flex items-center gap-3">
                <Select
                  value={treeSelectedRank || 'all'}
                  onValueChange={(value) => setTreeSelectedRank(value === 'all' ? null : value)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Filter by rank" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto">
                    <SelectItem value="all">Filter by rank</SelectItem>
                    {sortedRanks.map(([rank, count]) => (
                      <SelectItem key={rank} value={rank}>
                        {formatRankLabel(rank)} ({count.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tree Component */}
              {loadingTreeRankRoots && treeRankRoots.length === 0 ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Loading taxons...</span>
                </div>
              ) : (
                <CompactTaxonomicTree
                  rootTaxid="2759"
                  rankRoots={treeSelectedRank ? treeRankRoots : undefined}
                  selectedTaxons={selectedTaxons}
                  onTaxonToggle={handleTaxonToggle}
                  maxHeight="350px"
                  loadingRankRoots={loadingTreeRankRoots}
                  hasMoreRankRoots={hasMoreTreeRankRoots}
                  onLoadMore={loadMoreTreeRankRoots}
                />
              )}
            </div>
          </CollapsibleSection>

          {/* BioProject Filters */}
          <CollapsibleSection
            title="BioProjects"
            description="Select BioProjects associated with the assemblies to limit the annotation results."
            isOpen={isBioprojectSectionOpen}
            onToggle={() => setIsBioprojectSectionOpen((prev) => !prev)}
            isLoading={loadingBioprojects && bioprojects.length === 0}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {bioprojectsTotal > 0
                    ? `${bioprojectsTotal.toLocaleString()} BioProjects`
                    : 'No BioProjects available'}
                </span>
                {selectedBioprojects.length > 0 && (
                  <Button variant="link" className="h-auto px-0 text-xs" onClick={clearBioprojectSelection}>
                    Clear selection
                  </Button>
                )}
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search BioProjects by title or accession..."
                  value={bioprojectSearchQuery}
                  onChange={(e) => setBioprojectSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>

              <div
                ref={bioprojectScrollRef}
                className="max-h-72 overflow-y-auto rounded-md border border-border/70 divide-y divide-border/60 bg-card/50"
              >
                {bioprojects.length === 0 && !loadingBioprojects ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">
                    No BioProjects found. Try adjusting filters.
                  </div>
                ) : (
                  <>
                    {bioprojects.map((project) => {
                      const isSelected = selectedBioprojects.some(bp => bp.accession === project.accession)
                      return (
                        <button
                          key={project.accession}
                          type="button"
                          onClick={() => handleBioprojectToggle(project)}
                          className={cn(
                            "w-full px-3 py-2 text-left flex items-start justify-between gap-3 text-sm transition-colors",
                            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isSelected ? "bg-primary/10 border-l-2 border-primary" : ""
                          )}
                        >
                          <div className="space-y-1">
                            <p className="font-medium leading-tight line-clamp-2">{project.title}</p>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{project.accession}</p>
                          </div>
                          <div className="text-[11px] text-muted-foreground text-right whitespace-nowrap">
                            {(project.assemblies_count ?? 0).toLocaleString()} assemblies
                          </div>
                        </button>
                      )
                    })}
                    <div ref={bioprojectObserverRef} className="flex items-center justify-center py-2 text-[11px] text-muted-foreground">
                      {loadingBioprojects
                        ? "Loading BioProjects..."
                        : bioprojectHasMore
                          ? "Scroll to load more"
                          : "End of list"}
                    </div>
                  </>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* Assembly Filters */}
          <CollapsibleSection
            title="Assemblies"
            description="Limit annotations by assembly metadata."
            isOpen={isAssemblySectionOpen}
            onToggle={() => setIsAssemblySectionOpen((prev) => !prev)}
            isLoading={loadingAssemblyFilters}
          >
            {loadingAssemblyFilters ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Reference Genomes */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">Reference genomes only</Label>
                  <button
                    onClick={() => setOnlyRefGenomes(!onlyRefGenomes)}
                    className={cn(
                      "relative inline-flex h-6 w-12 items-center rounded-full border transition-colors",
                      onlyRefGenomes ? "bg-primary border-primary" : "bg-muted border-border"
                    )}
                    role="switch"
                    aria-checked={onlyRefGenomes}
                  >
                    <span
                      className={cn(
                        "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                        onlyRefGenomes ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                {/* Assembly Levels */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">Assembly Levels</Label>
                  <div className="space-y-3">
                    {Object.keys(assemblyLevelOptions)
                      .filter(k => k !== 'no_value')
                      .sort()
                      .map((level) => (
                        <div key={level} className="flex items-center space-x-2">
                          <Checkbox
                            id={`assembly-level-${level}`}
                            checked={selectedAssemblyLevels.includes(level)}
                            onCheckedChange={() => {
                              if (selectedAssemblyLevels.includes(level)) {
                                setSelectedAssemblyLevels(selectedAssemblyLevels.filter(l => l !== level))
                              } else {
                                setSelectedAssemblyLevels([...selectedAssemblyLevels, level])
                              }
                            }}
                          />
                          <Label
                            htmlFor={`assembly-level-${level}`}
                            className="text-sm cursor-pointer"
                          >
                            {level}
                          </Label>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Assembly Statuses */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">Assembly Statuses</Label>
                  <div className="space-y-3">
                    {Object.keys(assemblyStatusOptions)
                      .filter(k => k !== 'no_value')
                      .sort()
                      .map((status) => (
                        <div key={status} className="flex items-center space-x-2">
                          <Checkbox
                            id={`assembly-status-${status}`}
                            checked={selectedAssemblyStatuses.includes(status)}
                            onCheckedChange={() => {
                              if (selectedAssemblyStatuses.includes(status)) {
                                setSelectedAssemblyStatuses(selectedAssemblyStatuses.filter(s => s !== status))
                              } else {
                                setSelectedAssemblyStatuses([...selectedAssemblyStatuses, status])
                              }
                            }}
                          />
                          <Label
                            htmlFor={`assembly-status-${status}`}
                            className="text-sm cursor-pointer"
                          >
                            {status}
                          </Label>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {sourceMetadataSections.map((section) => {
            const isOpen = gffSourceAccordionValue === section.key
            const isSectionLoading = loadingSection === section.key
            return (
              <CollapsibleSection
                key={section.key}
                title={section.title}
                isOpen={isOpen}
                description={section.description}
                onToggle={() => handleGffSourceAccordionChange(isOpen ? undefined : section.key)}
                isLoading={isSectionLoading}
              >
                <FilterAccordionSection
                  title={section.title}
                  description={section.description}
                  options={section.options}
                  selected={section.selected}
                  onChange={section.onChange}
                  isLoading={isSectionLoading}
                  isOpen={isOpen}
                  onToggle={() => handleGffSourceAccordionChange(isOpen ? undefined : section.key)}
                  searchQuery={filterSectionSearchQueries[section.key] || ""}
                  onSearchChange={(value) =>
                    setFilterSectionSearchQueries((prev) => ({ ...prev, [section.key]: value }))
                  }
                  useExternalToggle
                />
              </CollapsibleSection>
            )
          })}
          {summaryFilterSections.map((section) => {
            const isOpen = gffSummaryAccordionValue === section.key
            const isSectionLoading = loadingSection === section.key
            return (
              <CollapsibleSection
                key={section.key}
                title={section.title}
                isOpen={isOpen}
                description={section.description}
                onToggle={() => handleGffSummaryAccordionChange(isOpen ? undefined : section.key)}
                isLoading={isSectionLoading}
              >
                <FilterAccordionSection
                  title={section.title}
                  description={section.description}
                  options={section.options}
                  selected={section.selected}
                  onChange={section.onChange}
                  isLoading={isSectionLoading}
                  isOpen={isOpen}
                  onToggle={() => handleGffSummaryAccordionChange(isOpen ? undefined : section.key)}
                  searchQuery={filterSectionSearchQueries[section.key] || ""}
                  onSearchChange={(value) =>
                    setFilterSectionSearchQueries((prev) => ({ ...prev, [section.key]: value }))
                  }
                  useExternalToggle
                />
              </CollapsibleSection>
            )
          })}


        </div>

        {/* Sticky Filter Subsets Manager */}
        <FilterSubsetsManager />
      </div>

    </>
  )
}
