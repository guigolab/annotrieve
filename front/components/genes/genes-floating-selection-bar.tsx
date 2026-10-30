"use client"

import { Loader2, Pin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { GenesSegmentedControl } from "@/components/genes/genes-segmented-control"
import { formatGenesStat } from "@/components/genes/genes-stat"
import type { DistributionSelection } from "@/lib/genes/selection"
import {
  selectionIsEmpty,
  selectionSummaryLabel,
} from "@/lib/genes/selection"
import type { NameMatchMode } from "@/lib/genes/list-filters"
import { cn } from "@/lib/utils"

interface GenesFloatingSelectionBarProps {
  selection: DistributionSelection
  annotationCount: number
  speciesCount: number
  nameMatch: NameMatchMode
  onNameMatchChange: (mode: NameMatchMode) => void
  onShowOnly: () => void
  onClear: () => void
  onPin?: () => void
  pinning?: boolean
  /** When true, row selection means annotations (table), not clades. */
  rowsAreAnnotations?: boolean
  className?: string
}

export function GenesFloatingSelectionBar({
  selection,
  annotationCount,
  speciesCount,
  nameMatch,
  onNameMatchChange,
  onShowOnly,
  onClear,
  onPin,
  pinning,
  rowsAreAnnotations,
  className,
}: GenesFloatingSelectionBarProps) {
  if (selectionIsEmpty(selection)) return null

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3 sm:px-4",
        className,
      )}
      role="toolbar"
      aria-label="Selection actions"
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        )}
      >
        <span className="text-xs font-medium">
          {selectionSummaryLabel(selection, { rowsAreAnnotations })}
        </span>
        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
          {formatGenesStat(annotationCount, speciesCount)}
        </span>

        {/* any/all only matters when Show only will AND/OR multiple genes */}
        {selection.cols.length > 1 ? (
          <GenesSegmentedControl
            label="Gene match mode"
            value={nameMatch}
            size="sm"
            onChange={onNameMatchChange}
            options={[
              { id: "any", label: "Match: any" },
              { id: "all", label: "Match: all" },
            ]}
          />
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
          {onPin ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={pinning}
              onClick={onPin}
            >
              {pinning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Pin className="h-3.5 w-3.5" aria-hidden />
              )}
              Pin
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={onShowOnly}
          >
            Show only
          </Button>
        </div>
      </div>
    </div>
  )
}
