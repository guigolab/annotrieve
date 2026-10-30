"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { toast } from "sonner"

import { GenesAnnotationDrawer } from "@/components/genes/genes-annotation-drawer"
import { GenesAnnotationsStatusCard } from "@/components/genes/genes-annotations-status-card"
import { GenesAnnotationsTable } from "@/components/genes/genes-annotations-table"
import { GenesAnnotationsToolbar } from "@/components/genes/genes-annotations-toolbar"
import { GenesFloatingSelectionBar } from "@/components/genes/genes-floating-selection-bar"
import {
  GenesGenePeekPopover,
  type GenePeekState,
} from "@/components/genes/genes-gene-peek-popover"
import { GenesPinsTray } from "@/components/genes/genes-pins-tray"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { GenesHitsAdapter, ResolvedTerm } from "@/lib/genes/adapter"
import {
  MAX_PINS,
  useCompareStore,
} from "@/lib/genes/compare-store"
import {
  pinCountByAnnotation as pinCountByAnnotationFn,
  pinKey,
  pinnedKeys as pinnedKeysFn,
  resolveAndPinMany,
  resolveAndTogglePin,
  resolveGenesByName,
  type PinTarget,
} from "@/lib/genes/pin-gene"
import {
  cycleAnnotationsSort,
  isDefaultAnnotationsSort,
  type AnnotationsSort,
  type AnnotationsSortDir,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import type { AnnotationsPipelineResult } from "@/lib/genes/annotations-pipeline"
import type { CoverageRange } from "@/lib/genes/coverage"
import { hitsToTsv, isDefaultCoverageRange } from "@/lib/genes/coverage"
import {
  ALL_SOURCE_CODES,
  filterFromSelection,
  type GenesFilter,
} from "@/lib/genes/filters"
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
  matchedCounts: number[]
  termCount: number
  keep: KeepPolicy
  onKeepChange: (k: KeepPolicy) => void
  sort: AnnotationsSort | null
  sortDir: AnnotationsSortDir
  onSortChange: (sort: AnnotationsSort | null, dir?: AnnotationsSortDir) => void
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
  onGoToCompare: () => void
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
  matchedCounts,
  termCount,
  keep,
  onKeepChange,
  sort,
  sortDir,
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
  onGoToCompare,
  taxonIndex,
  loading,
  className,
}: GenesAnnotationsViewProps) {
  const lastOpenerRef = useRef<string | null>(null)
  const footerStackRef = useRef<HTMLDivElement>(null)
  const [footerHeight, setFooterHeight] = useState(0)
  const [genePeek, setGenePeek] = useState<GenePeekState | null>(null)
  const [pendingPinKeys, setPendingPinKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [pinningSelection, setPinningSelection] = useState(false)
  const pins = useCompareStore((s) => s.pins)
  const pinMode = useCompareStore((s) => s.pinMode)
  const setPins = useCompareStore((s) => s.setPins)
  const rows = pipeline?.rows ?? []
  const visibleTotal = pipeline?.visibleTotal ?? 0
  const visibleSpecies = pipeline?.visibleSpecies ?? 0

  const subjectGene = useMemo(
    () => subjectGeneName(listFilters, activeNames),
    [listFilters, activeNames],
  )

  const pinnedKeySet = useMemo(() => pinnedKeysFn(pins), [pins])
  const pinCounts = useMemo(() => pinCountByAnnotationFn(pins), [pins])

  useEffect(() => {
    if (pinMode === "pin") setGenePeek(null)
  }, [pinMode])

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
    if (!isDefaultAnnotationsSort(sort, sortDir)) return true
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
    sortDir,
    search,
  ])

  const onSortColumnClick = useCallback(
    (key: AnnotationsSort) => {
      const next = cycleAnnotationsSort({ sort, sortDir }, key)
      onSortChange(next.sort, next.sortDir)
    },
    [sort, sortDir, onSortChange],
  )

  useEffect(() => {
    const el = footerStackRef.current
    if (!el || typeof ResizeObserver === "undefined") {
      setFooterHeight(0)
      return
    }
    const measure = () =>
      setFooterHeight(Math.ceil(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [
    selection.rows,
    selection.cols,
    pins.length,
    pipeline,
    showReset,
  ])

  const selectionCounts = useMemo(() => {
    if (
      !adapter ||
      (!selection.rows.length && !selection.cols.length)
    ) {
      return { annotations: 0, species: 0 }
    }
    if (selection.rows.length && !selection.cols.length) {
      const idSet = new Set(selection.rows)
      const items = (pipeline?.annotations ?? []).filter((a) =>
        idSet.has(a.row.annotationId),
      )
      const species = new Set(items.map((a) => a.speciesId))
      return { annotations: items.length, species: species.size }
    }
    const pred = filterFromSelection(filter, selection, selectionNameMatch)
    return {
      annotations: adapter.annotations(pred, { limit: 1, offset: 0 }).total,
      species: adapter.speciesCount(pred),
    }
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

  const onPinGeneCell = useCallback(
    async (
      annotationId: string,
      species: string,
      source: number,
      geneName: string,
    ) => {
      const key = pinKey(annotationId, geneName)
      let skipped = false
      setPendingPinKeys((prev) => {
        if (prev.has(key)) {
          skipped = true
          return prev
        }
        const next = new Set(prev)
        next.add(key)
        return next
      })
      if (skipped) return
      try {
        const result = await resolveAndTogglePin({
          annotationId,
          species,
          source,
          geneName,
        })
        if (result.status === "error") {
          toast.error(result.message)
        } else if (result.status === "pinned" && result.ambiguous > 0) {
          const n = result.ambiguous
          toast.message(
            `${n} gene${n === 1 ? "" : "s"} share this name; pinned the first. Choose another in Inspect`,
          )
        }
      } finally {
        setPendingPinKeys((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    },
    [],
  )

  const onPinSelection = useCallback(async () => {
    if (
      pinningSelection ||
      (!selection.rows.length && !selection.cols.length)
    ) {
      return
    }
    const annotations = pipeline?.annotations ?? []
    const targets: PinTarget[] = []

    if (selection.rows.length) {
      const idSet = new Set(selection.rows)
      for (const item of annotations) {
        if (!idSet.has(item.row.annotationId)) continue
        const geneNames = item.row.matchedTerms
          .map((ti) => activeTerms[ti]?.name)
          .filter((n): n is string => Boolean(n))
        if (!geneNames.length) continue
        targets.push({
          annotationId: item.row.annotationId,
          species: item.speciesLabel,
          source: item.row.source,
          geneNames,
        })
      }
    }
    if (selection.cols.length) {
      const nameSet = new Set(selection.cols.map((n) => n.toLowerCase()))
      const selectedNames = activeTerms
        .filter((t) => nameSet.has(t.name.toLowerCase()))
        .map((t) => t.name)
      if (!selectedNames.length && !selection.rows.length) {
        toast.message("No matching genes to pin")
        return
      }
      for (const item of annotations) {
        if (
          selection.rows.length &&
          !selection.rows.includes(item.row.annotationId)
        ) {
          continue
        }
        const matchedNames = item.row.matchedTerms
          .map((ti) => activeTerms[ti]?.name)
          .filter(
            (n): n is string =>
              Boolean(n) && nameSet.has(n!.toLowerCase()),
          )
        if (!matchedNames.length) continue
        targets.push({
          annotationId: item.row.annotationId,
          species: item.speciesLabel,
          source: item.row.source,
          geneNames: matchedNames,
        })
      }
    }

    if (!targets.length) {
      toast.message("Nothing to pin in the current selection")
      return
    }

    const room = Math.max(0, MAX_PINS - pins.length)
    if (room === 0) {
      toast.error(`Pin limit reached (${MAX_PINS})`)
      return
    }

    // Cap gene slots across targets so we do not exceed MAX_PINS.
    let remaining = room
    const capped: PinTarget[] = []
    for (const t of targets) {
      if (remaining <= 0) break
      const names = t.geneNames.slice(0, remaining)
      if (!names.length) continue
      capped.push({ ...t, geneNames: names })
      remaining -= names.length
    }

    const snapshot = [...pins]
    const annotationCount = new Set(capped.map((t) => t.annotationId)).size
    setPinningSelection(true)
    try {
      const result = await resolveAndPinMany(capped)
      if (result.pinned === 0) {
        const sample = result.missing
          .slice(0, 3)
          .map((m) => m.split(":").slice(1).join(":") || m)
        const missingNote = result.missing.length
          ? ` (${sample.join(", ")}${result.missing.length > 3 ? "…" : ""})`
          : ""
        toast.message(
          result.missing.length
            ? `Nothing pinned · ${result.missing.length} not found${missingNote}`
            : "Nothing pinned (already pinned or not found)",
        )
        return
      }
      const truncated = result.truncated || capped.length < targets.length
      const parts = [
        `Pinned ${result.pinned} gene${result.pinned === 1 ? "" : "s"} in ${annotationCount} annotation${annotationCount === 1 ? "" : "s"}`,
      ]
      if (truncated) parts.push(`(capped at ${MAX_PINS})`)
      if (result.missing.length) {
        const sample = result.missing
          .slice(0, 3)
          .map((m) => m.split(":").slice(1).join(":") || m)
        parts.push(
          `· ${result.missing.length} not found${sample.length ? ` (${sample.join(", ")}${result.missing.length > 3 ? "…" : ""})` : ""}`,
        )
      }
      toast(parts.join(" "), {
        action: {
          label: "View Compare",
          onClick: onGoToCompare,
        },
        cancel: {
          label: "Undo",
          onClick: () => setPins(snapshot),
        },
      })
      onClearSelection()
    } finally {
      setPinningSelection(false)
    }
  }, [
    selection,
    pinningSelection,
    pipeline,
    activeTerms,
    pins,
    onGoToCompare,
    setPins,
    onClearSelection,
  ])

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
    if (!selection.rows.length && !selection.cols.length) {
      return
    }
    if (selection.rows.length && !selection.cols.length) {
      onSetListFilters({
        ...EMPTY_LIST_FILTERS,
        nameMatch: selectionNameMatch,
        includeAnnotationIds: [...selection.rows],
      })
    } else {
      onSetListFilters({
        ...listFilters,
        includeTaxids: selection.rows.length
          ? [...selection.rows]
          : listFilters.includeTaxids,
        includeNames: selection.cols.length
          ? [...selection.cols]
          : listFilters.includeNames,
        nameMatch: selectionNameMatch,
        includeAnnotationIds: selection.rows.length
          ? [...selection.rows]
          : [],
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
  const showStatus = Boolean(pipeline) || !loading

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          drawerOpen && "hidden lg:flex",
        )}
      >
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
          matchedCounts={matchedCounts}
          visibleTotal={visibleTotal}
          showReset={showReset}
          onReset={onReset}
          onDownload={onDownload}
          downloadDisabled={!adapter || loading}
        />

        {loading && !pipeline ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <Card className="w-full max-w-sm border-2 border-dashed p-8 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-foreground">
                No annotations match
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try clearing Source, coverage, Keep, or search filters.
              </p>
              {showReset ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={onReset}
                >
                  Reset
                </Button>
              ) : null}
            </Card>
          </div>
        ) : (
          <GenesAnnotationsTable
            rows={rows}
            geneColumns={activeTerms}
            termCount={termCount}
            selection={selection}
            openAnnotationId={drawer?.annotationId ?? null}
            subjectGene={subjectGene}
            pinMode={pinMode}
            pinnedKeys={pinnedKeySet}
            pinCountByAnnotation={pinCounts}
            pendingPinKeys={pendingPinKeys}
            sort={sort}
            sortDir={sortDir}
            onSortColumnClick={onSortColumnClick}
            onPinGeneCell={onPinGeneCell}
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
            bottomInset={footerHeight}
          />
        )}

        <div
          ref={footerStackRef}
          className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3 sm:px-4"
        >
          <GenesFloatingSelectionBar
            selection={selection}
            annotationCount={selectionCounts.annotations}
            speciesCount={selectionCounts.species}
            nameMatch={selectionNameMatch}
            onNameMatchChange={onSelectionNameMatchChange}
            onShowOnly={onShowOnly}
            onClear={onClearSelection}
            onPin={onPinSelection}
            pinning={pinningSelection}
            rowsAreAnnotations
            className="relative inset-x-auto bottom-auto px-0"
          />
          {showStatus ? (
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <div aria-hidden />
              <GenesAnnotationsStatusCard
                visibleTotal={visibleTotal}
                visibleSpecies={visibleSpecies}
                overviewTotal={overviewTotal}
                keep={keep}
                onKeepChange={onKeepChange}
                sources={sources}
                sourceCounts={sourceCounts}
                onToggleSource={onToggleSource}
                coverage={coverage}
                onCoverageChange={onCoverageChange}
                termCount={termCount}
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
                    includeTaxids: listFilters.includeTaxids.filter(
                      (t) => t !== id,
                    ),
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
                    includeAnnotationIds:
                      listFilters.includeAnnotationIds.filter((a) => a !== id),
                  })
                }
                showReset={showReset}
                onReset={onReset}
              />
              <div className="flex justify-end">
                <GenesPinsTray onGoToCompare={onGoToCompare} />
              </div>
            </div>
          ) : null}
        </div>
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
