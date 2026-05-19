"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SortOption } from "@/lib/stores/annotations-filters"
import { cn } from "@/lib/utils"

const SORT_FIELDS: { value: string; label: string; shortLabel?: string }[] = [
  { value: "none", label: "Default order", shortLabel: "Default" },
  { value: "date", label: "Release date", shortLabel: "Date" },
  { value: "coding_genes_count", label: "Coding genes", shortLabel: "Coding" },
  { value: "non_coding_genes_count", label: "Non-coding genes", shortLabel: "Non-coding" },
  { value: "pseudogenes_count", label: "Pseudogenes", shortLabel: "Pseudo" },
  { value: "busco_complete", label: "BUSCO complete", shortLabel: "BUSCO" },
]

function getSortFieldAndOrder(option: SortOption): { field: string; order: "asc" | "desc" } {
  if (option === "none") return { field: "none", order: "desc" }
  const parts = option.split("_")
  const order = parts[parts.length - 1] as "asc" | "desc"
  const field = parts.slice(0, -1).join("_")
  return { field, order }
}

export interface AnnotationsSortControlProps {
  sortOption: SortOption
  onSortOptionChange: (option: SortOption) => void
  className?: string
}

export function AnnotationsSortControl({
  sortOption,
  onSortOptionChange,
  className,
}: AnnotationsSortControlProps) {
  const { field: currentSortField, order: currentSortOrder } = getSortFieldAndOrder(sortOption)

  const handleSortFieldChange = (field: string) => {
    if (field === "none") {
      onSortOptionChange("none")
    } else {
      onSortOptionChange(`${field}_${currentSortOrder}` as SortOption)
    }
  }

  const handleSortOrderToggle = () => {
    if (currentSortField === "none") return
    const newOrder = currentSortOrder === "asc" ? "desc" : "asc"
    onSortOptionChange(`${currentSortField}_${newOrder}` as SortOption)
  }

  const orderTitle =
    currentSortField === "none"
      ? "Select a sort field first"
      : currentSortOrder === "asc"
        ? "Ascending — tap to sort descending"
        : "Descending — tap to sort ascending"

  const selectedField = SORT_FIELDS.find((f) => f.value === currentSortField)

  return (
    <div
      className={cn("inline-flex items-center shrink-0 min-w-0", className)}
      role="group"
      aria-label="Sort results"
    >
      <div className="inline-flex items-center rounded-md border border-input bg-background shadow-sm h-7 sm:h-8 lg:h-9 overflow-hidden">
        <Select value={currentSortField} onValueChange={handleSortFieldChange}>
          <SelectTrigger
            className={cn(
              "h-7 sm:h-8 lg:h-9 border-0 shadow-none rounded-none",
              "focus:ring-0 focus:ring-offset-0 focus-visible:ring-0",
              "w-[3.75rem] sm:w-[5.5rem] md:w-[7.5rem] lg:w-[10.5rem]",
              "text-[10px] sm:text-xs lg:text-sm px-1 sm:px-2 lg:px-2.5 gap-0.5",
              "[&>span]:truncate [&_svg]:h-3 [&_svg]:w-3 sm:[&_svg]:h-4 sm:[&_svg]:w-4"
            )}
          >
            <SelectValue placeholder="Sort">
              {selectedField ? (
                <>
                  <span className="lg:hidden">{selectedField.shortLabel ?? selectedField.label}</span>
                  <span className="hidden lg:inline">{selectedField.label}</span>
                </>
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs sm:text-sm">
                <span className="lg:hidden">{f.shortLabel ?? f.label}</span>
                <span className="hidden lg:inline">{f.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-px h-3.5 sm:h-4 lg:h-5 bg-border shrink-0" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9 shrink-0 rounded-none hover:bg-muted/80"
          disabled={currentSortField === "none"}
          onClick={handleSortOrderToggle}
          title={orderTitle}
          aria-label={orderTitle}
        >
          {currentSortField === "none" ? (
            <ArrowUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          ) : currentSortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
