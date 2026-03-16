"use client"

import React from "react"
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
}

/**
 * Compact bottom strip shown when the active view is the radial tree or stacked radial bar.
 * Displays a category select (Genes / Transcripts / BUSCO) and the related checkboxes inline.
 */
export function BottomStackVizStrip({ visible, showLabels, onShowLabelsChange }: BottomStackVizStripProps) {
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

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
      role="toolbar"
      aria-label="Stack chart options"
    >
      <div
        className={cn(
          GLASS_PANEL,
          "px-2 py-1.5 rounded-md shadow-md flex flex-wrap items-center gap-2"
        )}
      >
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
      </div>
    </div>
  )
}
