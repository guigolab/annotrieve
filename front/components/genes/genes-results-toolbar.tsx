"use client"

import { GenesDownloadMenu } from "@/components/genes/genes-download-menu"
import { cn } from "@/lib/utils"

interface GenesResultsToolbarProps {
  overviewAnnotationTotal: number
  overviewOrganismTotal: number
  annotationTotal: number
  hasSlice: boolean
  activeCount: number
  resolvedCount: number
  matchedNothingCount: number
  isFetching?: boolean
  loading?: boolean
  downloadDisabled?: boolean
  downloadAllTotal: number
  onDownloadAll: () => void
  onDownloadSelection?: () => void
  className?: string
}

/** Footer strip: result counts + download. */
export function GenesResultsToolbar({
  overviewAnnotationTotal,
  overviewOrganismTotal,
  annotationTotal,
  hasSlice,
  activeCount,
  resolvedCount,
  matchedNothingCount,
  isFetching,
  loading,
  downloadDisabled,
  downloadAllTotal,
  onDownloadAll,
  onDownloadSelection,
  className,
}: GenesResultsToolbarProps) {
  const namesSummary =
    activeCount < resolvedCount
      ? `${activeCount} of ${resolvedCount} names`
      : `${resolvedCount} names`

  const overviewLabel = loading
    ? "…"
    : `${overviewAnnotationTotal.toLocaleString()} annotations · ${overviewOrganismTotal.toLocaleString()} organisms`

  const selectionLabel = loading
    ? "…"
    : `${annotationTotal.toLocaleString()} selected`

  const parts = hasSlice
    ? [overviewLabel, selectionLabel, namesSummary]
    : [overviewLabel, namesSummary]
  if (matchedNothingCount > 0) {
    parts.push(`${matchedNothingCount} matched nothing`)
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-xs",
          matchedNothingCount > 0
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
        )}
        aria-live="polite"
        title={parts.join(" · ")}
      >
        {isFetching ? "Updating… · " : null}
        {parts.join(" · ")}
      </p>
      <GenesDownloadMenu
        allCount={downloadAllTotal}
        selectionCount={annotationTotal}
        showSelection={hasSlice}
        disabled={downloadDisabled}
        onDownloadAll={onDownloadAll}
        onDownloadSelection={onDownloadSelection}
      />
    </div>
  )
}
