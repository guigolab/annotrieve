"use client"

import { GenesReviewNames } from "@/components/genes/genes-review-names"
import { PILL_CLASS } from "@/lib/genes/ui"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import type { HitTerm } from "@/lib/api/xrefs-types"
import { cn } from "@/lib/utils"

interface GenesResultsHeaderProps {
  annotationTotal: number
  activeCount: number
  resolvedCount: number
  prefixExpansions: { prefix: string; count: number }[]
  matchedNothingCount: number
  isFetching?: boolean
  reviewOpen: boolean
  onReviewOpenChange: (open: boolean) => void
  terms: ResolvedTerm[]
  hitTerms: HitTerm[]
  excluded: Set<string>
  onApplyExcluded: (excluded: Set<string>) => void
  onRemoveName: (name: string) => void
}

export function GenesResultsHeader({
  annotationTotal,
  activeCount,
  resolvedCount,
  prefixExpansions,
  matchedNothingCount,
  isFetching,
  reviewOpen,
  onReviewOpenChange,
  terms,
  hitTerms,
  excluded,
  onApplyExcluded,
  onRemoveName,
}: GenesResultsHeaderProps) {
  const namesSummary =
    activeCount < resolvedCount
      ? `${activeCount} of ${resolvedCount} names`
      : `${resolvedCount} names`

  const parts = [
    `${annotationTotal.toLocaleString()} annotations`,
    namesSummary,
  ]
  if (prefixExpansions.length) {
    parts.push(
      `prefixes: ${prefixExpansions
        .map((p) => `${p.prefix} → ${p.count}`)
        .join(", ")}`,
    )
  }
  if (matchedNothingCount > 0) {
    parts.push(`${matchedNothingCount} matched nothing`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <p
        className={cn(
          "text-xs min-w-0 truncate",
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

      <GenesReviewNames
        open={reviewOpen}
        onOpenChange={onReviewOpenChange}
        terms={terms}
        hitTerms={hitTerms}
        excluded={excluded}
        prefixExpansions={prefixExpansions}
        onApply={onApplyExcluded}
        onRemoveName={onRemoveName}
      >
        <button
          type="button"
          className={cn(
            PILL_CLASS,
            "border-border bg-background hover:bg-muted/50",
          )}
        >
          Review names
        </button>
      </GenesReviewNames>
    </div>
  )
}
