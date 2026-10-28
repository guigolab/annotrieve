"use client"

import { useMemo } from "react"
import { X } from "lucide-react"

import { FilterChip } from "@/components/annotations/active-filters/filter-chip"
import { GenesReviewNames } from "@/components/genes/genes-review-names"
import {
  ExcludeTaxonIcon,
  IncludeTaxonIcon,
  TAXON_CHIP_COLORS,
} from "@/components/genes/genes-taxa-popover"
import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { PILL_CLASS } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

/** Preview chips beside the Names review control. */
const PREVIEW_CHIP_CAP = 6

interface GenesNameChipsProps {
  hitTerms: HitTerm[]
  terms: ResolvedTerm[]
  excluded: Set<string>
  onApplyExcluded: (excluded: Set<string>) => void
  onRemoveName: (name: string) => void
  onClearAll?: () => void
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  onApplyTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
  reviewOpen: boolean
  onReviewOpenChange: (open: boolean) => void
  className?: string
}

export function GenesNameChips({
  hitTerms,
  terms,
  excluded,
  onApplyExcluded,
  onRemoveName,
  onClearAll,
  includeTaxa,
  excludeTaxa,
  onApplyTaxa,
  reviewOpen,
  onReviewOpenChange,
  className,
}: GenesNameChipsProps) {
  const matchedWithHits = useMemo(
    () => hitTerms.filter((t) => t.n_hits > 0).length,
    [hitTerms],
  )

  const activeCount = useMemo(() => {
    if (!terms.length) return matchedWithHits
    return terms.filter((t) => t.count > 0 && !excluded.has(t.id)).length
  }, [terms, excluded, matchedWithHits])

  /**
   * Top names by prevalence. Prefer adapter.activeTerms order (annotation
   * count); fall back to hitTerms n_hits so excluded names stay in the strip
   * with strike-through.
   */
  const previewChips = useMemo(() => {
    const byId = new Map(terms.map((t) => [t.id, t]))
    const ranked = hitTerms
      .filter((t) => t.n_hits > 0)
      .map((t) => {
        const id = t.name.toLowerCase()
        const resolved = byId.get(id)
        return {
          name: t.name,
          id,
          input: t.input,
          // Use resolved count when active; keep n_hits for excluded rank/display.
          count: resolved?.count ?? t.n_hits,
          sortCount: resolved?.count ?? t.n_hits,
          isExcluded: excluded.has(id),
        }
      })
    ranked.sort(
      (a, b) => b.sortCount - a.sortCount || a.name.localeCompare(b.name),
    )
    return ranked.slice(0, PREVIEW_CHIP_CAP)
  }, [hitTerms, terms, excluded])

  const hasTaxa = includeTaxa.length > 0 || excludeTaxa.length > 0
  const hasNames = hitTerms.length > 0 || terms.length > 0

  const toggleExcluded = (id: string) => {
    const next = new Set(excluded)
    if (next.has(id)) {
      next.delete(id)
    } else {
      // Cannot exclude the last active name.
      if (activeCount <= 1) return
      next.add(id)
    }
    onApplyExcluded(next)
  }

  if (!hasNames && !hasTaxa && !onClearAll) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {hasNames ? (
        <GenesReviewNames
          open={reviewOpen}
          onOpenChange={onReviewOpenChange}
          terms={terms}
          hitTerms={hitTerms}
          excluded={excluded}
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
            Names
            <span className="tabular-nums text-muted-foreground">
              {activeCount.toLocaleString()}
              {matchedWithHits > activeCount
                ? `/${matchedWithHits.toLocaleString()}`
                : ""}
            </span>
          </button>
        </GenesReviewNames>
      ) : null}

      {previewChips.map((chip) => (
        <span
          key={chip.id}
          className={cn(
            PILL_CLASS,
            "max-w-[14rem] gap-1",
            chip.isExcluded
              ? "border-transparent bg-muted/40 text-muted-foreground line-through opacity-70"
              : "border-border bg-background",
          )}
        >
          <button
            type="button"
            className="min-w-0 truncate font-mono text-left hover:underline"
            title={
              chip.isExcluded
                ? `Include ${chip.name}`
                : `Exclude ${chip.name} from view`
            }
            onClick={() => toggleExcluded(chip.id)}
          >
            {chip.name}
          </button>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {chip.count.toLocaleString()}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${chip.input}`}
            onClick={() => onRemoveName(chip.input)}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {includeTaxa.map((taxon) => (
        <FilterChip
          key={`in-${taxon.taxid}`}
          label={`Include ${taxon.label}`}
          value={String(taxon.taxid)}
          icon={<IncludeTaxonIcon />}
          colorScheme={TAXON_CHIP_COLORS}
          onRemove={() => {
            onApplyTaxa(
              includeTaxa.filter((x) => x.taxid !== taxon.taxid),
              excludeTaxa,
            )
          }}
        />
      ))}
      {excludeTaxa.map((taxon) => (
        <FilterChip
          key={`ex-${taxon.taxid}`}
          label={`Exclude ${taxon.label}`}
          value={String(taxon.taxid)}
          icon={<ExcludeTaxonIcon />}
          colorScheme={TAXON_CHIP_COLORS}
          onRemove={() => {
            onApplyTaxa(
              includeTaxa,
              excludeTaxa.filter((x) => x.taxid !== taxon.taxid),
            )
          }}
        />
      ))}

      {onClearAll ? (
        <button
          type="button"
          className={cn(
            PILL_CLASS,
            "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
          onClick={onClearAll}
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}
