"use client"

import { FilterChip } from "@/components/annotations/active-filters/filter-chip"
import { GenesFilterChips } from "@/components/genes/genes-filter-chips"
import { formatGenesStat } from "@/components/genes/genes-stat"
import { Button } from "@/components/ui/button"
import type { KeepPolicy } from "@/lib/genes/annotations-controls"
import {
  isDefaultCoverageRange,
  namesMatchedChipLabel,
  type CoverageRange,
} from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES } from "@/lib/genes/filters"
import type { GenesListFilters } from "@/lib/genes/list-filters"
import { SOURCE_DEFS } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

const CHIP_COLORS = {
  bg: "bg-card",
  bgHover: "hover:bg-muted/50",
  border: "border-border",
  text: "text-foreground",
}

const KEEP_LABEL: Record<Exclude<KeepPolicy, "all">, string> = {
  best: "Keep: Best match",
  latest: "Keep: Latest",
}

interface GenesAnnotationsStatusCardProps {
  visibleTotal: number
  visibleSpecies: number
  overviewTotal: number
  keep: KeepPolicy
  onKeepChange: (k: KeepPolicy) => void
  sources: Set<number>
  sourceCounts: Map<number, number>
  onToggleSource: (code: number) => void
  coverage: CoverageRange | null
  onCoverageChange: (range: CoverageRange | null) => void
  termCount: number
  listFilters: GenesListFilters
  taxonLabel: (taxid: string) => string
  onClearTaxids: () => void
  onClearNames: () => void
  onClearCells: () => void
  onClearAnnotationIds: () => void
  onRemoveTaxid: (id: string) => void
  onRemoveName: (name: string) => void
  onRemoveCell: (index: number) => void
  onRemoveAnnotationId: (id: string) => void
  showReset: boolean
  onReset: () => void
  className?: string
}

export function GenesAnnotationsStatusCard({
  visibleTotal,
  visibleSpecies,
  overviewTotal,
  keep,
  onKeepChange,
  sources,
  sourceCounts,
  onToggleSource,
  coverage,
  onCoverageChange,
  termCount,
  listFilters,
  taxonLabel,
  onClearTaxids,
  onClearNames,
  onClearCells,
  onClearAnnotationIds,
  onRemoveTaxid,
  onRemoveName,
  onRemoveCell,
  onRemoveAnnotationId,
  showReset,
  onReset,
  className,
}: GenesAnnotationsStatusCardProps) {
  const countLabel = formatGenesStat(visibleTotal, visibleSpecies, {
    speciesLabel: "organisms",
    ofTotal:
      overviewTotal > visibleTotal && keep === "all"
        ? overviewTotal
        : undefined,
  })

  const sourcesActive = sources.size < ALL_SOURCE_CODES.length
  const coverageActive =
    coverage != null && !isDefaultCoverageRange(coverage, termCount)
  const keepActive = keep !== "all"

  const enableMissingSources = () => {
    for (const code of ALL_SOURCE_CODES) {
      if (!sources.has(code)) onToggleSource(code)
    }
  }

  const sourceChipLabel = SOURCE_DEFS.filter((s) => sources.has(s.code))
    .map((s) => s.label)
    .join(", ")

  return (
    <div
      className={cn("pointer-events-none flex", className)}
      role="region"
      aria-label="Results"
    >
      <div
        className={cn(
          "pointer-events-auto flex h-full max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        )}
      >
        <span
          className="text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {countLabel}
        </span>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {sourcesActive ? (
            <FilterChip
              label={`Sources: ${sourceChipLabel || "none"}`}
              value="sources"
              colorScheme={CHIP_COLORS}
              onRemove={enableMissingSources}
            />
          ) : null}
          {coverageActive ? (
            <FilterChip
              label={namesMatchedChipLabel(coverage, termCount)}
              value="coverage"
              colorScheme={CHIP_COLORS}
              onRemove={() => onCoverageChange(null)}
            />
          ) : null}
          {keepActive ? (
            <FilterChip
              label={KEEP_LABEL[keep]}
              value="keep"
              colorScheme={CHIP_COLORS}
              onRemove={() => onKeepChange("all")}
            />
          ) : null}
          <GenesFilterChips
            listFilters={listFilters}
            taxonLabel={taxonLabel}
            onClearTaxids={onClearTaxids}
            onClearNames={onClearNames}
            onClearCells={onClearCells}
            onClearAnnotationIds={onClearAnnotationIds}
            onRemoveTaxid={onRemoveTaxid}
            onRemoveName={onRemoveName}
            onRemoveCell={onRemoveCell}
            onRemoveAnnotationId={onRemoveAnnotationId}
            menuSide="top"
            className="px-0"
          />
        </div>

        {showReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onReset}
          >
            Reset
          </Button>
        ) : null}
      </div>
    </div>
  )
}
