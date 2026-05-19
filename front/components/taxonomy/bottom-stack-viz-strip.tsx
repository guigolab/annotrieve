"use client"

import React, { useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { GLASS_PANEL } from "./taxonomy-types"
import {
  getTreeGeneColors,
  getTreeTranscriptColors,
  getTreeBuscoColors,
} from "./taxonomy-tree-controls"
import type { GeneType, TranscriptType, BuscoType, StackMode } from "@/lib/stores/taxonomy-gene-types"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { useUIStore } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import type { LegendItem } from "./radial-tree-legend-card"

const STACK_MODE_OPTIONS: { value: StackMode; label: string }[] = [
  { value: "genes", label: "Genes" },
  { value: "transcripts", label: "Transcripts" },
  { value: "busco", label: "BUSCO" },
]

const GENE_TYPE_LABELS: Record<GeneType, string> = {
  coding: "Coding",
  non_coding: "Non-coding",
  pseudogene: "Pseudogene",
}

const TRANSCRIPT_TYPE_LABELS: Record<TranscriptType, string> = {
  mRNA: "mRNA",
  lncRNA: "lncRNA",
  tRNA: "tRNA",
  miRNA: "miRNA",
}

const BUSCO_TYPE_LABELS: Record<BuscoType, string> = {
  single_copy: "Single copy",
  duplicated: "Duplicated",
  fragmented: "Fragmented",
  missing: "Missing",
}

export interface BottomStackVizStripProps {
  /** When true, the strip is visible (e.g. when view is Tree or Outliers) */
  visible: boolean
  showLabels: boolean
  onShowLabelsChange: (show: boolean) => void
  /** Legend items to merge into the mobile strip (radial tree only) */
  legendItems?: LegendItem[]
  legendRootName?: string
  legendSelectedTaxid?: string | null
  onLegendItemClick?: (taxid: string) => void
}

/**
 * Compact bottom strip shown when the active view is the radial tree or stacked radial bar.
 * Displays a category select (Genes / Transcripts / BUSCO) and the related checkboxes inline.
 */
export function BottomStackVizStrip({
  visible,
  showLabels,
  onShowLabelsChange,
  legendItems,
  legendRootName,
  legendSelectedTaxid,
  onLegendItemClick,
}: BottomStackVizStripProps) {
  const [legendOpen, setLegendOpen] = useState(false)
  const isDark = useUIStore((s) => s.theme) === "dark"
  const geneColors = getTreeGeneColors(isDark)
  const transcriptColors = getTreeTranscriptColors(isDark)
  const buscoColors = getTreeBuscoColors(isDark)

  const {
    stackMode,
    setStackMode,
    hasGeneType,
    hasTranscriptType,
    hasBuscoType,
    toggleGeneType,
    toggleTranscriptType,
    toggleBuscoType,
  } = useTaxonomyGeneTypesStore()

  if (!visible) return null

  const hasMobileLegend = (legendItems?.length ?? 0) > 0

  const controls = (
    <>
      {/* Category select */}
      <Select value={stackMode} onValueChange={(v) => setStackMode(v as StackMode)}>
        <SelectTrigger
          className={cn(
            "h-7 w-[100px] text-[11px] font-medium border-border/80 bg-background/80",
            "focus:ring-2 focus:ring-ring focus:ring-offset-0"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STACK_MODE_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value} value={value} className="text-xs">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Divider */}
      <div className="w-px h-4 bg-border/60 shrink-0" aria-hidden />

      {/* Checkboxes for current category */}
      {stackMode === "genes" && (
        <>
          {(["coding", "non_coding", "pseudogene"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
              )}
              style={{ "--option-color": geneColors[type] } as React.CSSProperties}
            >
              <Checkbox
                checked={hasGeneType(type)}
                onCheckedChange={() => toggleGeneType(type)}
                onKeyDown={(e) => e.stopPropagation()}
                className="border-[var(--option-color)] data-[state=checked]:bg-[var(--option-color)] data-[state=checked]:border-[var(--option-color)] data-[state=checked]:text-white"
              />
              <span className="text-[11px] whitespace-nowrap">
                {GENE_TYPE_LABELS[type]}
              </span>
            </label>
          ))}
        </>
      )}
      {stackMode === "transcripts" && (
        <>
          {(["mRNA", "lncRNA", "tRNA", "miRNA"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
              )}
              style={{ "--option-color": transcriptColors[type] } as React.CSSProperties}
            >
              <Checkbox
                checked={hasTranscriptType(type)}
                onCheckedChange={() => toggleTranscriptType(type)}
                onKeyDown={(e) => e.stopPropagation()}
                className="border-[var(--option-color)] data-[state=checked]:bg-[var(--option-color)] data-[state=checked]:border-[var(--option-color)] data-[state=checked]:text-white"
              />
              <span className="text-[11px] whitespace-nowrap">
                {TRANSCRIPT_TYPE_LABELS[type]}
              </span>
            </label>
          ))}
        </>
      )}
      {stackMode === "busco" && (
        <>
          {(["single_copy", "duplicated", "fragmented", "missing"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
              )}
              style={{ "--option-color": buscoColors[type] } as React.CSSProperties}
            >
              <Checkbox
                checked={hasBuscoType(type)}
                onCheckedChange={() => toggleBuscoType(type)}
                onKeyDown={(e) => e.stopPropagation()}
                className="border-[var(--option-color)] data-[state=checked]:bg-[var(--option-color)] data-[state=checked]:border-[var(--option-color)] data-[state=checked]:text-white"
              />
              <span className="text-[11px] whitespace-nowrap">
                {BUSCO_TYPE_LABELS[type]}
              </span>
            </label>
          ))}
        </>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-border/60 shrink-0" aria-hidden />

      {/* Show labels */}
      <label
        className={cn(
          "flex items-center gap-2 rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted/80 transition-colors",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
        )}
      >
        <span className="text-[11px] whitespace-nowrap">Show labels</span>
        <Switch
          checked={showLabels}
          onCheckedChange={onShowLabelsChange}
          className="scale-75"
        />
      </label>
    </>
  )

  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-20",
        // Mobile: full-width, flush to bottom
        "bottom-0 left-0 right-0",
        // Desktop: centered pill floating above bottom
        "md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-fit"
      )}
      role="toolbar"
      aria-label="Stack chart options"
    >
      {/* ── Mobile unified bar: legend section (if any) + controls ── */}
      <div
        className={cn(
          "md:hidden",
          GLASS_PANEL,
          "rounded-none border-x-0 border-b-0 shadow-md flex flex-col"
        )}
      >
        {hasMobileLegend && (
          <div>
            <button
              type="button"
              onClick={() => setLegendOpen((v) => !v)}
              className="flex w-full items-center justify-between px-2 py-1.5"
              aria-expanded={legendOpen}
            >
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                Children of{" "}
                <span className="text-foreground/80">{legendRootName}</span>
              </span>
              <ChevronDown
                className={cn(
                  "ml-1 h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                  legendOpen && "rotate-180"
                )}
                aria-hidden
              />
            </button>
            {legendOpen && (
              <div className="flex items-center gap-1 overflow-x-auto flex-nowrap px-2 pb-1.5">
                {legendItems!.map((item) => (
                  <button
                    key={item.taxid}
                    type="button"
                    onClick={() => onLegendItemClick?.(item.taxid)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] whitespace-nowrap",
                      "hover:bg-muted/60 transition-colors",
                      legendSelectedTaxid === item.taxid &&
                        "ring-1 ring-inset ring-secondary/40 bg-secondary/5"
                    )}
                  >
                    <span
                      className="shrink-0 rounded-full"
                      style={{ width: 6, height: 6, backgroundColor: item.color }}
                      aria-hidden
                    />
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-border/40" />
          </div>
        )}
        {/* Controls row */}
        <div className="flex items-center gap-2 px-2 py-1.5 overflow-x-auto flex-nowrap">
          {controls}
        </div>
      </div>

      {/* ── Desktop floating pill: controls only (legend is handled by RadialTreeLegendCard) ── */}
      <div
        className={cn(
          "hidden md:flex md:flex-wrap md:items-center md:gap-2",
          GLASS_PANEL,
          "px-2 py-1.5 shadow-md",
          "md:rounded-md md:border md:overflow-visible"
        )}
      >
        {controls}
      </div>
    </div>
  )
}
