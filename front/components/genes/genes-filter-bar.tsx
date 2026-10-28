"use client"

import { X } from "lucide-react"

import { GenesCoveragePopover } from "@/components/genes/genes-coverage-popover"
import { Button } from "@/components/ui/button"
import type { CoverageRange } from "@/lib/genes/coverage"
import { isDefaultCoverageRange } from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES, defaultSources } from "@/lib/genes/filters"
import { PILL_CLASS, SOURCE_DEFS } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

interface GenesFilterBarProps {
  sources: Set<number>
  sourceCounts: Map<number, number>
  onToggleSource: (code: number) => void
  matchedCounts: number[]
  termCount: number
  coverage: CoverageRange | null
  onCoverageChange: (range: CoverageRange | null) => void
  coverageOpen: boolean
  onCoverageOpenChange: (open: boolean) => void
  coverageDisabled?: boolean
  selectedTaxonLabel: string | null
  selectedName: string | null
  onClearTaxon: () => void
  onClearName: () => void
  onResetViewFilters: () => void
}

export function GenesFilterBar({
  sources,
  sourceCounts,
  onToggleSource,
  matchedCounts,
  termCount,
  coverage,
  onCoverageChange,
  coverageOpen,
  onCoverageOpenChange,
  coverageDisabled,
  selectedTaxonLabel,
  selectedName,
  onClearTaxon,
  onClearName,
  onResetViewFilters,
}: GenesFilterBarProps) {
  const coverageActive =
    coverage != null && !isDefaultCoverageRange(coverage, termCount)
  // Coverage state is shown on the Best matches popover chip — no duplicate chip.
  const hasViewChips =
    coverageActive ||
    sources.size < ALL_SOURCE_CODES.length ||
    Boolean(selectedTaxonLabel) ||
    Boolean(selectedName)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedTaxonLabel && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
          {selectedTaxonLabel}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            onClick={onClearTaxon}
            aria-label={`Clear taxon ${selectedTaxonLabel}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}
      {selectedName && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium font-mono">
          {selectedName}
          <button
            type="button"
            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            onClick={onClearName}
            aria-label={`Clear name ${selectedName}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {SOURCE_DEFS.map((source) => {
        const checked = sources.has(source.code)
        const count = sourceCounts.get(source.code) ?? 0
        return (
          <button
            key={source.code}
            type="button"
            aria-pressed={checked}
            onClick={() => onToggleSource(source.code)}
            className={cn(
              PILL_CLASS,
              checked
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-muted/50 text-muted-foreground opacity-60",
            )}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: source.color }}
            />
            <span>{source.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {count.toLocaleString()}
            </span>
          </button>
        )
      })}

      {termCount >= 2 ? (
        <GenesCoveragePopover
          matchedCounts={matchedCounts}
          termCount={termCount}
          range={coverage}
          onChange={onCoverageChange}
          open={coverageOpen}
          onOpenChange={onCoverageOpenChange}
          disabled={coverageDisabled}
        />
      ) : null}

      {hasViewChips && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onResetViewFilters}
        >
          Reset
        </Button>
      )}
    </div>
  )
}

/** True when view filters differ from defaults (for Reset visibility). */
export function hasNonDefaultViewFilters(opts: {
  sources: Set<number>
  coverage: CoverageRange | null
  termCount: number
  t: string | null
  g: string | null
}): boolean {
  if (opts.t || opts.g) return true
  if (opts.sources.size < defaultSources().size) return true
  if (
    opts.coverage != null &&
    !isDefaultCoverageRange(opts.coverage, opts.termCount)
  ) {
    return true
  }
  return false
}
