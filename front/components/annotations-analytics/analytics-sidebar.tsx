"use client"

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Filter } from "lucide-react"

export const CURRENT_ENTRY_ID = "__current__"
export const CURRENT_ENTRY_COLOR = "#818cf8"

export interface AnalyticsEntry {
  id: string
  name: string
  color: string
  isVirtual: boolean
  /** Short human-readable summary of active filters */
  filterSummary?: string
}

export type EntityType = "genes" | "transcripts"

interface AnalyticsSidebarProps {
  entries: AnalyticsEntry[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  /** Maximum number of simultaneously selected entries */
  maxSelected?: number
}

export function AnalyticsSidebar({
  entries,
  selectedIds,
  onSelectionChange,
  maxSelected = 5,
}: AnalyticsSidebarProps) {
  const selectedCount = selectedIds.length
  const limitReached = selectedCount >= maxSelected

  const toggleEntry = useCallback(
    (id: string) => {
      if (selectedIds.includes(id)) {
        onSelectionChange(selectedIds.filter(s => s !== id))
      } else if (selectedCount < maxSelected) {
        onSelectionChange([...selectedIds, id])
      }
    },
    [selectedIds, selectedCount, maxSelected, onSelectionChange]
  )

  const virtualEntry = entries.find(e => e.isVirtual)
  const savedEntries = entries.filter(e => !e.isVirtual)

  return (
    <div className="flex flex-col gap-3 py-4 px-3 h-full">
      {/* Filter sets header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Filter sets
        </span>
        <span className="text-xs text-muted-foreground">
          {selectedCount}/{maxSelected}
        </span>
      </div>

      {/* Virtual "Current filters" / "All annotations" card */}
      {virtualEntry && (
        <EntryCard
          entry={virtualEntry}
          checked={selectedIds.includes(virtualEntry.id)}
          disabled={!selectedIds.includes(virtualEntry.id) && limitReached}
          onToggle={() => toggleEntry(virtualEntry.id)}
          isVirtual
        />
      )}

      {/* Saved subset cards */}
      {savedEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          {savedEntries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              checked={selectedIds.includes(entry.id)}
              disabled={!selectedIds.includes(entry.id) && limitReached}
              onToggle={() => toggleEntry(entry.id)}
            />
          ))}
        </div>
      )}

      {savedEntries.length === 0 && (
        <p className="text-xs text-muted-foreground px-1 pb-1">
          No saved filter sets. Save filters from the annotations page to compare them here.
        </p>
      )}
    </div>
  )
}

// ─── Entry card ───────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: AnalyticsEntry
  checked: boolean
  disabled: boolean
  onToggle: () => void
  isVirtual?: boolean
}

function EntryCard({ entry, checked, disabled, onToggle, isVirtual }: EntryCardProps) {
  // Virtual (current/all) card: keep colored border when checked. Saved cards: neutral border only, dot for color.
  const useColoredBorder = isVirtual && checked
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2.5 transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-background shadow-sm" : "bg-muted/30 opacity-70 hover:opacity-90",
        disabled && !checked && "cursor-not-allowed opacity-40",
        isVirtual && "border-dashed border-2",
        !isVirtual && "border-border"
      )}
      style={useColoredBorder ? { borderColor: entry.color } : undefined}
    >
      <div className="flex items-start gap-2.5">
        {/* Color indicator / checkbox area */}
        <div className="flex-shrink-0 mt-0.5">
          <div
            className={cn(
              "h-3.5 w-3.5 rounded-sm border-2 flex items-center justify-center transition-colors",
              checked ? "border-transparent" : "border-muted-foreground/40"
            )}
            style={{ backgroundColor: checked ? entry.color : "transparent" }}
          >
            {checked && (
              <svg viewBox="0 0 10 8" className="w-2 h-2 text-white fill-current">
                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate">{entry.name}</span>
            {isVirtual && (
              <Badge variant="outline" className="h-4 text-[10px] px-1 py-0 border-dashed">
                <Filter className="h-2.5 w-2.5 mr-0.5" />
                live
              </Badge>
            )}
          </div>
          {entry.filterSummary && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {entry.filterSummary}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
