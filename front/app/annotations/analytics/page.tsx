"use client"

import { useState, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, TrendingUp, HelpCircle, ChevronDown, PanelLeft, PanelLeftClose } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useAnnotationSubsetsStore } from "@/lib/stores/annotation-subsets"
import {
  EMPTY_FILTERS_STATE,
  filtersStateHasActive,
  useAnalyticsCurrentFiltersStore,
} from "@/lib/stores/analytics-current-filters"
import {
  useFavoritesCart,
  useActiveCustomAnnotations,
  usePruneOrphanedCustomAnnotations,
} from "@/lib/hooks/use-favorites-state"
import { buildParamsFromFilters, cn } from "@/lib/utils"
import {
  AnalyticsSidebar,
  CURRENT_ENTRY_ID,
  CURRENT_ENTRY_COLOR,
  type AnalyticsEntry,
  type EntityType,
} from "@/components/annotations-analytics/analytics-sidebar"
import { AnalyticsChartArea } from "@/components/annotations-analytics/analytics-chart-area"
import { formatLabel } from "@/lib/annotations-formatting"
import type { FiltersState } from "@/lib/stores/annotations-filters"
import { useMergedFavoriteAnnotations } from "@/lib/hooks/use-merged-favorite-annotations"
import { useResponsiveSidebar } from "@/lib/hooks/use-responsive-sidebar"
import { CollapsiblePageSidebar } from "@/components/layout/collapsible-page-sidebar"

const SIDEBAR_WIDTH = 280

