"use client"

import { Download } from "lucide-react"

import {
  GenesRankSelect,
  type GenesRankOption,
} from "@/components/genes/genes-rank-select"
import { GenesSegmentedControl } from "@/components/genes/genes-segmented-control"
import { GenesViewToolbar } from "@/components/genes/genes-view-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { HeatmapExportFormat } from "@/lib/genes/heatmap-export"
import type { CountUnit } from "@/lib/genes/view"
import { cn } from "@/lib/utils"

interface GenesDistributionToolbarProps {
  viewRank: string | null
  rankOptions: GenesRankOption[]
  hideAutoRank?: boolean
  rankSelectDisabled?: boolean
  rankSelectDisabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  unit: CountUnit
  onUnitChange: (unit: CountUnit) => void
  onExport: (format: HeatmapExportFormat) => void | Promise<void>
  exportDisabled?: boolean
  exporting?: boolean
  zeroHitCount?: number
  onReviewZeroHits?: () => void
  className?: string
}

export function GenesDistributionToolbar({
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  unit,
  onUnitChange,
  onExport,
  exportDisabled,
  exporting,
  zeroHitCount = 0,
  onReviewZeroHits,
  className,
}: GenesDistributionToolbarProps) {
  return (
    <GenesViewToolbar className={cn(className)}>
      <GenesRankSelect
        viewRank={viewRank}
        options={rankOptions}
        hideAuto={hideAutoRank}
        disabled={rankSelectDisabled}
        disabledReason={rankSelectDisabledReason}
        onViewRankChange={onViewRankChange}
        className="w-[11rem]"
        triggerClassName="h-9 rounded-md border-border bg-background px-2 text-xs font-normal shadow-none"
      />

      <GenesSegmentedControl
        label="Count unit"
        value={unit}
        onChange={onUnitChange}
        options={[
          { id: "annotations", label: "Annotations" },
          { id: "species", label: "Species" },
        ]}
      />

      {zeroHitCount > 0 ? (
        <span className="text-xs text-muted-foreground sm:text-sm">
          {zeroHitCount.toLocaleString()} gene
          {zeroHitCount === 1 ? "" : "s"} had no hits
          {onReviewZeroHits ? (
            <>
              {" · "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-2 hover:underline"
                onClick={onReviewZeroHits}
              >
                Review
              </button>
            </>
          ) : null}
        </span>
      ) : null}

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              disabled={exportDisabled || exporting}
              aria-label="Export heatmap"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              disabled={exporting}
              onClick={() => void onExport("svg")}
            >
              Download SVG
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exporting}
              onClick={() => void onExport("png")}
            >
              Download PNG
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exporting}
              onClick={() => void onExport("tsv")}
            >
              Download TSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </GenesViewToolbar>
  )
}
