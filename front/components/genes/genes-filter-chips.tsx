"use client"

import { useEffect, useRef, useState } from "react"

import { FilterChip } from "@/components/annotations/active-filters/filter-chip"
import type { GenesListFilters } from "@/lib/genes/list-filters"
import { listFiltersIsEmpty } from "@/lib/genes/list-filters"
import { cn } from "@/lib/utils"

const CHIP_COLORS = {
  bg: "bg-card",
  bgHover: "hover:bg-muted/50",
  border: "border-border",
  text: "text-foreground",
}

interface GenesFilterChipsProps {
  listFilters: GenesListFilters
  taxonLabel: (taxid: string) => string
  onClearTaxids: () => void
  onClearNames: () => void
  onClearCells: () => void
  onClearAnnotationIds?: () => void
  onRemoveTaxid?: (id: string) => void
  onRemoveName?: (name: string) => void
  onRemoveCell?: (index: number) => void
  onRemoveAnnotationId?: (id: string) => void
  /** Dropdown opens upward when "top" (footer cards). */
  menuSide?: "top" | "bottom"
  className?: string
}

type ChipKey = "taxids" | "names" | "cells" | "anns"

export function GenesFilterChips({
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
  menuSide = "bottom",
  className,
}: GenesFilterChipsProps) {
  const [open, setOpen] = useState<ChipKey | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const root = rootRef.current
      if (root && !root.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(null)
      }
    }
    document.addEventListener("mousedown", onPointer)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (listFiltersIsEmpty(listFilters)) return null

  const chips: {
    key: ChipKey
    label: string
    onClear: () => void
  }[] = []

  if (listFilters.includeTaxids.length) {
    const labels = listFilters.includeTaxids.map(taxonLabel)
    const text =
      labels.length <= 3
        ? labels.join(", ")
        : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`
    chips.push({
      key: "taxids",
      label: `Only: ${text}`,
      onClear: onClearTaxids,
    })
  }

  if (listFilters.includeNames.length) {
    const names = listFilters.includeNames
    const text =
      names.length <= 3
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`
    chips.push({
      key: "names",
      label: `Only genes: ${text} (${listFilters.nameMatch})`,
      onClear: onClearNames,
    })
  }

  if (listFilters.includeCells.length) {
    chips.push({
      key: "cells",
      label: `Only cells: ${listFilters.includeCells.length}`,
      onClear: onClearCells,
    })
  }

  if (listFilters.includeAnnotationIds.length && onClearAnnotationIds) {
    chips.push({
      key: "anns",
      label: `Only annotations: ${listFilters.includeAnnotationIds.length}`,
      onClear: onClearAnnotationIds,
    })
  }

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-wrap items-center gap-1.5 px-3 sm:px-4", className)}
    >
      {chips.map((chip) => {
        const expanded = open === chip.key
        return (
          <div key={chip.key} className="relative">
            <FilterChip
              label={chip.label}
              value={chip.key}
              colorScheme={CHIP_COLORS}
              onRemove={chip.onClear}
              onClick={() =>
                setOpen((cur) => (cur === chip.key ? null : chip.key))
              }
              isActive={expanded}
              aria-expanded={expanded}
            />
            {expanded ? (
              <div
                id={`genes-filter-chip-${chip.key}`}
                role="listbox"
                className={cn(
                  "absolute left-0 z-30 max-h-48 min-w-[12rem] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md",
                  menuSide === "top"
                    ? "bottom-full mb-1"
                    : "top-full mt-1",
                )}
              >
                {chip.key === "taxids"
                  ? listFilters.includeTaxids.map((id) => (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs"
                      >
                        <span className="truncate">{taxonLabel(id)}</span>
                        {onRemoveTaxid ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => onRemoveTaxid(id)}
                            aria-label={`Remove ${taxonLabel(id)}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
                {chip.key === "names"
                  ? listFilters.includeNames.map((name) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-xs"
                      >
                        <span className="truncate">{name}</span>
                        {onRemoveName ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => onRemoveName(name)}
                            aria-label={`Remove ${name}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
                {chip.key === "cells"
                  ? listFilters.includeCells.map((cell, i) => (
                      <div
                        key={`${cell.taxid}:${cell.gene}:${i}`}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs"
                      >
                        <span className="truncate font-mono">
                          {cell.taxid}:{cell.gene}
                        </span>
                        {onRemoveCell ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => onRemoveCell(i)}
                            aria-label="Remove cell"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
                {chip.key === "anns"
                  ? listFilters.includeAnnotationIds.map((id) => (
                      <div
                        key={id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-xs"
                      >
                        <span className="truncate">{id}</span>
                        {onRemoveAnnotationId ? (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => onRemoveAnnotationId(id)}
                            aria-label={`Remove ${id}`}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
