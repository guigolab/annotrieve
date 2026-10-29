"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { GenesDistributionToolbar } from "@/components/genes/genes-distribution-toolbar"
import {
  GenesHeatmapTable,
  type HeatmapNameColumn,
} from "@/components/genes/genes-heatmap-table"
import { GENES_TREE_PAGE_SIZE } from "@/components/genes/genes-overview-constants"
import type { GenesRankOption } from "@/components/genes/genes-rank-select"
import { GenesSelectionBar } from "@/components/genes/genes-selection-bar"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import { makeFilter } from "@/lib/genes/filters"
import {
  downloadHeatmapPng,
  downloadHeatmapSvg,
  downloadHeatmapTsv,
  heatmapExportFilename,
  renderHeatmapSvg,
  renderHeatmapTsv,
  type HeatmapExportFormat,
} from "@/lib/genes/heatmap-export"
import type { NameMatchMode } from "@/lib/genes/list-filters"
import type { DistributionSelection } from "@/lib/genes/selection"
import { selectionIsEmpty } from "@/lib/genes/selection"
import { flattenHitTree, type HitTree } from "@/lib/genes/tree"
import type { CountUnit } from "@/lib/genes/view"
import { cn } from "@/lib/utils"

const EMPTY_ROOTS: HitTree["roots"] = []

interface GenesOverviewSectionProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  tree: HitTree | null
  expanded: Set<string>
  loading?: boolean
  onToggleExpand: (id: string) => void
  selection: DistributionSelection
  selectionNameMatch: NameMatchMode
  onSelectionNameMatchChange: (mode: NameMatchMode) => void
  onSelectRow: (
    id: string,
    opts: { toggle: boolean; shift: boolean },
  ) => void
  onSelectCol: (
    name: string,
    opts: { toggle: boolean; shift: boolean },
  ) => void
  onSelectCell: (
    taxid: string,
    gene: string,
    opts: { toggle: boolean; shift: boolean },
  ) => void
  onClearSelection: () => void
  onShowOnly: () => void
  onRestrictSearch?: () => void
  selectionAnnotationCount: number
  selectionSpeciesCount: number
  unit: CountUnit
  onUnitChange: (unit: CountUnit) => void
  overviewAnnotationTotal: number
  overviewSpeciesTotal: number
  zeroHitCount: number
  onReviewZeroHits?: () => void
  viewRank: string | null
  rankOptions: GenesRankOption[]
  hideAutoRank?: boolean
  rankSelectDisabled?: boolean
  rankSelectDisabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  className?: string
}

