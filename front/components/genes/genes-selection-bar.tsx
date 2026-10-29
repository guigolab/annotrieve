"use client"

import { Button } from "@/components/ui/button"
import type { DistributionSelection } from "@/lib/genes/selection"
import { selectionIsEmpty, selectionSize } from "@/lib/genes/selection"
import type { NameMatchMode } from "@/lib/genes/list-filters"
import { cn } from "@/lib/utils"

interface GenesSelectionBarProps {
  selection: DistributionSelection
  annotationCount: number
  speciesCount: number
  nameMatch: NameMatchMode
  onNameMatchChange: (mode: NameMatchMode) => void
  onShowOnly: () => void
  onClear: () => void
  onRestrictSearch?: () => void
  /** When true, row selection means annotations (table), not clades. */
  rowsAreAnnotations?: boolean
  className?: string
}

export function GenesSelectionBar({
  selection,
  annotationCount,
  speciesCount,
  nameMatch,
  onNameMatchChange,
  onShowOnly,
  onClear,
  onRestrictSearch,
  rowsAreAnnotations,
  className,
}: GenesSelectionBarProps) {
  if (selectionIsEmpty(selection)) return null

  const n = selectionSize(selection)
  const kindLabel =
    selection.kind === "rows"
      ? rowsAreAnnotations
        ? n === 1
          ? "annotation"
          : "annotations"
        : n === 1
          ? "clade"
          : "clades"
      : selection.kind === "cols"
        ? n === 1
          ? "gene"
          : "genes"
        : n === 1
          ? "cell"
          : "cells"

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-3 py-2",
        className,
      )}
      role="status"
    >
      <span className="text-xs font-medium">
        {n.toLocaleString()} {kindLabel} selected
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">
        {annotationCount.toLocaleString()} annotations ·{" "}
        {speciesCount.toLocaleString()} species
      </span>

      {selection.kind === "cols" ? (
        <div
          role="group"
          aria-label="Gene match mode"
          className="inline-flex h-7 items-center rounded-md border border-border bg-background p-0.5"
        >
          {(
            [
              ["any", "Match: any"],
              ["all", "Match: all"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={nameMatch === value}
              className={cn(
                "rounded px-2 text-[11px] font-medium",
                nameMatch === value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground",
              )}
              onClick={() => onNameMatchChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {selection.kind === "rows" && onRestrictSearch ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onRestrictSearch}
          >
            Restrict search to selected clades
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          onClick={onShowOnly}
        >
          Show only →
        </Button>
      </div>
    </div>
  )
}
