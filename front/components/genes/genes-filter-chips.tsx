"use client"

import { useState } from "react"
import { X } from "lucide-react"

import type { GenesListFilters } from "@/lib/genes/list-filters"
import { listFiltersIsEmpty } from "@/lib/genes/list-filters"
import { cn } from "@/lib/utils"

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
  className,
}: GenesFilterChipsProps) {
  const [open, setOpen] = useState<ChipKey | null>(null)

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
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <div key={chip.key} className="relative">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium">
            <button
              type="button"
              className="hover:underline"
              onClick={() =>
                setOpen((cur) => (cur === chip.key ? null : chip.key))
              }
            >
              {chip.label}
            </button>
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              onClick={chip.onClear}
              aria-label={`Remove ${chip.label}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
          {open === chip.key ? (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-48 min-w-[12rem] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
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
                          <X className="h-3 w-3" />
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
                          <X className="h-3 w-3" />
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
                          <X className="h-3 w-3" />
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
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
