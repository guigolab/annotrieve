"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { GenesHeatmapCanvas } from "@/components/genes/genes-heatmap-canvas"
import {
  GENES_FALLBACK_CELL_W,
  GENES_FALLBACK_HEADER_H,
  GENES_FALLBACK_ROW_H,
  GENES_LEGEND_H,
  GENES_TREE_W,
} from "@/components/genes/genes-overview-constants"
import type { GenesRankOption } from "@/components/genes/genes-rank-select"
import { GenesTaxonTree } from "@/components/genes/genes-taxon-tree"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import {
  computeHeatmapLayout,
  type HeatmapLayout,
} from "@/lib/genes/heatmap"
import { flattenHitTree, type HitTree } from "@/lib/genes/tree"
import { useVirtualWindow } from "@/lib/genes/virtual"
import { cn } from "@/lib/utils"

const FALLBACK_LAYOUT: HeatmapLayout = {
  cellW: GENES_FALLBACK_CELL_W,
  rowH: GENES_FALLBACK_ROW_H,
  headerH: GENES_FALLBACK_HEADER_H,
  contentW: GENES_FALLBACK_CELL_W,
  contentH: GENES_FALLBACK_ROW_H,
  availableHeight: 0,
}

interface GenesOverviewProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  tree: HitTree | null
  expanded: Set<string>
  selectedTaxon: string | null
  selectedName: string | null
  loading?: boolean
  onToggleExpand: (id: string) => void
  onSelectTaxon: (id: string | null) => void
  onSelectName: (name: string | null) => void
  onSelectCell: (taxonId: string, name: string) => void
  viewRank: string | null
  rankOptions: GenesRankOption[]
  hideAutoRank?: boolean
  rankSelectDisabled?: boolean
  rankSelectDisabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  className?: string
}

export function GenesOverview({
  adapter,
  filter,
  tree,
  expanded,
  selectedTaxon,
  selectedName,
  loading,
  onToggleExpand,
  onSelectTaxon,
  onSelectName,
  onSelectCell,
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  className,
}: GenesOverviewProps) {
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [focus, setFocus] = useState<{ row: number; col: number }>({
    row: 0,
    col: 0,
  })
  const [liveMsg, setLiveMsg] = useState("")
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [columnSize, setColumnSize] = useState({ w: 0, h: 0 })

  const gridScrollRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const heatmapColumnRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const summaryId = "genes-overview-summary"

  const terms = useMemo(
    () => (adapter ? adapter.activeTerms(filter.excludeTerms) : []),
    [adapter, filter.excludeTerms],
  )

  const roots = tree?.roots ?? []
  const visible = useMemo(
    () => flattenHitTree(roots, expanded),
    [roots, expanded],
  )

  const layout = useMemo(() => {
    if (columnSize.w <= 0 || columnSize.h <= 0) return FALLBACK_LAYOUT
    return computeHeatmapLayout({
      columnWidth: columnSize.w,
      columnHeight: columnSize.h,
      cols: Math.max(1, terms.length),
      rows: Math.max(1, visible.length),
      legendH: GENES_LEGEND_H,
    })
  }, [columnSize, terms.length, visible.length])

  const win = useVirtualWindow(
    gridScrollRef,
    visible.length,
    layout.rowH,
    8,
  )

  useEffect(() => {
    const el = heatmapColumnRef.current
    if (!el) return
    const measure = () => {
      setColumnSize({ w: el.clientWidth, h: el.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, roots.length, terms.length])

  const onGridScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    const top = gridScrollRef.current?.scrollTop ?? 0
    const left = gridScrollRef.current?.scrollLeft ?? 0
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = left
    setScrollTop(top)
    setScrollLeft(left)
    syncing.current = false
  }, [])

  const onHeaderScroll = useCallback(() => {
    if (syncing.current) return
    syncing.current = true
    const left = headerScrollRef.current?.scrollLeft ?? 0
    if (gridScrollRef.current) gridScrollRef.current.scrollLeft = left
    setScrollLeft(left)
    syncing.current = false
  }, [])

  const onTreeWheel = useCallback((deltaY: number) => {
    const el = gridScrollRef.current
    if (!el) return
    el.scrollTop += deltaY
  }, [])

  const empty = !loading && (!roots.length || !terms.length)

  if (loading) {
    return (
      <section
        className={cn(
          "flex flex-col min-h-0 overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm",
          className,
        )}
      >
        <div className="border-b border-border/60 px-3 py-2 space-y-1">
          <div className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-40 rounded bg-muted/70 animate-pulse" />
        </div>
        <div className="p-3 space-y-1.5 flex-1">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-4 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      </section>
    )
  }

  if (empty) {
    return (
      <section
        className={cn(
          "flex items-center justify-center p-4 min-h-[280px] rounded-xl border border-border bg-card/50 shadow-sm",
          className,
        )}
      >
        <div className="rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-sm text-muted-foreground text-center max-w-sm w-full">
          {!roots.length
            ? "No eukaryotic lineages in these hits."
            : "No names to show. Review names and select at least one."}
        </div>
      </section>
    )
  }

  if (!adapter) return null

  return (
    <section
      className={cn(
        "flex min-h-0 overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm",
        className,
      )}
    >
      <p id={summaryId} className="sr-only">
        Heatmap of {terms.length} gene names across {visible.length} taxa.
        Arrow keys move the selection; Enter filters annotations to that cell.
      </p>

      <GenesTaxonTree
        visible={visible}
        visibleIndexes={win.visibleIndexes}
        totalHeight={win.totalHeight}
        scrollTop={scrollTop}
        onWheelScroll={onTreeWheel}
        adapter={adapter}
        filter={filter}
        expanded={expanded}
        selectedTaxon={selectedTaxon}
        hoverRow={hover?.row ?? null}
        headerHeight={layout.headerH}
        rowHeight={layout.rowH}
        onToggleExpand={onToggleExpand}
        onSelectTaxon={onSelectTaxon}
        viewRank={viewRank}
        rankOptions={rankOptions}
        hideAutoRank={hideAutoRank}
        rankSelectDisabled={rankSelectDisabled}
        rankSelectDisabledReason={rankSelectDisabledReason}
        onViewRankChange={onViewRankChange}
        width={GENES_TREE_W}
      />

      <GenesHeatmapCanvas
        adapter={adapter}
        filter={filter}
        terms={terms}
        visible={visible}
        visibleIndexes={win.visibleIndexes}
        layout={layout}
        selectedTaxon={selectedTaxon}
        selectedName={selectedName}
        hover={hover}
        focus={focus}
        onHover={setHover}
        onFocus={setFocus}
        onSelectName={onSelectName}
        onSelectCell={onSelectCell}
        onAnnounce={setLiveMsg}
        columnRef={heatmapColumnRef}
        gridScrollRef={gridScrollRef}
        headerScrollRef={headerScrollRef}
        scrollLeft={scrollLeft}
        onGridScroll={onGridScroll}
        onHeaderScroll={onHeaderScroll}
        summaryId={summaryId}
      />

      <span className="sr-only" aria-live="polite">
        {liveMsg}
      </span>
    </section>
  )
}
