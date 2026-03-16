"use client"

import { Check } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { cn } from "@/lib/utils"

export const TREE_RANK_OPTIONS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species",
] as const
export type TreeRankOption = (typeof TREE_RANK_OPTIONS)[number] | "all"

export function getTreeGeneColors(isDark: boolean) {
  return {
    coding: isDark ? "#34d399" : "#10b981",
    non_coding: isDark ? "#fbbf24" : "#f59e0b",
    pseudogene: isDark ? "#818cf8" : "#6366f1",
  }
}

export function getTreeTranscriptColors(isDark: boolean) {
  return {
    mRNA: isDark ? "#34d399" : "#10b981",
    lncRNA: isDark ? "#f472b6" : "#ec4899",
    tRNA: isDark ? "#38bdf8" : "#0ea5e9",
    miRNA: isDark ? "#a78bfa" : "#8b5cf6",
  }
}

// Canonical BUSCO score colors (matches file-overview-dialog/busco-score-section.tsx)
export function getTreeBuscoColors(_isDark?: boolean) {
  return {
    single_copy: "#56A0D3",   // Complete (C) & single-copy (S)
    duplicated: "#1E88B4",   // Complete (C) & duplicated (D)
    fragmented: "#F4C63D",   // Fragmented (F)
    missing: "#D64545",      // Missing (M)
  }
}

interface TaxonomyTreeControlsProps {
  rootTaxid?: string | null
  selectedRank: TreeRankOption
  onRankChange: (rank: TreeRankOption) => void
  geneColors: ReturnType<typeof getTreeGeneColors>
  showLabels?: boolean
  onShowLabelsChange?: (show: boolean) => void
  /** When true, always show rank selector even when rootTaxid is set */
  forceShowRank?: boolean
  /** When false, hide "All ranks" option (e.g. for charts that require a specific rank) */
  showAllRanksOption?: boolean
}

export function TaxonomyTreeControls({
  rootTaxid,
  selectedRank,
  onRankChange,
  geneColors,
  showLabels,
  onShowLabelsChange,
  forceShowRank = false,
  showAllRanksOption = true,
}: TaxonomyTreeControlsProps) {
  const { toggleGeneType, hasGeneType } = useTaxonomyGeneTypesStore()
  const showRank = forceShowRank || !rootTaxid

  return (
    <div className="flex flex-wrap items-center gap-4">
      {showRank && (
        <div className="flex items-center gap-2">
          <Label htmlFor="rank-select" className="text-sm font-medium whitespace-nowrap">
            Filter by rank:
          </Label>
          <Select
            value={selectedRank}
            onValueChange={(v) => onRankChange(v as TreeRankOption)}
          >
            <SelectTrigger id="rank-select" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TREE_RANK_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground font-medium">Gene types:</span>
        <div className="flex items-center gap-4">
          {(["coding", "non_coding", "pseudogene"] as const).map((type) => {
            const color = geneColors[type]
            const checked = hasGeneType(type)
            const label =
              type === "non_coding" ? "Non-coding" : type.charAt(0).toUpperCase() + type.slice(1)
            return (
              <label
                key={type}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggleGeneType(type)}
                  className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                    checked ? "" : "border-muted-foreground/40 bg-transparent"
                  )}
                  style={
                    checked
                      ? { backgroundColor: color, borderColor: color }
                      : undefined
                  }
                >
                  {checked && <Check className="h-2.5 w-2.5 text-white" />}
                </button>
                <span>{label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {onShowLabelsChange !== undefined && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-labels"
            checked={showLabels ?? false}
            onCheckedChange={(c) => onShowLabelsChange(c === true)}
          />
          <Label htmlFor="show-labels" className="text-sm cursor-pointer">
            Show labels
          </Label>
        </div>
      )}
    </div>
  )
}
