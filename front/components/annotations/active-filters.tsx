"use client"

import { useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { Database, Network, Filter, Save, ChevronLeft, ChevronRight } from "lucide-react"
import { useAnnotationsFiltersStore, type FiltersState } from "@/lib/stores/annotations-filters"
import { useAnnotationSubsetsStore } from "@/lib/stores/annotation-subsets"
import { useShownTooltipsStore } from "@/lib/stores/shown-tooltips"
import { FilterChip } from "./active-filters/filter-chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { buildEntityDetailsUrl, cn, getFiltersHash } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"

interface ActiveFiltersProps {
  readOnly?: boolean
}

export function ActiveFilters({ readOnly = false }: ActiveFiltersProps = {}) {
  const router = useRouter()
  const store = useAnnotationsFiltersStore()
  const addSubset = useAnnotationSubsetsStore((state) => state.addSubset)
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)
  const findSubsetByFiltersHash = useAnnotationSubsetsStore((state) => state.findSubsetByFiltersHash)
  const lastLoadedSubsetId = useAnnotationSubsetsStore((state) => state.lastLoadedSubsetId)
  const setLastLoadedSubsetId = useAnnotationSubsetsStore((state) => state.setLastLoadedSubsetId)
  
  // UI store for sidebar toggle
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen)
  const isDesktop = useUIStore((state) => state.isDesktop)
  const setIsSidebarOpen = useUIStore((state) => state.setIsSidebarOpen)
  const {
    selectedTaxons,
    selectedOrganisms,
    selectedAssemblies,
    selectedBioprojects,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    pipelines,
    providers,
    featureSources,
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
    setFeatureSources,
    clearAllFilters,
  } = store

  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [newSubsetName, setNewSubsetName] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  
  // Track last saved subset ID to disable save button until filters change
  const lastSavedSubsetIdRef = useRef<string | null>(null)
  
  // Import the shared ref from filter-subsets-manager
  // We'll use a dynamic import approach or add it to the store
  // For now, let's add a method to the store to track last loaded

  const [tooltipKeys, setTooltipKeys] = useState<Set<string>>(new Set())
  const [tooltipPositions, setTooltipPositions] = useState<Map<string, { top: number; left: number }>>(new Map())
  const chipRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const previousTaxonKeys = useRef<Set<string>>(new Set())
  const previousAssemblyKeys = useRef<Set<string>>(new Set())
  const { isShown, markAsShown } = useShownTooltipsStore()

  // Track new taxon/assembly filters and show tooltip for 3 seconds (only once per filter)
  useEffect(() => {
    const currentTaxonKeys = new Set(selectedTaxons.map(t => `taxon-${String(t.taxid ?? "")}`))
    const currentAssemblyKeys = new Set(selectedAssemblies.map(a => `assembly-${a.assembly_accession || ""}`))

    // Find newly added taxons (only those that haven't shown tooltip before)
    const newTaxonKeys = new Set<string>()
    currentTaxonKeys.forEach(key => {
      if (!previousTaxonKeys.current.has(key) && !isShown(key)) {
        newTaxonKeys.add(key)
      }
    })

    // Find newly added assemblies (only those that haven't shown tooltip before)
    const newAssemblyKeys = new Set<string>()
    currentAssemblyKeys.forEach(key => {
      if (!previousAssemblyKeys.current.has(key) && !isShown(key)) {
        newAssemblyKeys.add(key)
      }
    })

    // Show tooltips for new filters that haven't been shown before
    if (newTaxonKeys.size > 0 || newAssemblyKeys.size > 0) {
      const newTooltipKeys = new Set([...newTaxonKeys, ...newAssemblyKeys])
      
      // Mark these tooltips as shown in the store
      newTooltipKeys.forEach(key => {
        markAsShown(key)
      })
      
      setTooltipKeys(newTooltipKeys)

      // Calculate positions for tooltips
      const updatePositions = () => {
        const positions = new Map<string, { top: number; left: number }>()
        newTooltipKeys.forEach(key => {
          const chipElement = chipRefs.current.get(key)
          if (chipElement) {
            const rect = chipElement.getBoundingClientRect()
            positions.set(key, {
              top: rect.top + window.scrollY - 8,
              left: rect.left + rect.width / 2 + window.scrollX
            })
          }
        })
        setTooltipPositions(prev => {
          const updated = new Map(prev)
          positions.forEach((pos, key) => updated.set(key, pos))
          return updated
        })
      }

      // Update positions after a short delay to ensure DOM is ready
      setTimeout(updatePositions, 0)
      window.addEventListener('scroll', updatePositions, true)
      window.addEventListener('resize', updatePositions)

      // Hide tooltips after 3 seconds
      const timeout = setTimeout(() => {
        setTooltipKeys(prev => {
          const updated = new Set(prev)
          newTooltipKeys.forEach(key => updated.delete(key))
          return updated
        })
        setTooltipPositions(prev => {
          const updated = new Map(prev)
          newTooltipKeys.forEach(key => updated.delete(key))
          return updated
        })
      }, 3000)

      // Update previous keys
      previousTaxonKeys.current = currentTaxonKeys
      previousAssemblyKeys.current = currentAssemblyKeys

      return () => {
        clearTimeout(timeout)
        window.removeEventListener('scroll', updatePositions, true)
        window.removeEventListener('resize', updatePositions)
      }
    } else {
      // Update previous keys even if no new filters
      previousTaxonKeys.current = currentTaxonKeys
      previousAssemblyKeys.current = currentAssemblyKeys
    }
  }, [selectedTaxons, selectedAssemblies])

  // Remove handlers for each filter type
  const handleRemoveTaxid = useCallback((taxid: string) => {
    setSelectedTaxons(selectedTaxons.filter(t => String(t.taxid) !== taxid))
  }, [selectedTaxons, setSelectedTaxons])

  const handleRemoveAssembly = useCallback((accession: string) => {
    setSelectedAssemblies(selectedAssemblies.filter(a => a.assembly_accession !== accession))
  }, [selectedAssemblies, setSelectedAssemblies])

  const handleRemoveBioproject = useCallback((accession: string) => {
    setSelectedBioprojects(selectedBioprojects.filter(bp => bp.accession !== accession))
  }, [selectedBioprojects, setSelectedBioprojects])

  const handleRemoveAssemblyLevel = useCallback((level: string) => {
    setSelectedAssemblyLevels(selectedAssemblyLevels.filter(l => l !== level))
  }, [selectedAssemblyLevels, setSelectedAssemblyLevels])

  const handleRemoveAssemblyStatus = useCallback((status: string) => {
    setSelectedAssemblyStatuses(selectedAssemblyStatuses.filter(s => s !== status))
  }, [selectedAssemblyStatuses, setSelectedAssemblyStatuses])

  const handleRemoveRefseqCategory = useCallback(() => {
    setOnlyRefGenomes(false)
  }, [setOnlyRefGenomes])

  const handleRemoveBiotype = useCallback((biotype: string) => {
    setBiotypes(biotypes.filter(b => b !== biotype))
  }, [biotypes, setBiotypes])

  const handleRemoveFeatureType = useCallback((type: string) => {
    setFeatureTypes(featureTypes.filter(t => t !== type))
  }, [featureTypes, setFeatureTypes])

  const handleRemovePipeline = useCallback((pipeline: string) => {
    setPipelines(pipelines.filter(p => p !== pipeline))
  }, [pipelines, setPipelines])

  const handleRemoveProvider = useCallback((provider: string) => {
    setProviders(providers.filter(pr => pr !== provider))
  }, [providers, setProviders])

  const handleRemoveDatabaseSource = useCallback((databaseSource: string) => {
    setDatabaseSources(databaseSources.filter(d => d !== databaseSource))
  }, [databaseSources, setDatabaseSources])

  const handleRemoveFeatureSource = useCallback((featureSource: string) => {
    setFeatureSources(featureSources.filter(f => f !== featureSource))
  }, [featureSources, setFeatureSources])

  const chipColorScheme = {
    bg: "bg-card/70",
    bgHover: "hover:bg-card",
    border: "border-border/70",
    text: "text-foreground"
  }

  const filterChips = useMemo(() => {
    const chips: Array<{
      key: string
      label: string
      value: string
      onRemove: () => void
      icon?: ReactNode
      colorScheme: {
        bg: string
        bgHover: string
        border: string
        text: string
      }
      onClick?: () => void
      isActive?: boolean
    }> = []

    selectedTaxons.forEach((taxon) => {
      const taxid = String(taxon.taxid ?? "")
      chips.push({
        key: `taxon-${taxid}`,
        label: taxon.scientific_name || taxid,
        value: taxid,
        onRemove: () => handleRemoveTaxid(taxid),
        icon: <Network className="h-3.5 w-3.5 text-blue-500" />,
        colorScheme: chipColorScheme,
        onClick: () => router.push(buildEntityDetailsUrl("taxon", taxid)),
      })
    })

    selectedAssemblies.forEach((assembly) => {
      const accession = assembly.assembly_accession || ""
      chips.push({
        key: `assembly-${accession}`,
        label: assembly.assembly_name || accession,
        value: accession,
        onRemove: () => handleRemoveAssembly(accession),
        icon: <Database className="h-3.5 w-3.5 text-purple-500" />,
        colorScheme: chipColorScheme,
        onClick: () => router.push(buildEntityDetailsUrl("assembly", accession)),
      })
    })

    selectedBioprojects.forEach((bioproject) => {
      const accession = bioproject.accession
      chips.push({
        key: `bioproject-${accession}`,
        label: accession,
        value: accession,
        onRemove: () => handleRemoveBioproject(accession),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    selectedAssemblyLevels.forEach((level) => {
      chips.push({
        key: `assembly-level-${level}`,
        label: level,
        value: level,
        onRemove: () => handleRemoveAssemblyLevel(level),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    selectedAssemblyStatuses.forEach((status) => {
      chips.push({
        key: `assembly-status-${status}`,
        label: status,
        value: status,
        onRemove: () => handleRemoveAssemblyStatus(status),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    if (onlyRefGenomes) {
      chips.push({
        key: "refseq-reference",
        label: "Reference genome",
        value: "reference_genome",
        onRemove: handleRemoveRefseqCategory,
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    }

    biotypes.forEach((biotype) => {
      chips.push({
        key: `biotype-${biotype}`,
        label: biotype,
        value: biotype,
        onRemove: () => handleRemoveBiotype(biotype),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    featureTypes.forEach((featureType) => {
      chips.push({
        key: `feature-type-${featureType}`,
        label: featureType,
        value: featureType,
        onRemove: () => handleRemoveFeatureType(featureType),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    pipelines.forEach((pipeline) => {
      chips.push({
        key: `pipeline-${pipeline}`,
        label: pipeline,
        value: pipeline,
        onRemove: () => handleRemovePipeline(pipeline),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    providers.forEach((provider) => {
      chips.push({
        key: `provider-${provider}`,
        label: provider,
        value: provider,
        onRemove: () => handleRemoveProvider(provider),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    databaseSources.forEach((databaseSource) => {
      chips.push({
        key: `database-${databaseSource}`,
        label: databaseSource,
        value: databaseSource,
        onRemove: () => handleRemoveDatabaseSource(databaseSource),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    featureSources.forEach((featureSource) => {
      chips.push({
        key: `feature-source-${featureSource}`,
        label: featureSource,
        value: featureSource,
        onRemove: () => handleRemoveFeatureSource(featureSource),
        icon: <Filter className="h-3.5 w-3.5 text-muted-foreground" />,
        colorScheme: chipColorScheme,
      })
    })

    return chips
  }, [
    selectedTaxons,
    selectedAssemblies,
    selectedBioprojects,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    pipelines,
    providers,
    databaseSources,
    featureSources,
    handleRemoveTaxid,
    handleRemoveAssembly,
    handleRemoveAssemblyLevel,
    handleRemoveAssemblyStatus,
    handleRemoveRefseqCategory,
    handleRemoveBiotype,
    handleRemoveFeatureType,
    handleRemovePipeline,
    handleRemoveProvider,
    handleRemoveDatabaseSource,
    handleRemoveFeatureSource,
    handleRemoveBioproject,
    router,
  ])

  const hasActiveFilters = store.hasActiveFilters()

  // Compute current filters hash only when filters change
  const currentFiltersHash = useMemo(() => {
    const currentFilters: FiltersState = {
      selectedTaxons,
      selectedOrganisms,
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
    }
    return getFiltersHash(currentFilters)
  }, [
    selectedTaxons,
    selectedOrganisms,
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
  ])

  // Check if current filters match any existing subset (only when hash or subsets change)
  const matchingSubset = useMemo(() => {
    return findSubsetByFiltersHash(currentFiltersHash)
  }, [currentFiltersHash, findSubsetByFiltersHash, subsets])

  // Check if save should be disabled
  const isSaveDisabled = useMemo(() => {
    // If filters match an existing subset, disable save
    if (matchingSubset) {
      return true
    }
    
    return false
  }, [matchingSubset])

  // Reset last loaded subset ID when filters no longer match it
  useEffect(() => {
    if (lastLoadedSubsetId) {
      if (!matchingSubset || matchingSubset.id !== lastLoadedSubsetId) {
        // Filters no longer match the loaded subset (user modified them)
        setLastLoadedSubsetId(null)
      }
    }
  }, [matchingSubset, lastLoadedSubsetId, setLastLoadedSubsetId])

  // Reset last saved subset ID when filters change (no longer match the saved subset)
  useEffect(() => {
    if (lastSavedSubsetIdRef.current && matchingSubset?.id !== lastSavedSubsetIdRef.current) {
      // Filters no longer match the saved subset (user modified them)
      lastSavedSubsetIdRef.current = null
    }
  }, [matchingSubset])

  const handleSaveCurrent = () => {
    setIsSaveDialogOpen(true)
    setNewSubsetName("")
  }

  const handleSaveSubset = () => {
    const trimmedName = newSubsetName.trim()
    if (!trimmedName) return

    // Check for duplicate names (case-insensitive)
    const nameExists = subsets.some(
      subset => subset.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (nameExists) {
      return // Don't save if name already exists
    }

    setIsSaving(true)
    try {
      // Get current filters only when saving, not on every render
      const state = useAnnotationsFiltersStore.getState()
      const currentFilters: FiltersState = {
        selectedTaxons: state.selectedTaxons,
        selectedOrganisms: state.selectedOrganisms,
        selectedAssemblies: state.selectedAssemblies,
        selectedBioprojects: state.selectedBioprojects,
        selectedAssemblyLevels: state.selectedAssemblyLevels,
        selectedAssemblyStatuses: state.selectedAssemblyStatuses,
        onlyRefGenomes: state.onlyRefGenomes,
        biotypes: state.biotypes,
        featureTypes: state.featureTypes,
        featureSources: state.featureSources,
        pipelines: state.pipelines,
        providers: state.providers,
        databaseSources: state.databaseSources,
      }
      const savedId = addSubset(trimmedName, currentFilters)
      // Track that we just saved this subset - button will stay disabled until filters change
      lastSavedSubsetIdRef.current = savedId
      setIsSaveDialogOpen(false)
      setNewSubsetName("")
    } catch (error) {
      console.error("Error saving subset:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleFiltersToggle = useCallback(() => {
    if (isDesktop) {
      setIsSidebarOpen(!isSidebarOpen)
    } else {
      setIsSidebarOpen(true)
    }
  }, [isDesktop, isSidebarOpen, setIsSidebarOpen])

  // Check if name already exists (case-insensitive)
  const isNameDuplicate = Boolean(
    newSubsetName.trim() && subsets.some(
      subset => subset.name.toLowerCase() === newSubsetName.trim().toLowerCase()
    )
  )

  return (
    <>
      <div className="flex items-center gap-3 w-full overflow-x-auto mb-2">
        {/* Toggle Filter Button - always visible on extreme left (except when readOnly) */}
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleFiltersToggle}
            aria-pressed={isSidebarOpen}
            title={
              isSidebarOpen ? 'Hide filters sidebar' : 'Show filters sidebar'
            }
          >
            {isSidebarOpen ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Filters
          </Button>
        )}

        <div className="flex items-center gap-2 overflow-x-auto flex-1">
          {filterChips.map((chip) => {
            const showTooltip = tooltipKeys.has(chip.key) && chip.onClick
            const isTaxon = chip.key.startsWith("taxon-")
            const isAssembly = chip.key.startsWith("assembly-")
            const tooltipText = isTaxon 
              ? "Click on the chip to see the taxon details"
              : isAssembly
              ? "Click on the chip to see the assembly details"
              : undefined

            return (
              <div 
                key={chip.key} 
                ref={(el) => {
                  if (el) {
                    chipRefs.current.set(chip.key, el)
                  } else {
                    chipRefs.current.delete(chip.key)
                  }
                }}
              >
                <FilterChip
                  label={chip.label}
                  value={chip.value}
                  onRemove={chip.onRemove}
                  icon={chip.icon}
                  isActive={chip.isActive}
                  onClick={chip.onClick}
                  readOnly={readOnly}
                  colorScheme={chip.colorScheme}
                />
              </div>
            )
          })}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSaveCurrent}
              disabled={!hasActiveFilters || isSaveDisabled}
              title={
                !hasActiveFilters
                  ? "No filters to save"
                  : isSaveDisabled 
                    ? matchingSubset 
                      ? `Filters match existing set: "${matchingSubset.name}"`
                      : "Cannot save duplicate filters"
                    : "Save current filters as a new set"
              }
            >
              <Save className="h-4 w-4" />
              Save Filters
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              title={!hasActiveFilters ? "No filters to clear" : "Clear all filters"}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>
      {typeof window !== 'undefined' && tooltipKeys.size > 0 && createPortal(
        <>
          {Array.from(tooltipKeys).map((key) => {
            const position = tooltipPositions.get(key)
            if (!position) return null
            
            const chip = filterChips.find(c => c.key === key)
            if (!chip || !chip.onClick) return null
            
            const isTaxon = key.startsWith("taxon-")
            const isAssembly = key.startsWith("assembly-")
            const tooltipText = isTaxon 
              ? "Click on the chip to see the taxon details"
              : isAssembly
              ? "Click on the chip to see the assembly details"
              : undefined

            if (!tooltipText) return null

            return (
              <div
                key={key}
                className="fixed z-[9999] px-3 py-1.5 rounded-md border bg-popover text-popover-foreground shadow-lg text-sm whitespace-nowrap animate-in fade-in-0 zoom-in-95 pointer-events-none"
                style={{
                  top: `${position.top}px`,
                  left: `${position.left}px`,
                  transform: 'translate(-50%, -100%)',
                  marginTop: '-8px'
                }}
              >
                <p>{tooltipText}</p>
                <div 
                  className="absolute top-full left-1/2 -translate-x-1/2 -mt-px"
                  style={{ pointerEvents: 'none' }}
                >
                  <div className="border-4 border-transparent border-t-popover"></div>
                </div>
              </div>
            )
          })}
        </>,
        document.body
      )}

      {/* Save Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-base">Save Filter Set</DialogTitle>
            <DialogDescription className="text-sm">
              Give this filter set a name so you can load it later or compare it with others.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Input
              placeholder="e.g., RefSeq annotations, Human genomes..."
              value={newSubsetName}
              onChange={(e) => setNewSubsetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSubsetName.trim() && !isNameDuplicate) {
                  handleSaveSubset()
                }
              }}
              className={cn(
                "w-full",
                isNameDuplicate && "border-destructive focus-visible:ring-destructive"
              )}
              autoFocus
            />
            {isNameDuplicate && (
              <p className="text-sm text-destructive">
                A filter set with this name already exists
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSaveDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSubset}
              disabled={!newSubsetName.trim() || isSaving || isNameDuplicate}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

