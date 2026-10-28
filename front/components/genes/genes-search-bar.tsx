"use client"

import { Search, Sparkles } from "lucide-react"

import { GenesTaxaPopover } from "@/components/genes/genes-taxa-popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { cn } from "@/lib/utils"

interface GenesSearchBarProps {
  queryText: string
  onQueryTextChange: (text: string) => void
  onSearch: () => void
  onOpenPrefix: () => void
  /** Committed names + draft exact tokens (capped). */
  nameCount: number
  /** True when the gene-set cap is reached (blocks adding more). */
  atLimit?: boolean
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  onApplyTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
  className?: string
}

export function GenesSearchBar({
  queryText,
  onQueryTextChange,
  onSearch,
  onOpenPrefix,
  nameCount,
  atLimit,
  includeTaxa,
  excludeTaxa,
  onApplyTaxa,
  className,
}: GenesSearchBarProps) {
  const hasPrefix = queryText.includes("*")
  const draftEmpty = !queryText.trim()
  const limitReached = atLimit ?? nameCount >= MAX_NAMES_GET

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        className={cn(
          "h-11 shrink-0 rounded-xl",
          !hasPrefix && "text-muted-foreground",
        )}
        onClick={onOpenPrefix}
      >
        <Sparkles className="h-4 w-4" />
        Prefix…
      </Button>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={queryText}
          onChange={(e) => onQueryTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (!draftEmpty) onSearch()
            }
          }}
          placeholder="Add gene names (comma or space separated)…"
          aria-label="Add gene names"
          className="h-11 rounded-xl shadow-sm bg-background pl-10 pr-16"
          disabled={limitReached && draftEmpty}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground">
          {nameCount}/{MAX_NAMES_GET}
        </span>
      </div>
      <Button
        type="button"
        className="h-11 shrink-0 rounded-xl font-semibold px-4"
        onClick={onSearch}
        disabled={draftEmpty}
      >
        <Search className="h-4 w-4" />
        Search
      </Button>
      <GenesTaxaPopover
        includeTaxa={includeTaxa}
        excludeTaxa={excludeTaxa}
        onApply={onApplyTaxa}
      />
    </div>
  )
}
