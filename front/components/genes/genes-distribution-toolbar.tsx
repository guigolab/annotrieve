"use client"

import { Download } from "lucide-react"

import {
  GenesRankSelect,
  type GenesRankOption,
} from "@/components/genes/genes-rank-select"
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
  annotationTotal: number
  speciesTotal: number
  onExport: (format: HeatmapExportFormat) => void | Promise<void>
  exportDisabled?: boolean
  exporting?: boolean
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
  annotationTotal,
  speciesTotal,
  onExport,
  exportDisabled,
  exporting,
  className,
}: GenesDistributionToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-card/40 px-3 py-2",
        className,
      )}
    >
      <GenesRankSelect
        viewRank={viewRank}
        options={rankOptions}
        hideAuto={hideAutoRank}
        disabled={rankSelectDisabled}
        disabledReason={rankSelectDisabledReason}
        onViewRankChange={onViewRankChange}
        className="w-[11rem]"
        triggerClassName="h-8 rounded-md border-border bg-background px-2 text-xs font-normal shadow-none"
      />

      <div
        role="group"
        aria-label="Count unit"
        className="inline-flex h-8 items-center rounded-md border border-border bg-background p-0.5"
      >
        {(
          [
            ["annotations", "Annotations"],
            ["species", "Species"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={unit === value}
            className={cn(
              "rounded px-2.5 text-xs font-medium transition-colors",
              unit === value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onUnitChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="text-xs tabular-nums text-muted-foreground">
        {annotationTotal.toLocaleString()} annotations ·{" "}
        {speciesTotal.toLocaleString()} species
      </span>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
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
    </div>
  )
}
