"use client"

import { cn } from "@/lib/utils"

const DEFAULT_GENE_COLORS = {
  coding: "#10b981",
  non_coding: "#f59e0b",
  pseudogene: "#6366f1",
} as const

export interface TaxonomyNodeTooltipPayload {
  /** Taxon name (scientific name or display label) */
  title: string
  /** Rank shown in header at far right (e.g. "species", "genus") */
  rank?: string
  organismsCount?: number
  assembliesCount?: number
  annotationsCount?: number
  /** Gene type breakdown; when set, shows mini stacked bar + legend */
  geneCounts?: {
    coding: number
    non_coding: number
    pseudogene: number
  }
  /** Theme-aware colors for gene segments; defaults to DEFAULT_GENE_COLORS */
  geneColors?: {
    coding: string
    non_coding: string
    pseudogene: string
  }
  /** Optional number formatter (e.g. for decimal gene counts); default is toLocaleString() */
  formatNumber?: (n: number) => string
}

export interface TaxonomyNodeTooltipProps {
  /** Position in container coordinates (e.g. mouse or node position) */
  position: { x: number; y: number }
  /** Offset from position (default: 10px right, 10px up) */
  offset?: { x?: number; y?: number }
  payload: TaxonomyNodeTooltipPayload
  className?: string
}

export function TaxonomyNodeTooltip({
  position,
  offset = { x: 10, y: -10 },
  payload,
  className,
}: TaxonomyNodeTooltipProps) {
  const {
    title,
    rank,
    organismsCount,
    assembliesCount,
    annotationsCount,
    geneCounts,
    geneColors = DEFAULT_GENE_COLORS,
    formatNumber = (n) => n.toLocaleString(),
  } = payload

  const ox = offset.x ?? 10
  const oy = offset.y ?? -10
  const geneTotal =
    geneCounts != null
      ? geneCounts.coding + geneCounts.non_coding + geneCounts.pseudogene
      : 0
  const hasRecordCounts =
    organismsCount != null || assembliesCount != null || annotationsCount != null
  const hasGeneCounts = geneCounts != null && geneTotal > 0

  return (
    <div
      role="tooltip"
      className={cn("absolute z-50 pointer-events-none max-w-[min(280px,90vw)]", className)}
      style={{
        left: `${position.x + ox}px`,
        top: `${position.y + oy}px`,
      }}
    >
      <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm animate-in fade-in-0 duration-150">
        {/* Header: name + rank */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-foreground truncate min-w-0" title={title}>
            {title}
          </span>
          {rank != null && (
            <span className="text-xs text-muted-foreground capitalize shrink-0">
              {rank}
            </span>
          )}
        </div>

        {/* Record counts */}
        {hasRecordCounts && (
          <div className="mt-2.5 pt-2 border-t border-border/50 space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
              Record counts
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 tabular-nums">
              <div className="flex justify-between gap-4">
                <span>Annotations</span>
                <span>{(annotationsCount ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Assemblies</span>
                <span>{(assembliesCount ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Organisms</span>
                <span>{(organismsCount ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Gene counts */}
        {hasGeneCounts && geneCounts && (
          <div className="mt-2.5 pt-2 border-t border-border/50 space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
              Gene counts
            </div>
            <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
              {geneCounts.coding > 0 && (
                <div
                  className="h-full min-w-[2px] transition-colors"
                  style={{
                    width: `${(geneCounts.coding / geneTotal) * 100}%`,
                    backgroundColor: geneColors.coding,
                  }}
                  title={`Coding: ${geneCounts.coding.toLocaleString()}`}
                />
              )}
              {geneCounts.non_coding > 0 && (
                <div
                  className="h-full min-w-[2px] transition-colors"
                  style={{
                    width: `${(geneCounts.non_coding / geneTotal) * 100}%`,
                    backgroundColor: geneColors.non_coding,
                  }}
                  title={`Non-coding: ${geneCounts.non_coding.toLocaleString()}`}
                />
              )}
              {geneCounts.pseudogene > 0 && (
                <div
                  className="h-full min-w-[2px] transition-colors"
                  style={{
                    width: `${(geneCounts.pseudogene / geneTotal) * 100}%`,
                    backgroundColor: geneColors.pseudogene,
                  }}
                  title={`Pseudogene: ${geneCounts.pseudogene.toLocaleString()}`}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.coding }} />
                <span>Coding</span>
                <span>{formatNumber(geneCounts.coding)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.non_coding }} />
                <span>Non-cod</span>
                <span>{formatNumber(geneCounts.non_coding)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.pseudogene }} />
                <span>Pseudo</span>
                <span>{formatNumber(geneCounts.pseudogene)}</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
