"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

import { GenesPagination } from "@/components/genes/genes-pagination"
import { Button } from "@/components/ui/button"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import { sourceColor, sourceLabel } from "@/lib/genes/hits"
import { speciesForTaxid } from "@/lib/genes/species"
import { useVirtualWindow } from "@/lib/genes/virtual"

const LIST_ROW_H = 52
const PAGE_SIZE = 50

interface GenesAnnotationListProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  taxonIndex: Map<string, FlatTreeNode>
  loading?: boolean
  onClearCoverage: () => void
  onOpenAnnotation: (opts: {
    annotationId: string
    species: string
    source: number
  }) => void
}

export function GenesAnnotationList({
  adapter,
  filter,
  taxonIndex,
  loading,
  onClearCoverage,
  onOpenAnnotation,
}: GenesAnnotationListProps) {
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [listOffset, setListOffset] = useState(0)

  const page = useMemo(() => {
    if (!adapter) {
      return {
        total: 0,
        limit: PAGE_SIZE,
        offset: 0,
        results: [],
        matched: [] as number[],
        termCount: 0,
      }
    }
    return adapter.annotations(filter, {
      limit: PAGE_SIZE,
      offset: listOffset,
    })
  }, [adapter, filter, listOffset])

  useEffect(() => {
    setListOffset(0)
  }, [filter])

  const win = useVirtualWindow(listScrollRef, page.results.length, LIST_ROW_H, 8)
  const termCount = page.termCount
  const sources = adapter?.hits.sources

  const coverageActive =
    filter.minMatched > 1 ||
    (termCount > 0 && filter.maxMatched < termCount)

  return (
    <>
      {loading && (
        <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}
      {!loading && page.total === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center w-full space-y-3">
            <p className="text-xs text-muted-foreground">
              No annotations match these filters
            </p>
            {coverageActive && (
              <Button
                type="button"
                variant="outline"
                className="h-7 text-xs"
                onClick={onClearCoverage}
              >
                Clear coverage filter
              </Button>
            )}
          </div>
        </div>
      )}
      {!loading && page.total > 0 && (
        <>
          <div ref={listScrollRef} className="flex-1 min-h-0 overflow-auto">
            <div className="relative" style={{ height: win.totalHeight }}>
              {win.visibleIndexes.map((index) => {
                const row = page.results[index]
                if (!row) return null
                const species = speciesForTaxid(row.taxid, taxonIndex)
                const k = page.matched[index] ?? 0
                const pct =
                  termCount > 0 ? Math.round((k / termCount) * 100) : 0
                const color = sourceColor(row.source)
                return (
                  <button
                    key={row.annotationId}
                    type="button"
                    className="absolute left-0 right-0 flex items-center gap-2 px-3 border-b border-border/40 text-left hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
                    style={{ top: index * LIST_ROW_H, height: LIST_ROW_H }}
                    onClick={() =>
                      onOpenAnnotation({
                        annotationId: row.annotationId,
                        species: species.label,
                        source: row.source,
                      })
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                      title={sourceLabel(row.source, sources)}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="truncate text-sm italic font-medium">
                        {species.label}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {row.annotationId}
                        </span>
                        <span className="ml-auto flex items-center gap-1.5 shrink-0">
                          <span className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                            <span
                              className="block h-full rounded-full bg-primary/70"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {k}/{termCount}
                          </span>
                        </span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          {page.total > PAGE_SIZE && (
            <div className="shrink-0 border-t border-border/60 bg-muted/20 px-2 py-1.5">
              <GenesPagination
                total={page.total}
                limit={PAGE_SIZE}
                offset={listOffset}
                onOffsetChange={setListOffset}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}

export { PAGE_SIZE as ANNOTATION_LIST_PAGE_SIZE }
