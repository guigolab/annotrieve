"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { GenesAnnotationDrawer } from "@/components/genes/genes-annotation-drawer"
import { GenesAnnotationsTable } from "@/components/genes/genes-annotations-table"
import { GenesAnnotationsToolbar } from "@/components/genes/genes-annotations-toolbar"
import { GenesFilterChips } from "@/components/genes/genes-filter-chips"
import {
  GenesGenePeekPopover,
  type GenePeekState,
} from "@/components/genes/genes-gene-peek-popover"
import { GenesSelectionBar } from "@/components/genes/genes-selection-bar"
import { Button } from "@/components/ui/button"
import type { GenesHitsAdapter, ResolvedTerm } from "@/lib/genes/adapter"
import { resolveGenesByName } from "@/lib/genes/pin-gene"
import type {
  AnnotationsSort,
  KeepPolicy,
} from "@/lib/genes/annotations-controls"
import type { AnnotationsPipelineResult } from "@/lib/genes/annotations-pipeline"
import type { CoverageRange } from "@/lib/genes/coverage"
import { hitsToTsv, isDefaultCoverageRange } from "@/lib/genes/coverage"
import { filterFromSelection } from "@/components/genes/genes-overview"
import { ALL_SOURCE_CODES, type GenesFilter } from "@/lib/genes/filters"
import {
  EMPTY_LIST_FILTERS,
  subjectGeneName,
  type GenesListFilters,
  type NameMatchMode,
} from "@/lib/genes/list-filters"
import type { DistributionSelection } from "@/lib/genes/selection"
import type { GenesDrawer } from "@/lib/genes/store"
import { GENES_TSV_DOWNLOAD_CAP } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

interface GenesAnnotationsViewProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  /** Non-empty when URL/memory excludeTerms mask is active. */
  hasExcludedNames?: boolean
  taxonIndex: Map<string, import("@/lib/api/taxons").FlatTreeNode>
  listFilters: GenesListFilters
  onPatchListFilters: (patch: Partial<GenesListFilters>) => void
  onSetListFilters: (f: GenesListFilters) => void
  pipeline: AnnotationsPipelineResult | null
  overviewTotal: number
  activeTerms: ResolvedTerm[]
  activeNames: string[]
  sources: Set<number>
  sourceCounts: Map<number, number>
  onToggleSource: (code: number) => void
  coverage: CoverageRange | null
  onCoverageChange: (range: CoverageRange | null) => void
  coverageOpen: boolean
  onCoverageOpenChange: (open: boolean) => void
  matchedCounts: number[]
  termCount: number
  keep: KeepPolicy
  onKeepChange: (k: KeepPolicy) => void
  sort: AnnotationsSort
  onSortChange: (s: AnnotationsSort) => void
  search: string
  onSearchChange: (q: string) => void
  selection: DistributionSelection
  selectionNameMatch: NameMatchMode
  onSelectionNameMatchChange: (m: NameMatchMode) => void
  onDispatchSelection: (
    action: import("@/lib/genes/selection").SelectionAction,
  ) => void
  onClearSelection: () => void
  selectionAnchor: { row: string | null; col: string | null }
  onSetSelectionAnchor: (a: {
    row?: string | null
    col?: string | null
  }) => void
  onReset: () => void
  drawer: GenesDrawer | null
  onOpenDrawer: (opts: {
    annotationId: string
    species: string
    source: number
    localId?: number | null
  }) => void
  onSetDrawerGene: (localId: number | null) => void
  onCloseDrawer: () => void
  loading?: boolean
  className?: string
}

