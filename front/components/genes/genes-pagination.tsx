"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface GenesPaginationProps {
  total: number
  limit: number
  offset: number
  onOffsetChange: (offset: number) => void
  pageSizes?: number[]
  onLimitChange?: (limit: number) => void
  maxOffset?: number
  className?: string
  /** Compact "Load more" mode for xrefs. */
  loadMore?: boolean
  onLoadMore?: () => void
  loading?: boolean
}

export function GenesPagination({
  total,
  limit,
  offset,
  onOffsetChange,
  pageSizes,
  onLimitChange,
  maxOffset = 10_000,
  className,
  loadMore,
  onLoadMore,
  loading,
}: GenesPaginationProps) {
  if (total <= 0) return null

  if (loadMore) {
    const shown = Math.min(offset + limit, total)
    if (shown >= total) {
      return (
        <p className={cn("text-xs text-muted-foreground", className)}>
          {total.toLocaleString()} {total === 1 ? "xref" : "xrefs"}
        </p>
      )
    }
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <p className="text-xs text-muted-foreground tabular-nums">
          {shown.toLocaleString()} of {total.toLocaleString()}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={loading}
          onClick={onLoadMore}
        >
          Load more
        </Button>
      </div>
    )
  }

  const from = Math.min(offset + 1, total)
  const to = Math.min(offset + limit, total)
  const atCap = offset + limit >= maxOffset && to < total
  const canPrev = offset > 0
  const canNext = to < total && offset + limit <= maxOffset

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <p className="text-xs tabular-nums text-muted-foreground">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      {pageSizes && onLimitChange && (
        <select
          className="h-7 rounded-md border bg-background px-1.5 text-xs"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          aria-label="Page size"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      )}
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canPrev || loading}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canNext || loading}
          onClick={() => onOffsetChange(offset + limit)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {atCap && (
        <p className="w-full text-[11px] text-muted-foreground">
          Refine names to see more results.
        </p>
      )}
    </div>
  )
}
