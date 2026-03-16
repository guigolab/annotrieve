"use client"

import { Checkbox } from "@/components/ui/checkbox"
import {
  getTreeGeneColors,
  getTreeTranscriptColors,
  getTreeBuscoColors,
} from "./taxonomy-tree-controls"
import type { GeneType, TranscriptType, BuscoType } from "@/lib/stores/taxonomy-gene-types"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { useUIStore } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"

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

export interface StackChartOptionsContentProps {
  /** Slightly smaller text and padding for compact strips (e.g. bottom bar) */
  compact?: boolean
  /** Optional slot rendered after the three sections (e.g. Show labels switch) */
  footerSlot?: React.ReactNode
}

export function StackChartOptionsContent({ compact, footerSlot }: StackChartOptionsContentProps) {
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

  const sectionGap = compact ? "mt-1" : "mt-1.5"
  const labelCls = compact ? "text-[11px]" : "text-xs"
  const padCls = compact ? "px-1.5 py-0.5" : "px-2 py-1"
  const headerCls = compact ? "py-1 px-1.5 text-[10px]" : "py-1.5 px-2 text-[11px]"

  return (
    <>
      <p
        className={cn(
          "font-medium uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-1",
          compact ? "text-[9px]" : "text-[10px]"
        )}
      >
        Stack chart by (one section active)
      </p>

      {/* Genes */}
      <div
        className={cn(
          "rounded-md border transition-colors",
          stackMode === "genes" ? "border-primary/50 bg-primary/5" : "border-transparent"
        )}
      >
        <button
          type="button"
          onClick={() => setStackMode("genes")}
          className={cn("w-full text-left font-medium text-foreground hover:bg-muted/60 rounded-t-md", headerCls)}
        >
          Genes
        </button>
        <div className={cn("space-y-0.5 pb-1.5 px-2", compact && "pb-1 px-1.5")}>
          {(["coding", "non_coding", "pseudogene"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-2 rounded-md cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                padCls
              )}
            >
              <Checkbox
                checked={hasGeneType(type)}
                onCheckedChange={() => toggleGeneType(type)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", compact && "w-2 h-2")} style={{ backgroundColor: geneColors[type] }} />
              <span className={labelCls}>{GENE_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Transcripts */}
      <div
        className={cn(
          "rounded-md border transition-colors",
          sectionGap,
          stackMode === "transcripts" ? "border-primary/50 bg-primary/5" : "border-transparent"
        )}
      >
        <button
          type="button"
          onClick={() => setStackMode("transcripts")}
          className={cn("w-full text-left font-medium text-foreground hover:bg-muted/60 rounded-t-md", headerCls)}
        >
          Transcripts
        </button>
        <div className={cn("space-y-0.5 pb-1.5 px-2", compact && "pb-1 px-1.5")}>
          {(["mRNA", "lncRNA", "tRNA", "miRNA"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-2 rounded-md cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                padCls
              )}
            >
              <Checkbox
                checked={hasTranscriptType(type)}
                onCheckedChange={() => toggleTranscriptType(type)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", compact && "w-2 h-2")} style={{ backgroundColor: transcriptColors[type] }} />
              <span className={labelCls}>{TRANSCRIPT_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* BUSCO */}
      <div
        className={cn(
          "rounded-md border transition-colors",
          sectionGap,
          stackMode === "busco" ? "border-primary/50 bg-primary/5" : "border-transparent"
        )}
      >
        <button
          type="button"
          onClick={() => setStackMode("busco")}
          className={cn("w-full text-left font-medium text-foreground hover:bg-muted/60 rounded-t-md", headerCls)}
        >
          BUSCO
        </button>
        <div className={cn("space-y-0.5 pb-1.5 px-2", compact && "pb-1 px-1.5")}>
          {(["single_copy", "duplicated", "fragmented", "missing"] as const).map((type) => (
            <label
              key={type}
              className={cn(
                "flex items-center gap-2 rounded-md cursor-pointer hover:bg-muted/80 transition-colors",
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
                padCls
              )}
            >
              <Checkbox
                checked={hasBuscoType(type)}
                onCheckedChange={() => toggleBuscoType(type)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span className={cn("w-2.5 h-2.5 rounded-sm shrink-0", compact && "w-2 h-2")} style={{ backgroundColor: buscoColors[type] }} />
              <span className={labelCls}>{BUSCO_TYPE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>

      {footerSlot != null && (
        <div className="pt-2 mt-2 border-t border-border/50">
          {footerSlot}
        </div>
      )}
    </>
  )
}
