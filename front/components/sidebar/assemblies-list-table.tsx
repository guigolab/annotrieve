'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo, useRef } from 'react'
import { listAssemblies, getAssembliesStats } from '@/lib/api/assemblies'
import type { AssemblyRecord } from '@/lib/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useAnnotationsFiltersStore } from '@/lib/stores/annotations-filters'
import { useUIStore } from '@/lib/stores/ui'
import { Loader2, Database, FileText, Star, Layers, CheckCircle, XCircle, Calendar, Building2, Eye, Filter, X, Search, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn, buildEntityDetailsUrl } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { SelectedEntity, assemblyToEntity } from "@/components/selected-entity"

interface AssembliesListTableProps {
  taxid?: string
}

export function AssembliesListTable({ taxid }: AssembliesListTableProps) {
  const store = useAnnotationsFiltersStore()
  const closeRightSidebar = useUIStore((state) => state.closeRightSidebar)
  const router = useRouter()
  const {
    selectedTaxons,
    selectedAssemblies,
    setSelectedAssemblies,
  } = store

  // Local state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [allAssemblies, setAllAssemblies] = useState<AssemblyRecord[]>([])
  const [totalAssemblies, setTotalAssemblies] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const itemsPerPage = 20
  const [sortBy, setSortBy] = useState<string>('release_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  
  // Auto-enable onlySelectedTaxons if selectedTaxons exist
  const [onlySelectedTaxons, setOnlySelectedTaxons] = useState(() => selectedTaxons.length > 0)
  
  const loadMoreObserverRef = useRef<HTMLDivElement>(null)

  // Local filter state
  const [selectedAssemblyLevel, setSelectedAssemblyLevel] = useState<string>('all')
  const [selectedAssemblyStatus, setSelectedAssemblyStatus] = useState<string>('all')
  const [onlyRefGenomes, setOnlyRefGenomes] = useState(false)

  // Filter options
  const [assemblyLevelOptions, setAssemblyLevelOptions] = useState<Record<string, number>>({})
  const [assemblyStatusOptions, setAssemblyStatusOptions] = useState<Record<string, number>>({})
  const [loadingFilters, setLoadingFilters] = useState(false)

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1)
    setAllAssemblies([])
    setHasMore(true)
    setIsLoadingMore(false)
  }, [
    debouncedSearchQuery,
    selectedAssemblyLevel,
    selectedAssemblyStatus,
    onlyRefGenomes,
    onlySelectedTaxons,
    sortBy,
    sortOrder,
    taxid,
    selectedTaxons,
  ])

  // Update onlySelectedTaxons when selectedTaxons change
  useEffect(() => {
    if (selectedTaxons.length > 0 && !onlySelectedTaxons) {
      setOnlySelectedTaxons(true)
    } else if (selectedTaxons.length === 0 && onlySelectedTaxons) {
      setOnlySelectedTaxons(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTaxons.length]) // Only depend on length to avoid unnecessary updates

  // Build query params
  const queryParams = useMemo(() => {
    const params: any = {
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    }

    if (debouncedSearchQuery.trim()) {
      params.filter = debouncedSearchQuery
    }

    // Handle taxon filtering - prioritize selected taxons if toggle is on
    if (onlySelectedTaxons && selectedTaxons.length > 0) {
      params.taxids = selectedTaxons.map(t => t.taxid).join(',')
    } else if (taxid) {
      params.taxids = taxid
    }

    if (selectedAssemblyLevel !== 'all') {
      params.assembly_levels = selectedAssemblyLevel
    }

    if (selectedAssemblyStatus !== 'all') {
      params.assembly_statuses = selectedAssemblyStatus
    }

    if (onlyRefGenomes) {
      params.refseq_categories = 'reference genome'
    }

    return params
  }, [
    debouncedSearchQuery,
    selectedTaxons,
    selectedAssemblyLevel,
    selectedAssemblyStatus,
    onlyRefGenomes,
    onlySelectedTaxons,
    currentPage,
    itemsPerPage,
    sortBy,
    sortOrder,
    taxid,
  ])

  // Fetch assemblies
  const { data: assembliesData, isLoading, error } = useQuery({
    queryKey: ['assemblies-list', queryParams],
    queryFn: () => listAssemblies(queryParams),
    staleTime: 30 * 1000,
  })

  // Update assemblies list when new data arrives
  useEffect(() => {
    if (!assembliesData) return
    
    const newAssemblies = assembliesData.results || []
    const total = assembliesData.total || 0
    
    if (currentPage === 1) {
      setAllAssemblies(newAssemblies)
      // Calculate hasMore for page 1
      setHasMore(newAssemblies.length === itemsPerPage && newAssemblies.length < total)
    } else {
      // Append for infinite scroll
      setAllAssemblies(prev => {
        const existingAccessions = new Set(prev.map(a => a.assembly_accession))
        const uniqueNew = newAssemblies.filter(a => !existingAccessions.has(a.assembly_accession))
        const updated = [...prev, ...uniqueNew]
        // Calculate hasMore based on updated length
        setHasMore(newAssemblies.length === itemsPerPage && updated.length < total)
        return updated
      })
    }
    
    setTotalAssemblies(total)
    setIsLoadingMore(false)
  }, [assembliesData, currentPage, itemsPerPage])

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!hasMore || isLoading || isLoadingMore || allAssemblies.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          setIsLoadingMore(true)
          setCurrentPage(prev => prev + 1)
        }
      },
      {
        rootMargin: '200px',
        threshold: 0.1
      }
    )

    const currentTarget = loadMoreObserverRef.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, isLoading, isLoadingMore, allAssemblies.length])

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      setLoadingFilters(true)
      try {
        const baseParams: any = {}
        const effectiveTaxids = onlySelectedTaxons && selectedTaxons.length > 0
          ? selectedTaxons.map(t => t.taxid)
          : taxid
            ? [taxid]
            : []
        if (effectiveTaxids.length > 0) {
          baseParams.taxids = effectiveTaxids.join(',')
        }

        const [levels, statuses] = await Promise.all([
          getAssembliesStats(baseParams, 'assembly_level').catch(() => ({})),
          getAssembliesStats(baseParams, 'assembly_status').catch(() => ({})),
        ])

        setAssemblyLevelOptions(levels || {})
        setAssemblyStatusOptions(statuses || {})
      } catch (error) {
        console.error('Error loading filter options:', error)
      } finally {
        setLoadingFilters(false)
      }
    }

    loadFilters()
  }, [selectedTaxons, taxid, onlySelectedTaxons])

  // Handle assembly selection - directly update store
  const handleAssemblySelect = (assembly: AssemblyRecord, checked: boolean) => {
    const isSelected = selectedAssemblies.some(a => a.assembly_accession === assembly.assembly_accession)
    
    if (checked && !isSelected) {
      setSelectedAssemblies([...selectedAssemblies, assembly])
    } else if (!checked && isSelected) {
      setSelectedAssemblies(selectedAssemblies.filter(a => a.assembly_accession !== assembly.assembly_accession))
    }
  }

  const handleViewDetails = (assembly: AssemblyRecord) => {
    router.push(buildEntityDetailsUrl("assembly", assembly.assembly_accession))
  }

  const handleViewAnnotations = () => {
    router.push('/annotations')
    closeRightSidebar()
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedAssemblyLevel('all')
    setSelectedAssemblyStatus('all')
    setOnlyRefGenomes(false)
    if (selectedTaxons.length === 0) {
      setOnlySelectedTaxons(false)
    }
  }

  const hasActiveFilters = selectedAssemblyLevel !== 'all' || 
    selectedAssemblyStatus !== 'all' || 
    onlyRefGenomes || 
    (onlySelectedTaxons && selectedTaxons.length > 0) ||
    debouncedSearchQuery.trim().length > 0

  const isAssemblySelected = (assembly: AssemblyRecord) =>
    selectedAssemblies.some(a => a.assembly_accession === assembly.assembly_accession)

  // Separate selected and unselected assemblies
  const selectedAssembliesList = allAssemblies.filter(a => isAssemblySelected(a))
  const unselectedAssembliesList = allAssemblies.filter(a => !isAssemblySelected(a))
  const displayAssemblies = [...selectedAssembliesList, ...unselectedAssembliesList]

  // Convert selected assemblies to entities for display
  const selectedAssemblyEntities = selectedAssemblies.map(assemblyToEntity)

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assemblies explorer</p>
            <h3 className="text-lg font-semibold text-foreground">
              {isLoading && allAssemblies.length === 0
                ? 'Loading assemblies…'
                : totalAssemblies > 0
                  ? `${totalAssemblies.toLocaleString()} assemblies`
                  : 'No assemblies found'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Search, filter, and push assemblies directly into your annotation filters.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="release_date">Release Date</SelectItem>
                <SelectItem value="annotations_count">Annotations Count</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as 'asc' | 'desc')}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by organism, accession, assembly name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
          <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded} className="w-full">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 w-full md:w-auto">
                <SlidersHorizontal className="h-4 w-4" />
                Advanced filters
                {filtersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Select
                    value={selectedAssemblyLevel}
                    onValueChange={setSelectedAssemblyLevel}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Assembly Level">
                        {selectedAssemblyLevel === 'all' ? 'All Levels' : selectedAssemblyLevel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      {Object.entries(assemblyLevelOptions)
                        .filter(([key]) => key && key !== 'no_value')
                        .sort((a, b) => b[1] - a[1])
                        .map(([level, count]) => (
                          <SelectItem key={level} value={level}>
                            {level} ({count.toLocaleString()})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedAssemblyStatus}
                    onValueChange={setSelectedAssemblyStatus}
                    disabled={loadingFilters}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Assembly Status">
                        {selectedAssemblyStatus === 'all' ? 'All Statuses' : selectedAssemblyStatus}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {Object.entries(assemblyStatusOptions)
                        .filter(([key]) => key && key !== 'no_value')
                        .sort((a, b) => b[1] - a[1])
                        .map(([status, count]) => (
                          <SelectItem key={status} value={status}>
                            {status} ({count.toLocaleString()})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="only-ref-genomes"
                      checked={onlyRefGenomes}
                      onCheckedChange={setOnlyRefGenomes}
                    />
                    <Label htmlFor="only-ref-genomes" className="text-sm font-medium cursor-pointer">
                      Reference genomes only
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="only-selected-taxons"
                      checked={onlySelectedTaxons}
                      onCheckedChange={setOnlySelectedTaxons}
                      disabled={selectedTaxons.length === 0}
                    />
                    <Label htmlFor="only-selected-taxons" className="text-sm font-medium cursor-pointer">
                      Limit to selected taxons
                    </Label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </Card>

      {selectedTaxons.length > 0 && (
        <Card className="p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {selectedTaxons.length} selected taxon{selectedTaxons.length > 1 ? 's' : ''}
            </div>
            <Badge variant={onlySelectedTaxons ? "default" : "outline"} className="text-xs">
              {onlySelectedTaxons ? 'Filtering active' : 'Filter disabled'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedTaxons.map((taxon) => (
              <Badge key={taxon.taxid} variant="secondary" className="text-xs">
                {taxon.scientific_name || taxon.taxid}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {selectedAssemblies.length > 0 && (
        <SelectedEntity
          title="Selected Assemblies"
          entities={selectedAssemblyEntities}
          onClear={() => setSelectedAssemblies([])}
          onRemove={(accession: string) => {
            setSelectedAssemblies(selectedAssemblies.filter((a) => a.assembly_accession !== accession))
          }}
          onAction={handleViewAnnotations}
          actionLabel="View Related Annotations"
        />
      )}

      <div className="space-y-3">
        {isLoading && allAssemblies.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
            <p className="text-sm text-muted-foreground">Loading assemblies...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            Error loading assemblies. Please try again.
          </div>
        ) : displayAssemblies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No assemblies found matching your filters.
          </div>
        ) : (
          <>
            {displayAssemblies.map((assembly) => {
              const isSelected = isAssemblySelected(assembly)
              return (
                <Card
                  key={assembly.assembly_accession}
                  className={cn(
                    "p-4 transition-all duration-200",
                    isSelected ? "border-primary/60 bg-primary/5 shadow-sm" : "hover:border-primary/40 hover:bg-muted/20"
                  )}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleAssemblySelect(assembly, checked as boolean)}
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {assembly.assembly_name || assembly.assembly_accession}
                            </span>
                            {assembly.refseq_category === 'reference genome' && (
                              <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 gap-1">
                                <Star className="h-3 w-3 fill-current" />
                                Reference
                              </Badge>
                            )}
                            {assembly.assembly_level && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 capitalize">
                                <Layers className="h-3 w-3" />
                                {assembly.assembly_level}
                              </Badge>
                            )}
                            {assembly.assembly_status && (
                              <Badge
                                variant={assembly.assembly_status === 'current' ? 'default' : 'secondary'}
                                className="text-[10px] px-1.5 py-0 h-5 gap-1 capitalize"
                              >
                                {assembly.assembly_status === 'current' ? (
                                  <CheckCircle className="h-3 w-3" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                {assembly.assembly_status}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {assembly.organism_name || 'Unknown organism'}
                          </p>
                          <p className="text-[11px] text-muted-foreground/80 font-mono">
                            {assembly.assembly_accession}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-primary"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleViewDetails(assembly)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        Details
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span className="text-xs truncate">{assembly.submitter || 'Unknown submitter'}</span>
                      </div>
                      {assembly.release_date && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span className="text-xs">{new Date(assembly.release_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-foreground">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <span className="text-xs font-semibold tabular-nums">
                          {assembly.annotations_count?.toLocaleString() || '0'} annotations
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}

            <div ref={loadMoreObserverRef} className="h-10 flex items-center justify-center">
              {isLoadingMore && (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              )}
            </div>

            {!hasMore && allAssemblies.length > 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">
                No more assemblies to load
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
