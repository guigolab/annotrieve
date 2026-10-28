"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  GenesHeatmapTable,
  type HeatmapNameColumn,
} from "@/components/genes/genes-heatmap-table"
import { GENES_TREE_PAGE_SIZE } from "@/components/genes/genes-overview-constants"
import type { GenesRankOption } from "@/components/genes/genes-rank-select"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import { flattenHitTree, type HitTree } from "@/lib/genes/tree"
import { cn } from "@/lib/utils"

const EMPTY_ROOTS: HitTree["roots"] = []

interface GenesOverviewSectionProps {
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
  onIncludeName: (id: string) => void
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
  selectedTaxon,
  selectedName,
  loading,
  onToggleExpand,
  onSelectTaxon,
  onSelectName,
  onSelectCell,
  onIncludeName,
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  className,
}: GenesOverviewSectionProps) {
  const [visibleLimit, setVisibleLimit] = useState(GENES_TREE_PAGE_SIZE)
  const treeKeyRef = useRef("")

  // Active columns ignore list-only filters; excluded/empty are appended after.
  const activeTerms = useMemo(
    () => (adapter ? adapter.activeTerms(filter.excludeTerms) : []),
    [adapter, filter.excludeTerms],
  )

  const columns = useMemo((): HeatmapNameColumn[] => {
    if (!adapter) return []
    const hitTerms = adapter.hits.terms ?? []
    const active: HeatmapNameColumn[] = activeTerms.map((t) => ({
      name: t.name,
      id: t.id,
      count: t.count,
      kind: "active",
    }))
    const activeIds = new Set(active.map((c) => c.id))

    const excluded: HeatmapNameColumn[] = []
    const empty: HeatmapNameColumn[] = []
    const seenExcluded = new Set<string>()
    const seenEmpty = new Set<string>()

    for (const term of hitTerms) {
      const id = term.name.toLowerCase()
      if (term.n_hits <= 0) {
        if (seenEmpty.has(id)) continue
        seenEmpty.add(id)
        empty.push({
          name: term.name || term.input,
          id,
          count: 0,
          kind: "empty",
        })
        continue
      }
      if (filter.excludeTerms.has(id) && !activeIds.has(id)) {
        if (seenExcluded.has(id)) continue
        seenExcluded.add(id)
        excluded.push({
          name: term.name,
          id,
          count: term.n_hits,
          kind: "excluded",
        })
      }
    }

    return [...active, ...excluded, ...empty]
  }, [adapter, activeTerms, filter.excludeTerms])

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
    )
  }, [adapter, filter.excludeTerms, visible, viewRank])

  const onLoadMore = useCallback(() => {
    setVisibleLimit((n) => n + GENES_TREE_PAGE_SIZE)
  }, [])

  const empty = !loading && (!roots.length || !columns.length)

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {loading ? (
        <div className="space-y-1.5 rounded-xl border border-border bg-card p-4 shadow-sm">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-4 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : empty ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-6">
          <div className="w-full max-w-sm px-6 py-8 text-center text-sm text-muted-foreground">
            {!roots.length
              ? "No eukaryotic lineages in these hits."
              : "No names to show. Review names and select at least one."}
          </div>
        </div>
      ) : adapter ? (
        <GenesHeatmapTable
          columns={columns}
          activeColumnCount={activeTerms.length}
          rows={visible}
          rowCounts={rowCounts}
          expanded={expanded}
          selectedTaxon={selectedTaxon}
          selectedName={selectedName}
          onToggleExpand={onToggleExpand}
          onSelectTaxon={onSelectTaxon}
          onSelectName={onSelectName}
          onSelectCell={onSelectCell}
          onIncludeName={onIncludeName}
          remaining={remaining}
          onLoadMore={onLoadMore}
          taxonTotal={allVisible.length}
          viewRank={viewRank}
          rankOptions={rankOptions}
          hideAutoRank={hideAutoRank}
          rankSelectDisabled={rankSelectDisabled}
          rankSelectDisabledReason={rankSelectDisabledReason}
          onViewRankChange={onViewRankChange}
          className="min-h-0 flex-1"
        />
      ) : null}
    </div>
  )
}