const MAX_SELECTED = 10
const ANALYTICS_DESCRIPTION =
  "Compare gene, transcript and BUSCO statistics across filter sets. Select filter sets in the left panel, choose category and metric, and optionally add favorite annotations as reference lines on the chart."

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFilterSummary(filters: FiltersState): string {
  const parts: string[] = []
  if (filters.selectedTaxons.length > 0)
    parts.push(`${filters.selectedTaxons.length} taxon${filters.selectedTaxons.length > 1 ? "s" : ""}`)
  if (filters.selectedBioprojects.length > 0)
    parts.push(`${filters.selectedBioprojects.length} bioproject${filters.selectedBioprojects.length > 1 ? "s" : ""}`)
  if (filters.selectedAssemblies.length > 0)
    parts.push(`${filters.selectedAssemblies.length} assembl${filters.selectedAssemblies.length > 1 ? "ies" : "y"}`)
  if (filters.selectedAssemblyLevels.length > 0)
    parts.push(`${filters.selectedAssemblyLevels.length} level${filters.selectedAssemblyLevels.length > 1 ? "s" : ""}`)
  if (filters.onlyRefGenomes) parts.push("RefSeq")
  if (filters.biotypes.length > 0)
    parts.push(`${filters.biotypes.length} biotype${filters.biotypes.length > 1 ? "s" : ""}`)
  if (filters.featureTypes.length > 0)
    parts.push(`${filters.featureTypes.length} feat. type${filters.featureTypes.length > 1 ? "s" : ""}`)
  if (filters.buscoCompleteFrom != null || filters.buscoCompleteTo != null)
    parts.push(`BUSCO ${filters.buscoCompleteFrom ?? 0}–${filters.buscoCompleteTo ?? 100}%`)
  return parts.join(" · ")
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnotationsAnalyticsPage() {
  const router = useRouter()

  // ── Snapshot of list filters at Analytics entry (not live list store) ───────
  const snapshot = useAnalyticsCurrentFiltersStore(s => s.snapshot)
  const buildAnnotationsParams = useAnnotationsFiltersStore(s => s.buildAnnotationsParams)

  const subsets = useAnnotationSubsetsStore(s => s.subsets)
  usePruneOrphanedCustomAnnotations(true)
  const { favoriteSelections } = useFavoritesCart()
  const activeCustomAnnotations = useActiveCustomAnnotations()

  const { favoriteAnnotations } = useMergedFavoriteAnnotations({
    favoriteSelections,
    customAnnotations: activeCustomAnnotations,
  })

  // ── Page state (lazy init to avoid new array ref on every render) ───────────
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [CURRENT_ENTRY_ID])
  const [entityType, setEntityType] = useState<EntityType>("genes")
  const { sidebarOpen, setSidebarOpen, toggleSidebar, closeSidebar, isDesktop } =
    useResponsiveSidebar()

  const handleSelectionChange = useCallback(
    (ids: string[]) => {
      setSelectedIds(ids)
      if (!isDesktop) closeSidebar()
    },
    [isDesktop, closeSidebar]
  )

  const currentFilters = snapshot ?? EMPTY_FILTERS_STATE
  const isCurrentActive = filtersStateHasActive(snapshot)

  // ── Derived: all sidebar entries (stable deps = no unnecessary new array refs) ─
  const allEntries: AnalyticsEntry[] = useMemo(() => {
    const filterSummary = buildFilterSummary(currentFilters)

    const virtualEntry: AnalyticsEntry = {
      id: CURRENT_ENTRY_ID,
      name: isCurrentActive ? "Current filters" : "All annotations",
      color: CURRENT_ENTRY_COLOR,
      isVirtual: true,
      filterSummary: isCurrentActive ? filterSummary : "No filters applied",
    }

    const savedEntries: AnalyticsEntry[] = subsets.map(s => ({
      id: s.id,
      name: s.name,
      color: s.color ?? "#3b82f6",
      isVirtual: false,
      filterSummary: buildFilterSummary(s.filters),
    }))

    return [virtualEntry, ...savedEntries]
  }, [currentFilters, isCurrentActive, subsets])

  // ── Derived: selected entries (Set for O(1) lookup per 5.12/7.12) ───────────
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedEntries = useMemo(
    () => allEntries.filter(e => selectedIdsSet.has(e.id)),
    [allEntries, selectedIdsSet]
  )

  const getFiltersForEntry = useCallback(
    (entryId: string): FiltersState | undefined => {
      if (entryId === CURRENT_ENTRY_ID) {
        return currentFilters
      }
      return subsets.find(s => s.id === entryId)?.filters
    },
    [currentFilters, subsets]
  )

  // ── Params builders ──────────────────────────────────────────────────────────
  const buildCurrentParams = useCallback((): Record<string, any> => {
    return buildParamsFromFilters(currentFilters)
  }, [currentFilters])

  const buildFavoritesParams = useCallback(
    (ids: string[]): Record<string, any> => {
      const params = buildAnnotationsParams(true, ids)
      delete params.limit
      delete params.offset
      return params
    },
    [buildAnnotationsParams]
  )

  const subsetParams = useMemo<Record<string, Record<string, any>>>(() => {
    return Object.fromEntries(subsets.map(s => [s.id, buildParamsFromFilters(s.filters)]))
  }, [subsets])

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0">
      <CollapsiblePageSidebar
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        width={SIDEBAR_WIDTH}
        title="Filter sets"
      >
        <AnalyticsSidebar
          entries={allEntries}
          selectedIds={selectedIds}
          onSelectionChange={handleSelectionChange}
          maxSelected={MAX_SELECTED}
        />
      </CollapsiblePageSidebar>

      {/* ── Main content (header + filter pills + chart) ─────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Row 1: Filter sets toggle, title, help | Back (far right) */}
        <header className="flex-shrink-0 border-b border-border bg-background px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1.5 shrink-0"
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? "Close filter sets" : "Open filter sets"}
                title={sidebarOpen ? "Close filter sets" : "Open filter sets"}
              >
                {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                <span className="text-sm sm:hidden">{sidebarOpen ? "Hide" : "Sets"}</span>
                <span className="hidden sm:inline text-sm">{sidebarOpen ? "Hide" : "Filter sets"}</span>
              </Button>
              <div className="h-5 w-px bg-border/60 shrink-0 hidden sm:block" />
              <div className="flex items-center gap-2 shrink-0 min-w-0">
                <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                <h1 className="text-base font-semibold truncate">Analytics</h1>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" aria-label="Help">
                      <HelpCircle className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="max-w-sm p-3 text-sm text-muted-foreground" align="start">
                    {ANALYTICS_DESCRIPTION}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 shrink-0"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Back to annotations</span>
            </Button>
          </div>
        </header>

        {/* Row 2: Active filter set pills (same horizontal padding as chart area) */}
        {selectedEntries.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-3 py-2 sm:px-5 border-b border-border/60 bg-muted/20 flex-wrap"
          >
            {selectedEntries.map((entry) => (
              <FilterPill
                key={entry.id}
                entry={entry}
                getFilters={getFiltersForEntry}
                formatLabel={formatLabel}
              />
            ))}
          </div>
        )}

        {/* Row 3: Chart area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <AnalyticsChartArea
            selectedEntries={selectedEntries}
            entityType={entityType}
            onEntityTypeChange={setEntityType}
            favoriteAnnotations={favoriteAnnotations}
            buildCurrentParams={buildCurrentParams}
            buildFavoritesParams={buildFavoritesParams}
            subsetParams={subsetParams}
          />
        </div>
      </main>
    </div>
  )
}

// ─── Filter pill with expandable filter details ──────────────────────────────

function FilterPill({
  entry,
  getFilters,
  formatLabel,
}: {
  entry: AnalyticsEntry
  getFilters: (entryId: string) => FiltersState | undefined
  formatLabel: (s: string) => string
}) {
  const filters = getFilters(entry.id)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            entry.isVirtual ? "border-dashed" : "border-border bg-muted/30"
          )}
          style={entry.isVirtual ? { borderColor: entry.color, backgroundColor: `${entry.color}18` } : undefined}
          aria-label={`View filters for ${entry.name}`}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="truncate max-w-[120px]">{entry.name}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-72 overflow-y-auto p-3 text-left" align="start">
        <div className="text-xs font-semibold mb-2" style={{ color: entry.color }}>
          {entry.name}
        </div>
        <CompactFilterList filters={filters} formatLabel={formatLabel} />
      </PopoverContent>
    </Popover>
  )
}

function CompactFilterList({
  filters,
  formatLabel,
}: {
  filters: FiltersState | undefined
  formatLabel: (s: string) => string
}) {
  if (!filters) return <p className="text-xs text-muted-foreground">No filter details</p>
  const parts: { label: string; items: string[] }[] = []
  if (filters.selectedTaxons?.length)
    parts.push({
      label: "Taxons",
      items: filters.selectedTaxons.map((t: { scientific_name?: string; taxid?: string }) => t.scientific_name || String(t.taxid ?? t)),
    })
  if (filters.selectedOrganisms?.length)
    parts.push({
      label: "Organisms",
      items: filters.selectedOrganisms.map((o) => o.organism_name ?? o.taxid ?? String(o)),
    })
  if (filters.selectedBioprojects?.length)
    parts.push({ label: "Bioprojects", items: filters.selectedBioprojects.map((b: { accession?: string }) => b.accession ?? String(b)) })
  if (filters.selectedAssemblies?.length)
    parts.push({ label: "Assemblies", items: filters.selectedAssemblies.map((a: { assembly_accession?: string }) => a.assembly_accession ?? String(a)) })
  if (filters.selectedAssemblyLevels?.length)
    parts.push({ label: "Levels", items: filters.selectedAssemblyLevels.map(formatLabel) })
  if (filters.selectedAssemblyStatuses?.length)
    parts.push({ label: "Statuses", items: filters.selectedAssemblyStatuses.map(formatLabel) })
  if (filters.onlyRefGenomes) parts.push({ label: "RefSeq", items: ["Only"] })
  if (filters.biotypes?.length) parts.push({ label: "Biotypes", items: filters.biotypes.map(formatLabel) })
  if (filters.featureTypes?.length) parts.push({ label: "Feature types", items: filters.featureTypes.map(formatLabel) })
  if (filters.featureSources?.length) parts.push({ label: "Sources", items: filters.featureSources.map(formatLabel) })
  if (filters.pipelines?.length) parts.push({ label: "Pipelines", items: filters.pipelines.map(formatLabel) })
  if (filters.providers?.length) parts.push({ label: "Providers", items: filters.providers.map(formatLabel) })
  if (filters.databaseSources?.length) parts.push({ label: "Databases", items: filters.databaseSources.map(formatLabel) })
  if (filters.buscoCompleteFrom != null || filters.buscoCompleteTo != null)
    parts.push({
      label: "BUSCO completeness",
      items: [`${filters.buscoCompleteFrom ?? 0}–${filters.buscoCompleteTo ?? 100}%`],
    })
  if (parts.length === 0) return <p className="text-xs text-muted-foreground">No filters applied</p>
  return (
    <div className="space-y-2 text-xs">
      {parts.map(({ label, items }) => (
        <div key={label}>
          <span className="font-medium text-muted-foreground">{label}: </span>
          <span className="text-foreground">
            {items.slice(0, 5).join(", ")}
            {items.length > 5 ? ` +${items.length - 5}` : ""}
          </span>
        </div>
      ))}
    </div>
  )
}
