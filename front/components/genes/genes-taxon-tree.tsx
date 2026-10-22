"use client"

import { useEffect, useRef } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import {
  GenesRankSelect,
  type GenesRankOption,
} from "@/components/genes/genes-rank-select"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import type { FlatHitTreeRow } from "@/lib/genes/tree"
import { cn } from "@/lib/utils"

const INDENT_PX = 12

interface GenesTaxonTreeProps {
  visible: FlatHitTreeRow[]
  visibleIndexes: number[]
  totalHeight: number
  scrollTop: number
  onWheelScroll: (deltaY: number) => void
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  expanded: Set<string>
  selectedTaxon: string | null
  hoverRow: number | null
  headerHeight: number
  rowHeight: number
  onToggleExpand: (id: string) => void
  onSelectTaxon: (id: string | null) => void
  viewRank: string | null
  rankOptions: GenesRankOption[]
  hideAutoRank?: boolean
  rankSelectDisabled?: boolean
  rankSelectDisabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  width?: number
}

export function GenesTaxonTree({
  visible,
  visibleIndexes,
  totalHeight,
  scrollTop,
  onWheelScroll,
  adapter,
  filter,
  expanded,
  selectedTaxon,
  hoverRow,
  headerHeight,
  rowHeight,
  onToggleExpand,
  onSelectTaxon,
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  width = 240,
}: GenesTaxonTreeProps) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      onWheelScroll(e.deltaY)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [onWheelScroll])

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden border-r border-border/60"
      style={{ width }}
    >
      <header
        className="shrink-0 flex items-end px-3"
        style={{ height: headerHeight }}
      >
        <div className="pb-2 min-w-0 w-full space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Taxonomy
          </p>
          <GenesRankSelect
            viewRank={viewRank}
            options={rankOptions}
            hideAuto={hideAutoRank}
            disabled={rankSelectDisabled}
            disabledReason={rankSelectDisabledReason}
            onViewRankChange={onViewRankChange}
          />
        </div>
      </header>

      <div
        ref={bodyRef}
        className="flex-1 min-h-0 overflow-hidden border-t border-border/60 px-2"
      >
        <div
          className="relative will-change-transform"
          style={{
            height: totalHeight,
            transform: `translateY(${-scrollTop}px)`,
          }}
        >
          {visibleIndexes.map((index) => {
            const item = visible[index]
            if (!item) return null
            const { node, depth, path } = item
            const hasKids = node.children.length > 0
            const open = expanded.has(node.id)
            const counts = adapter?.nodeCounts(filter, node.id)
            const selected = selectedTaxon === node.id
            const indent = depth * INDENT_PX
            return (
              <div
                key={`${node.id}-${depth}`}
                className={cn(
                  "absolute left-0 right-0 flex items-center gap-1.5 px-2 rounded-md text-xs transition-colors",
                  selected && "bg-primary/10",
                  hoverRow === index && !selected && "bg-muted/50",
                  !selected && "hover:bg-muted/50",
                )}
                style={{
                  top: index * rowHeight,
                  height: rowHeight,
                  paddingLeft: `${indent + 4}px`,
                }}
                title={path.join(" › ")}
              >
                {hasKids ? (
                  <button
                    type="button"
                    className="h-4 w-4 flex items-center justify-center shrink-0 hover:bg-muted/80 rounded"
                    aria-label={
                      open
                        ? `Collapse ${node.label}`
                        : `Expand ${node.label}`
                    }
                    aria-expanded={open}
                    onClick={() => onToggleExpand(node.id)}
                  >
                    {open ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 flex items-center gap-1 text-left truncate text-xs hover:underline",
                    selected && "font-medium",
                  )}
                  onClick={() => onSelectTaxon(node.id)}
                >
                  <span className="min-w-0 truncate">{node.label}</span>
                </button>
                <span className="ml-auto shrink-0 text-[10px] font-mono text-muted-foreground pl-2">
                  {(counts?.n ?? node.count).toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
