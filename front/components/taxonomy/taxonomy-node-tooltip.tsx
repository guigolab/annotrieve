"use client"

import { useRef, useLayoutEffect, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { cn } from "@/lib/utils"

const VIEWPORT_PADDING = 24
const CURSOR_GAP = 14
const TOOLTIP_MAX_WIDTH = 280
/** Fraction of container height: pointer in top half → show below pointer; in bottom half → show above. */
const SHOW_ABOVE_THRESHOLD_RATIO = 0.5
/** When showing above pointer, place tooltip so its bottom is above the pointer (offset from pointer to tooltip bottom). */
const ABOVE_POINTER_OFFSET_PX = 12

const DEFAULT_GENE_COLORS = {
  coding: "#10b981",
  non_coding: "#f59e0b",
  pseudogene: "#6366f1",
} as const

const DEFAULT_TRANSCRIPT_COLORS = {
  mRNA: "#10b981",
  lncRNA: "#ec4899",
  tRNA: "#0ea5e9",
  miRNA: "#8b5cf6",
} as const

const DEFAULT_BUSCO_COLORS = {
  single_copy: "#56A0D3",
  duplicated: "#1E88B4",
  fragmented: "#F4C63D",
  missing: "#D64545",
} as const

export type FeatureCountCategory = "genes" | "transcripts" | "busco"

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
  /** Transcript type counts (mRNA, lncRNA, tRNA, miRNA) */
  transcriptCounts?: {
    mRNA: number
    lncRNA: number
    tRNA: number
    miRNA: number
  }
  transcriptColors?: {
    mRNA: string
    lncRNA: string
    tRNA: string
    miRNA: string
  }
  /** BUSCO means (single_copy, duplicated, fragmented, missing) */
  buscoCounts?: {
    single_copy: number
    duplicated: number
    fragmented: number
    missing: number
  }
  buscoColors?: {
    single_copy: string
    duplicated: string
    fragmented: string
    missing: string
  }
  /** Optional number formatter (e.g. for decimal gene counts); default is toLocaleString() */
  formatNumber?: (n: number) => string
}