export function GenesOverviewSection({
  adapter,
  filter,
  tree,
  expanded,
  loading,
  onToggleExpand,
  selection,
  selectionNameMatch,
  onSelectionNameMatchChange,
  onSelectRow,
  onSelectCol,
  onSelectCell,
  onClearSelection,
  onShowOnly,
  onRestrictSearch,
  selectionAnnotationCount,
  selectionSpeciesCount,
  unit,
  onUnitChange,
  overviewAnnotationTotal,
  overviewSpeciesTotal,
  zeroHitCount,
  onReviewZeroHits,
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  className,
}: GenesOverviewSectionProps) {
  const [visibleLimit, setVisibleLimit] = useState(GENES_TREE_PAGE_SIZE)
  const [exporting, setExporting] = useState(false)
  const treeKeyRef = useRef("")

  const activeTerms = useMemo(
    () => (adapter ? adapter.activeTerms(filter.excludeTerms) : []),
    [adapter, filter.excludeTerms],
  )

  const columns = useMemo((): HeatmapNameColumn[] => {
    return activeTerms.map((t) => ({
      name: t.name,
      id: t.id,
      count: t.count,
    }))
  }, [activeTerms])

  const roots = tree?.roots ?? EMPTY_ROOTS
  const allVisible = useMemo(
    () => flattenHitTree(roots, expanded),
    [roots, expanded],
  )

  useEffect(() => {
    const key = `${viewRank ?? ""}|${roots.map((r) => r.id).join(",")}`
    if (key !== treeKeyRef.current) {
      treeKeyRef.current = key
      setVisibleLimit(GENES_TREE_PAGE_SIZE)
    }
  }, [viewRank, roots])

  const visible = useMemo(
    () => allVisible.slice(0, visibleLimit),
    [allVisible, visibleLimit],
  )
  const remaining = Math.max(0, allVisible.length - visible.length)

  const rowCounts = useMemo(() => {
    if (!adapter || !visible.length) return []
    return adapter.overviewRowCounts(
      filter.excludeTerms,
      visible.map((r) => r.node.id),
      viewRank,
      unit,
    )
  }, [adapter, filter.excludeTerms, visible, viewRank, unit])

  const onLoadMore = useCallback(() => {
    setVisibleLimit((n) => n + GENES_TREE_PAGE_SIZE)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectionIsEmpty(selection)) {
        onClearSelection()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selection, onClearSelection])

  const onExportHeatmap = useCallback(
    async (format: HeatmapExportFormat) => {
      if (!adapter || !roots.length || !columns.length) return
      setExporting(true)
      try {
        const exportRows = roots.map((node) => ({
          id: node.id,
          label: node.label,
          rank: node.rank,
        }))
        const exportCounts = adapter.overviewRowCounts(
          filter.excludeTerms,
          roots.map((r) => r.id),
          viewRank,
          unit,
        )
        const truncatedNote =
          allVisible.length > roots.length
            ? ` · top ${roots.length} of ${allVisible.length} taxa`
            : ""
        if (format === "tsv") {
          const tsv = renderHeatmapTsv({
            columns,
            rows: exportRows,
            rowCounts: exportCounts,
          })
          downloadHeatmapTsv(tsv, heatmapExportFilename("tsv"))
          return
        }
        const svg = renderHeatmapSvg({
          columns,
          activeColumnCount: activeTerms.length,
          rows: exportRows,
          rowCounts: exportCounts,
          title: `Genes heatmap · ${roots.length} taxa at ${viewRank ?? "auto"} rank · ${unit}${truncatedNote}`,
        })
        const filename = heatmapExportFilename(format)
        if (format === "svg") {
          downloadHeatmapSvg(svg, filename)
          return
        }
        await downloadHeatmapPng(svg, filename)
      } finally {
        setExporting(false)
      }
    },
    [
      adapter,
      roots,
      columns,
      filter.excludeTerms,
      viewRank,
      unit,
      activeTerms.length,
      allVisible.length,
    ],
  )

  const empty = !loading && (!roots.length || !columns.length)

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {!loading && !empty ? (
        <GenesDistributionToolbar
          viewRank={viewRank}
          rankOptions={rankOptions}
          hideAutoRank={hideAutoRank}
          rankSelectDisabled={rankSelectDisabled}
          rankSelectDisabledReason={rankSelectDisabledReason}
          onViewRankChange={onViewRankChange}
          unit={unit}
          onUnitChange={onUnitChange}
          annotationTotal={overviewAnnotationTotal}
          speciesTotal={overviewSpeciesTotal}
          onExport={onExportHeatmap}
          exportDisabled={!roots.length || !columns.length}
          exporting={exporting}
        />
      ) : null}

      {!loading && !empty ? (
        <GenesSelectionBar
          selection={selection}
          annotationCount={selectionAnnotationCount}
          speciesCount={selectionSpeciesCount}
          nameMatch={selectionNameMatch}
          onNameMatchChange={onSelectionNameMatchChange}
          onShowOnly={onShowOnly}
          onClear={onClearSelection}
          onRestrictSearch={onRestrictSearch}
        />
      ) : null}

      {zeroHitCount > 0 && !loading && !empty ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span>
            {zeroHitCount.toLocaleString()} gene
            {zeroHitCount === 1 ? "" : "s"} had no hits
          </span>
          {onReviewZeroHits ? (
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={onReviewZeroHits}
            >
              Review
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-1.5 border-t border-border p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted/50" />
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-1 items-center justify-center border-t border-dashed border-border p-6">
          <div className="w-full max-w-sm px-6 py-8 text-center text-sm text-muted-foreground">
            {!roots.length
              ? "No eukaryotic lineages in these hits."
              : "No gene names to show. Add genes in the query bar."}
          </div>
        </div>
      ) : adapter ? (
        <GenesHeatmapTable
          columns={columns}
          activeColumnCount={activeTerms.length}
          rows={visible}
          rowCounts={rowCounts}
          expanded={expanded}
          selection={selection}
          unit={unit}
          singleGeneBars={columns.length === 1}
          onToggleExpand={onToggleExpand}
          onSelectRow={onSelectRow}
          onSelectCol={onSelectCol}
          onSelectCell={onSelectCell}
          remaining={remaining}
          onLoadMore={onLoadMore}
          taxonTotal={allVisible.length}
          className="min-h-0 flex-1"
        />
      ) : null}
    </div>
  )
}

/** Build a GenesFilter from a distribution selection for count previews. */
export function filterFromSelection(
  base: GenesFilter,
  selection: DistributionSelection,
  nameMatch: NameMatchMode,
): GenesFilter {
  if (selection.kind === "rows") {
    return makeFilter({
      ...base,
      includeTaxids: selection.rows,
      includeNames: [],
      includeCells: [],
      includeAnnotationIds: [],
      nameMatch,
      taxid: null,
      name: null,
    })
  }
  if (selection.kind === "cols") {
    return makeFilter({
      ...base,
      includeTaxids: [],
      includeNames: selection.cols,
      includeCells: [],
      includeAnnotationIds: [],
      nameMatch,
      taxid: null,
      name: null,
    })
  }
  if (selection.kind === "cells") {
    return makeFilter({
      ...base,
      includeTaxids: [],
      includeNames: [],
      includeCells: selection.cells.map((c) => ({
        taxid: c.taxid,
        gene: c.gene,
      })),
      includeAnnotationIds: [],
      nameMatch,
      taxid: null,
      name: null,
    })
  }
  return makeFilter({
    ...base,
    includeTaxids: [],
    includeNames: [],
    includeCells: [],
    includeAnnotationIds: [],
    taxid: null,
    name: null,
  })
}
