"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Minus, Network, Plus } from "lucide-react"

import { FilterChip } from "@/components/annotations/active-filters/filter-chip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { MAX_TAXIDS } from "@/lib/genes/prefix"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { sameTaxa } from "@/lib/genes/taxa"
import { createTaxonSearchModel } from "@/lib/search-models"
import { cn } from "@/lib/utils"

export type { SelectedTaxon }

export const TAXON_CHIP_COLORS = {
  bg: "bg-card/70",
  bgHover: "hover:bg-card",
  border: "border-border/70",
  text: "text-foreground",
}

export function IncludeTaxonIcon({ className }: { className?: string }) {
  return <Plus className={cn("h-3.5 w-3.5 text-primary", className)} aria-hidden />
}

export function ExcludeTaxonIcon({ className }: { className?: string }) {
  return <Minus className={cn("h-3.5 w-3.5 text-destructive", className)} aria-hidden />
}

interface GenesTaxaPopoverProps {
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  onApply: (includeTaxa: SelectedTaxon[], excludeTaxa: SelectedTaxon[]) => void
  disabled?: boolean
}

export function GenesTaxaPopover({
  includeTaxa,
  excludeTaxa,
  onApply,
  disabled,
}: GenesTaxaPopoverProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  const [results, setResults] = useState<SelectedTaxon[]>([])
  const [searching, setSearching] = useState(false)
  const [draftInclude, setDraftInclude] = useState<SelectedTaxon[]>([])
  const [draftExclude, setDraftExclude] = useState<SelectedTaxon[]>([])
  const includeRef = useRef<SelectedTaxon[]>([])
  const excludeRef = useRef<SelectedTaxon[]>([])
  const model = useMemo(() => createTaxonSearchModel(8), [])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    if (!open || debounced.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    model
      .fetchResults(debounced, model.limit ?? 8)
      .then((items) => {
        if (cancelled) return
        setResults(
          (items ?? []).map((item) => ({
            taxid: Number(model.getId(item)),
            label: model.getTitle(item) || String(model.getId(item)),
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, debounced, model])

  const setInclude = (next: SelectedTaxon[]) => {
    includeRef.current = next
    setDraftInclude(next)
  }
  const setExclude = (next: SelectedTaxon[]) => {
    excludeRef.current = next
    setDraftExclude(next)
  }

  const assign = (taxon: SelectedTaxon, side: "include" | "exclude") => {
    if (!Number.isFinite(taxon.taxid)) return
    const inInclude = includeRef.current.some((item) => item.taxid === taxon.taxid)
    const inExclude = excludeRef.current.some((item) => item.taxid === taxon.taxid)
    if (side === "include" && inInclude) {
      setInclude(includeRef.current.filter((item) => item.taxid !== taxon.taxid))
      return
    }
    if (side === "exclude" && inExclude) {
      setExclude(excludeRef.current.filter((item) => item.taxid !== taxon.taxid))
      return
    }
    if (side === "include") {
      if (includeRef.current.length >= MAX_TAXIDS) return
      setExclude(excludeRef.current.filter((item) => item.taxid !== taxon.taxid))
      setInclude([...includeRef.current, taxon])
      return
    }
    if (excludeRef.current.length >= MAX_TAXIDS) return
    setInclude(includeRef.current.filter((item) => item.taxid !== taxon.taxid))
    setExclude([...excludeRef.current, taxon])
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      includeRef.current = [...includeTaxa]
      excludeRef.current = [...excludeTaxa]
      setDraftInclude(includeRef.current)
      setDraftExclude(excludeRef.current)
      setQuery("")
      setDebounced("")
      setResults([])
      setOpen(true)
      return
    }
    setOpen(false)
    const include = includeRef.current
    const exclude = excludeRef.current
    if (!sameTaxa(include, includeTaxa) || !sameTaxa(exclude, excludeTaxa)) {
      onApply(include, exclude)
    }
  }

  const total = includeTaxa.length + excludeTaxa.length

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-xl"
          disabled={disabled}
        >
          <Network className="h-4 w-4" />
          Taxa
          {total > 0 && (
            <span className="tabular-nums text-muted-foreground">{total}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3 p-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a taxon"
          className="h-9 rounded-xl shadow-sm bg-background/70 dark:bg-muted/40 text-foreground border border-border hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:border-primary/60 transition-colors placeholder:text-muted-foreground"
        />
        <div className="max-h-40 overflow-y-auto">
          {searching && (
            <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
          )}
          {!searching && debounced.length >= 2 && results.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted-foreground">No taxa found.</p>
          )}
          {results.map((taxon) => {
            const included = draftInclude.some((item) => item.taxid === taxon.taxid)
            const excluded = draftExclude.some((item) => item.taxid === taxon.taxid)
            return (
              <div
                key={taxon.taxid}
                className="flex items-center gap-2 rounded-md px-1 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm" title={taxon.label}>
                  {taxon.label}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={included ? "secondary" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => assign(taxon, "include")}
                >
                  {included ? "Included" : "Include"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={excluded ? "destructive" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => assign(taxon, "exclude")}
                >
                  {excluded ? "Excluded" : "Exclude"}
                </Button>
              </div>
            )
          })}
        </div>
        <DraftList
          title="Include"
          side="include"
          taxa={draftInclude}
          onRemove={(taxid) =>
            setInclude(includeRef.current.filter((item) => item.taxid !== taxid))
          }
        />
        <DraftList
          title="Exclude"
          side="exclude"
          taxa={draftExclude}
          onRemove={(taxid) =>
            setExclude(excludeRef.current.filter((item) => item.taxid !== taxid))
          }
        />
      </PopoverContent>
    </Popover>
  )
}

function DraftList({
  title,
  side,
  taxa,
  onRemove,
}: {
  title: string
  side: "include" | "exclude"
  taxa: SelectedTaxon[]
  onRemove: (taxid: number) => void
}) {
  const Icon = side === "include" ? IncludeTaxonIcon : ExcludeTaxonIcon
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon />
        {title}
      </p>
      {taxa.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {taxa.map((taxon) => (
            <FilterChip
              key={taxon.taxid}
              label={taxon.label}
              value={String(taxon.taxid)}
              icon={<Icon />}
              colorScheme={TAXON_CHIP_COLORS}
              onRemove={() => onRemove(taxon.taxid)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