export interface TaxonomyNodeTooltipProps {
  /** Position in viewport coordinates (e.g. event.clientX, event.clientY). Tooltip is portaled to body and clamped to viewport. */
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
    transcriptCounts,
    transcriptColors = DEFAULT_TRANSCRIPT_COLORS,
    buscoCounts,
    buscoColors = DEFAULT_BUSCO_COLORS,
    formatNumber = (n) => n.toLocaleString(),
  } = payload

  const ox = offset.x ?? 10
  const oy = offset.y ?? -10
  const tooltipRef = useRef<HTMLDivElement>(null)
  const adjustRef = useRef({ x: 0, y: 0 })

  const vh = typeof window !== "undefined" ? window.innerHeight : 768
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024
  /** True when pointer is in the bottom half of the viewport → show above; top half → show below. */
  const showAbovePointer = position.y >= vh * SHOW_ABOVE_THRESHOLD_RATIO
  const vertical: "above" | "below" = showAbovePointer ? "above" : "below"
  const horizontal: "left" | "right" =
    position.x + ox + TOOLTIP_MAX_WIDTH <= vw - VIEWPORT_PADDING
      ? "right"
      : "left"

  // Apply viewport clamp via ref (no state) to avoid tremble from re-renders on every mouse move
  useLayoutEffect(() => {
    const el = tooltipRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let dx = 0
    let dy = 0
    if (rect.right > vw - VIEWPORT_PADDING) dx = vw - VIEWPORT_PADDING - rect.right
    if (rect.bottom > vh - VIEWPORT_PADDING) dy = vh - VIEWPORT_PADDING - rect.bottom
    if (rect.left < VIEWPORT_PADDING) dx = VIEWPORT_PADDING - rect.left
    if (rect.top < VIEWPORT_PADDING) dy = VIEWPORT_PADDING - rect.top
    adjustRef.current = { x: dx, y: dy }
    el.style.transform = `translate(${dx}px, ${dy}px)`
  }, [position.x, position.y, ox, oy, vertical, horizontal])

  const geneTotal =
    geneCounts != null
      ? geneCounts.coding + geneCounts.non_coding + geneCounts.pseudogene
      : 0
  const transcriptTotal =
    transcriptCounts != null
      ? transcriptCounts.mRNA + transcriptCounts.lncRNA + transcriptCounts.tRNA + transcriptCounts.miRNA
      : 0
  const buscoTotal =
    buscoCounts != null
      ? buscoCounts.single_copy + buscoCounts.duplicated + buscoCounts.fragmented + buscoCounts.missing
      : 0
  const hasRecordCounts =
    organismsCount != null || assembliesCount != null || annotationsCount != null
  const hasGeneCounts = geneCounts != null && geneTotal > 0
  const hasTranscriptCounts = transcriptCounts != null && transcriptTotal > 0
  const hasBuscoCounts = buscoCounts != null && buscoTotal > 0
  const hasAnyFeatureCounts = hasGeneCounts || hasTranscriptCounts || hasBuscoCounts
  const featureCategories: FeatureCountCategory[] = [
    ...(hasGeneCounts ? (["genes"] as const) : []),
    ...(hasTranscriptCounts ? (["transcripts"] as const) : []),
    ...(hasBuscoCounts ? (["busco"] as const) : []),
  ]
  const stackMode = useTaxonomyGeneTypesStore((s) => s.stackMode)
  const setStackMode = useTaxonomyGeneTypesStore((s) => s.setStackMode)
  /** Follow bottom-stack-viz-strip select; fallback to first available category if current node has no data for it. */
  const featureCategory: FeatureCountCategory =
    featureCategories.includes(stackMode) ? stackMode : (featureCategories[0] ?? "genes")

  const left =
    horizontal === "right" ? position.x + ox : position.x - TOOLTIP_MAX_WIDTH - ox
  // When above: pin bottom edge above pointer so tooltip is never cut off at viewport bottom
  const positionStyle: CSSProperties =
    vertical === "above"
      ? { left: `${left}px`, bottom: `${vh - position.y + ABOVE_POINTER_OFFSET_PX}px` }
      : { left: `${left}px`, top: `${position.y + CURSOR_GAP}px` }

  const tooltipContent = (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={cn("fixed z-[100] pointer-events-none max-w-[min(280px,90vw)]", className)}
      style={positionStyle}
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

        {/* Feature counts: one of Genes | Transcripts | BUSCO at a time to avoid clutter */}
        {hasAnyFeatureCounts && (
          <div className="mt-2.5 pt-2 border-t border-border/50 space-y-1.5">
            {featureCategories.length > 1 ? (
              <div className="flex gap-0.5">
                {featureCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setStackMode(cat)
                    }}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors",
                      featureCategory === cat
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {cat === "genes" ? "Genes" : cat === "transcripts" ? "Transcripts" : "BUSCO"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                {featureCategory === "genes" ? "Gene counts" : featureCategory === "transcripts" ? "Transcript counts" : "BUSCO"}
              </div>
            )}
            {featureCategory === "genes" && hasGeneCounts && geneCounts && (
              <>
                <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                  {geneCounts.coding > 0 && (
                    <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.coding / geneTotal) * 100}%`, backgroundColor: geneColors.coding }} title={`Coding: ${formatNumber(geneCounts.coding)}`} />
                  )}
                  {geneCounts.non_coding > 0 && (
                    <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.non_coding / geneTotal) * 100}%`, backgroundColor: geneColors.non_coding }} title={`Non-coding: ${formatNumber(geneCounts.non_coding)}`} />
                  )}
                  {geneCounts.pseudogene > 0 && (
                    <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.pseudogene / geneTotal) * 100}%`, backgroundColor: geneColors.pseudogene }} title={`Pseudogene: ${formatNumber(geneCounts.pseudogene)}`} />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.coding }} />Coding <span>{formatNumber(geneCounts.coding)}</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.non_coding }} />Non-cod <span>{formatNumber(geneCounts.non_coding)}</span></span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.pseudogene }} />Pseudo <span>{formatNumber(geneCounts.pseudogene)}</span></span>
                </div>
              </>
            )}
            {featureCategory === "transcripts" && hasTranscriptCounts && transcriptCounts && (
              <>
                <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                  {transcriptCounts.mRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.mRNA / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.mRNA }} />}
                  {transcriptCounts.lncRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.lncRNA / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.lncRNA }} />}
                  {transcriptCounts.tRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.tRNA / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.tRNA }} />}
                  {transcriptCounts.miRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.miRNA / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.miRNA }} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {transcriptCounts.mRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.mRNA }} />mRNA <span>{formatNumber(transcriptCounts.mRNA)}</span></span>}
                  {transcriptCounts.lncRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.lncRNA }} />lncRNA <span>{formatNumber(transcriptCounts.lncRNA)}</span></span>}
                  {transcriptCounts.tRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.tRNA }} />tRNA <span>{formatNumber(transcriptCounts.tRNA)}</span></span>}
                  {transcriptCounts.miRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.miRNA }} />miRNA <span>{formatNumber(transcriptCounts.miRNA)}</span></span>}
                </div>
              </>
            )}
            {featureCategory === "busco" && hasBuscoCounts && buscoCounts && (
              <>
                <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                  {buscoCounts.single_copy > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.single_copy / buscoTotal) * 100}%`, backgroundColor: buscoColors.single_copy }} />}
                  {buscoCounts.duplicated > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.duplicated / buscoTotal) * 100}%`, backgroundColor: buscoColors.duplicated }} />}
                  {buscoCounts.fragmented > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.fragmented / buscoTotal) * 100}%`, backgroundColor: buscoColors.fragmented }} />}
                  {buscoCounts.missing > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.missing / buscoTotal) * 100}%`, backgroundColor: buscoColors.missing }} />}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                  {buscoCounts.single_copy > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.single_copy }} />C+S <span>{formatNumber(buscoCounts.single_copy)}</span></span>}
                  {buscoCounts.duplicated > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.duplicated }} />C+D <span>{formatNumber(buscoCounts.duplicated)}</span></span>}
                  {buscoCounts.fragmented > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.fragmented }} />F <span>{formatNumber(buscoCounts.fragmented)}</span></span>}
                  {buscoCounts.missing > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.missing }} />M <span>{formatNumber(buscoCounts.missing)}</span></span>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(tooltipContent, document.body)
}
