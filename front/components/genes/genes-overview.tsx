"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Dna } from "lucide-react"

import { GenesDistributionToolbar } from "@/components/genes/genes-distribution-toolbar"
import {
  GenesHeatmapTable,
  type HeatmapNameColumn,
} from "@/components/genes/genes-heatmap-table"
import { GENES_TREE_PAGE_SIZE } from "@/components/genes/genes-overview-constants"
import type { GenesRankOption } from "@/components/genes/genes-rank-select"
import { Card } from "@/components/ui/card"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import {
  downloadHeatmapPng,
  downloadHeatmapSvg,
  downloadHeatmapTsv,
  heatmapExportFilename,
  renderHeatmapSvg,
  renderHeatmapTsv,
  type HeatmapExportFormat,
} from "@/lib/genes/heatmap-export"
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
  unit: CountUnit
  onUnitChange: (unit: CountUnit) => void
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
  unit,
  onUnitChange,
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
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
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
          onExport={onExportHeatmap}
          exportDisabled={!roots.length || !columns.length}
          exporting={exporting}
          zeroHitCount={zeroHitCount}
          onReviewZeroHits={onReviewZeroHits}
        />
      ) : null}

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-sm border-2 border-dashed p-8 text-center">
            <Dna className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {!roots.length
                ? "No eukaryotic lineages in these hits."
                : "No gene names to show."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {!roots.length
                ? "Try broadening the taxonomic scope."
                : "Add genes in the query bar."}
            </p>
          </Card>
        </div>
      ) : adapter ? (
        <GenesHeatmapTable
          columns={columns}
          activeColumnCount={activeTerms.length}
          rows={visible}
          rowCounts={rowCounts}
          expanded={expanded}
          unit={unit}
          singleGeneBars={columns.length === 1}
          onToggleExpand={onToggleExpand}
          remaining={remaining}
          onLoadMore={onLoadMore}
          className="min-h-0 flex-1 border-0"
        />
      ) : null}
    </div>
  )
}
