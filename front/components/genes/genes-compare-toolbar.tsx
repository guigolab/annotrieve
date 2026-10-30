"use client"

import { Minus, Pin, Plus } from "lucide-react"

import type { CompareFeatureMode } from "@/components/genes/genes-compare-tracks"
import { GenesSegmentedControl } from "@/components/genes/genes-segmented-control"
import { GenesViewToolbar } from "@/components/genes/genes-view-toolbar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface GenesCompareToolbarProps {
  pinCount: number
  featureMode: CompareFeatureMode
  onFeatureModeChange: (mode: CompareFeatureMode) => void
  zoom: number
  zoomMin: number
  zoomMax: number
  onZoomOut: () => void
  onZoomIn: () => void
  onClear: () => void
  onAddGenes: () => void
  className?: string
}

export function GenesCompareToolbar({
  pinCount,
  featureMode,
  onFeatureModeChange,
  zoom,
  zoomMin,
  zoomMax,
  onZoomOut,
  onZoomIn,
  onClear,
  onAddGenes,
  className,
}: GenesCompareToolbarProps) {
  return (
    <GenesViewToolbar className={cn(className)}>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
        <Pin className="h-4 w-4 text-primary" aria-hidden />
        <span className="tabular-nums text-muted-foreground">
          {pinCount.toLocaleString()} pinned
        </span>
      </span>

      <GenesSegmentedControl
        label="Feature display"
        value={featureMode}
        onChange={onFeatureModeChange}
        options={[
          { id: "all", label: "All" },
          { id: "exons", label: "Exons" },
          { id: "cds", label: "CDS" },
        ]}
      />

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <div
          role="group"
          aria-label="Zoom"
          className="inline-flex items-center gap-0.5"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Zoom out"
            disabled={zoom <= zoomMin}
            onClick={onZoomOut}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[2.75rem] text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Zoom in"
            disabled={zoom >= zoomMax}
            onClick={onZoomIn}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 px-2 text-xs"
          onClick={onAddGenes}
        >
          Add genes
        </Button>
      </div>
    </GenesViewToolbar>
  )
}