export function GenesAnnotationsView({
  adapter,
  filter,
  hasExcludedNames,
  listFilters,
  onPatchListFilters,
  onSetListFilters,
  pipeline,
  overviewTotal,
  activeTerms,
  activeNames,
  sources,
  sourceCounts,
  onToggleSource,
  coverage,
  onCoverageChange,
  coverageOpen,
  onCoverageOpenChange,
  matchedCounts,
  termCount,
  keep,
  onKeepChange,
  sort,
  onSortChange,
  search,
  onSearchChange,
  selection,
  selectionNameMatch,
  onSelectionNameMatchChange,
  onDispatchSelection,
  onClearSelection,
  selectionAnchor,
  onSetSelectionAnchor,
  onReset,
  drawer,
  onOpenDrawer,
  onSetDrawerGene,
  onCloseDrawer,
  taxonIndex,
  loading,
  className,
}: GenesAnnotationsViewProps) {
  const lastOpenerRef = useRef<string | null>(null)
  const [genePeek, setGenePeek] = useState<GenePeekState | null>(null)
  const rows = pipeline?.rows ?? []
  const visibleTotal = pipeline?.visibleTotal ?? 0
  const keptTotal = pipeline?.keptTotal ?? 0
  const visibleSpecies = pipeline?.visibleSpecies ?? 0

  const subjectGene = useMemo(
    () => subjectGeneName(listFilters, activeNames),
    [listFilters, activeNames],
  )

  const annotationIdsInOrder = useMemo(
    () =>
      rows
        .filter((r) => r.kind === "annotation")
        .map((r) => (r.kind === "annotation" ? r.item.row.annotationId : "")),
    [rows],
  )

  const geneNames = useMemo(
    () => activeTerms.map((t) => t.name),
    [activeTerms],
  )

  const showReset = useMemo(() => {
    if (hasExcludedNames) return true
    if (listFilters.includeTaxids.length) return true
    if (listFilters.includeNames.length) return true
    if (listFilters.includeCells.length) return true
    if (listFilters.includeAnnotationIds.length) return true
    if (sources.size < ALL_SOURCE_CODES.length) return true
    if (coverage != null && !isDefaultCoverageRange(coverage, termCount))
      return true
    if (keep !== "all") return true
    if (sort !== "coverage") return true
    if (search.trim()) return true
    return false
  }, [
    hasExcludedNames,
    listFilters,
    sources,
    coverage,
    termCount,
    keep,
    sort,
    search,
  ])

  const selectionCounts = useMemo(() => {
    if (!adapter || !selection.kind) {
      return { annotations: 0, species: 0 }
    }
    if (selection.kind === "rows") {
      const idSet = new Set(selection.rows)
      const items = (pipeline?.annotations ?? []).filter((a) =>
        idSet.has(a.row.annotationId),
      )
      const species = new Set(items.map((a) => a.speciesId))
      return { annotations: items.length, species: species.size }
    }
    if (selection.kind === "cols") {
      const pred = filterFromSelection(
        filter,
        selection,
        selectionNameMatch,
      )
      return {
        annotations: adapter.annotations(pred, { limit: 1, offset: 0 }).total,
        species: adapter.speciesCount(pred),
      }
    }
    return { annotations: 0, species: 0 }
  }, [adapter, filter, selection, selectionNameMatch, pipeline])

  const restoreFocusToRow = useCallback((annotationId: string | null) => {
    const id = annotationId ?? lastOpenerRef.current
    if (!id) return
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-ann-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null
      el?.focus()
    })
  }, [])

  const closeDrawer = useCallback(() => {
    const id = drawer?.annotationId ?? lastOpenerRef.current
    onCloseDrawer()
    restoreFocusToRow(id)
  }, [drawer?.annotationId, onCloseDrawer, restoreFocusToRow])

  const openRow = useCallback(
    (annotationId: string, species: string, source: number) => {
      lastOpenerRef.current = annotationId
      onOpenDrawer({ annotationId, species, source })
    },
    [onOpenDrawer],
  )

  const closeGenePeek = useCallback(() => setGenePeek(null), [])

  const onOpenGeneCell = useCallback(
    async (
      annotationId: string,
      species: string,
      source: number,
      geneName: string,
      anchorEl: HTMLElement,
    ) => {
      lastOpenerRef.current = annotationId
      const rect = anchorEl.getBoundingClientRect()
      const genes = await resolveGenesByName(annotationId, geneName)
      const localId = genes[0]?.local_id ?? null
      setGenePeek({
        annotationId,
        species,
        source,
        localId,
        geneName,
        anchorRect: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      })
    },
    [],
  )

  const onSetPeekGene = useCallback((localId: number | null) => {
    setGenePeek((prev) => (prev ? { ...prev, localId } : null))
  }, [])

  const onNavigateDrawer = useCallback(
    (direction: -1 | 1) => {
      if (!drawer) return
      const idx = annotationIdsInOrder.indexOf(drawer.annotationId)
      if (idx < 0) return
      const next = annotationIdsInOrder[idx + direction]
      if (!next) return
      const row = rows.find(
        (r) => r.kind === "annotation" && r.item.row.annotationId === next,
      )
      if (!row || row.kind !== "annotation") return
      lastOpenerRef.current = next
      onOpenDrawer({
        annotationId: next,
        species: row.item.speciesLabel,
        source: row.item.row.source,
      })
    },
    [drawer, annotationIdsInOrder, rows, onOpenDrawer],
  )

  const onToggleRow = useCallback(
    (id: string, opts: { toggle: boolean; shift: boolean }) => {
      onDispatchSelection({
        type: "click-row",
        id,
        mod: opts.toggle ? "toggle" : "replace",
        visibleRows: annotationIdsInOrder,
        shiftAnchor: opts.shift ? selectionAnchor.row : null,
      })
      if (!opts.shift) onSetSelectionAnchor({ row: id })
    },
    [
      onDispatchSelection,
      annotationIdsInOrder,
      selectionAnchor.row,
      onSetSelectionAnchor,
    ],
  )

  const onToggleCol = useCallback(
    (name: string, opts: { toggle: boolean; shift: boolean }) => {
      onDispatchSelection({
        type: "click-col",
        name,
        mod: opts.toggle ? "toggle" : "replace",
        visibleCols: geneNames,
        shiftAnchor: opts.shift ? selectionAnchor.col : null,
      })
      if (!opts.shift) onSetSelectionAnchor({ col: name })
    },
    [onDispatchSelection, geneNames, selectionAnchor.col, onSetSelectionAnchor],
  )

  const onToggleSelectAllFixed = useCallback(() => {
    onDispatchSelection({
      type: "toggle-all-rows",
      ids: annotationIdsInOrder,
    })
  }, [annotationIdsInOrder, onDispatchSelection])

  const onShowOnly = useCallback(() => {
    if (!selection.kind) return
    if (selection.kind === "rows") {
      onSetListFilters({
        ...EMPTY_LIST_FILTERS,
        nameMatch: selectionNameMatch,
        includeAnnotationIds: [...selection.rows],
      })
    } else if (selection.kind === "cols") {
      onSetListFilters({
        ...listFilters,
        includeNames: [...selection.cols],
        nameMatch: selectionNameMatch,
        includeAnnotationIds: [],
      })
    }
    onClearSelection()
  }, [
    selection,
    selectionNameMatch,
    onSetListFilters,
    listFilters,
    onClearSelection,
  ])

  const onDownload = useCallback(() => {
    if (!adapter || !pipeline) return
    const anns = pipeline.annotations
      .slice(0, GENES_TSV_DOWNLOAD_CAP)
      .map((a) => a.row)
    const matched = pipeline.annotations
      .slice(0, GENES_TSV_DOWNLOAD_CAP)
      .map((a) => a.k)
    const tsv = hitsToTsv(anns, adapter.terms, matched)
    const blob = new Blob([tsv], { type: "text/tab-separated-values" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "genes-hits.tsv"
    a.click()
    URL.revokeObjectURL(url)
  }, [adapter, pipeline])

  const assemblyName = useMemo(() => {
    if (!drawer || !adapter) return null
    return (
      adapter.rows.find((r) => r.annotationId === drawer.annotationId)
        ?.assemblyName ?? null
    )
  }, [drawer, adapter])

  const drawerOpen = Boolean(drawer)

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 overflow-hidden border border-border",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          drawerOpen && "hidden lg:flex",
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-2">
          <GenesFilterChips
            listFilters={listFilters}
            taxonLabel={(id) =>
              taxonIndex.get(id)?.scientific_name ?? id
            }
            onClearTaxids={() => onPatchListFilters({ includeTaxids: [] })}
            onClearNames={() => onPatchListFilters({ includeNames: [] })}
            onClearCells={() => onPatchListFilters({ includeCells: [] })}
            onClearAnnotationIds={() =>
              onPatchListFilters({ includeAnnotationIds: [] })
            }
            onRemoveTaxid={(id) =>
              onPatchListFilters({
                includeTaxids: listFilters.includeTaxids.filter((t) => t !== id),
              })
            }
            onRemoveName={(name) =>
              onPatchListFilters({
                includeNames: listFilters.includeNames.filter(
                  (n) => n.toLowerCase() !== name.toLowerCase(),
                ),
              })
            }
            onRemoveCell={(index) =>
              onPatchListFilters({
                includeCells: listFilters.includeCells.filter(
                  (_, i) => i !== index,
                ),
              })
            }
            onRemoveAnnotationId={(id) =>
              onPatchListFilters({
                includeAnnotationIds: listFilters.includeAnnotationIds.filter(
                  (a) => a !== id,
                ),
              })
            }
          />
          <GenesAnnotationsToolbar
            search={search}
            onSearchChange={onSearchChange}
            keep={keep}
            onKeepChange={onKeepChange}
            sources={sources}
            sourceCounts={sourceCounts}
            onToggleSource={onToggleSource}
            termCount={termCount}
            coverage={coverage}
            onCoverageChange={onCoverageChange}
            coverageOpen={coverageOpen}
            onCoverageOpenChange={onCoverageOpenChange}
            matchedCounts={matchedCounts}
            sort={sort}
            onSortChange={onSortChange}
            visibleTotal={visibleTotal}
            overviewTotal={overviewTotal}
            keptTotal={keptTotal}
            visibleSpecies={visibleSpecies}
            showReset={showReset}
            onReset={onReset}
            onDownload={onDownload}
            downloadDisabled={!adapter || loading}
          />
        </div>

        <GenesSelectionBar
          selection={selection}
          annotationCount={selectionCounts.annotations}
          speciesCount={selectionCounts.species}
          nameMatch={selectionNameMatch}
          onNameMatchChange={onSelectionNameMatchChange}
          onShowOnly={onShowOnly}
          onClear={onClearSelection}
          rowsAreAnnotations
        />

        {loading && !pipeline ? (
          <div className="space-y-1.5 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
            <p>No annotations match</p>
            <p className="max-w-sm text-center text-xs">
              Try clearing Source, coverage, Keep, or search filters.
            </p>
            {showReset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
              >
                Reset
              </Button>
            ) : null}
          </div>
        ) : (
          <GenesAnnotationsTable
            rows={rows}
            geneColumns={activeTerms}
            termCount={termCount}
            selection={selection}
            openAnnotationId={drawer?.annotationId ?? null}
            subjectGene={subjectGene}
            onToggleRow={onToggleRow}
            onToggleCol={onToggleCol}
            onToggleSelectAll={onToggleSelectAllFixed}
            onOpenRow={openRow}
            onOpenGeneCell={onOpenGeneCell}
            onNavigateDrawer={onNavigateDrawer}
            onClearSelection={onClearSelection}
            peekKey={
              genePeek
                ? `${genePeek.annotationId}\0${genePeek.geneName.toLowerCase()}`
                : null
            }
            onScrollClosePeek={genePeek ? closeGenePeek : undefined}
          />
        )}
      </div>

      <GenesAnnotationDrawer
        open={drawerOpen}
        drawer={drawer}
        adapter={adapter}
        activeNames={activeNames}
        termCount={termCount}
        assemblyName={assemblyName}
        onClose={closeDrawer}
        onSetGene={onSetDrawerGene}
        className={cn(drawerOpen && "max-lg:flex-1")}
      />

      <GenesGenePeekPopover
        peek={genePeek}
        adapter={adapter}
        activeNames={activeNames}
        termCount={termCount}
        onClose={closeGenePeek}
        onSetGene={onSetPeekGene}
      />
    </div>
  )
}
