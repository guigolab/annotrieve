"use client"

import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import { cn } from "@/lib/utils"

interface GenesReviewNamesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  terms: ResolvedTerm[]
  hitTerms: HitTerm[]
  excluded: Set<string>
  onApply: (excluded: Set<string>) => void
  onRemoveName: (name: string) => void
  children: React.ReactNode
}

export function GenesReviewNames({
  open,
  onOpenChange,
  terms,
  hitTerms,
  excluded,
  onApply,
  onRemoveName,
  children,
}: GenesReviewNamesProps) {
  const [filter, setFilter] = useState("")
  const [draftExcluded, setDraftExcluded] = useState<Set<string>>(
    () => new Set(excluded),
  )

  useEffect(() => {
    if (open) {
      setDraftExcluded(new Set(excluded))
      setFilter("")
    }
  }, [open, excluded])

  const matchedNothing = useMemo(() => {
    return hitTerms.filter((t) => t.n_hits === 0).map((t) => t.input)
  }, [hitTerms])

  const withCounts = useMemo(
    () => terms.filter((t) => t.count > 0),
    [terms],
  )

  const q = filter.trim().toLowerCase()
  const visible = useMemo(
    () =>
      withCounts.filter(
        (t) => !q || t.name.toLowerCase().includes(q),
      ),
    [withCounts, q],
  )

  const maxCount = useMemo(
    () => visible.reduce((m, t) => Math.max(m, t.count), 0),
    [visible],
  )

  const selectedCount = withCounts.filter(
    (t) => !draftExcluded.has(t.id),
  ).length
  const canApply = selectedCount > 0

  const toggleName = (id: string, checked: boolean) => {
    setDraftExcluded((prev) => {
      const next = new Set(prev)
      if (checked) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setDraftExcluded(new Set())
  const clearAll = () =>
    setDraftExcluded(new Set(withCounts.map((t) => t.id)))
  const reset = () => setDraftExcluded(new Set())

  const apply = () => {
    if (!canApply) return
    onApply(draftExcluded)
    onOpenChange(false)
  }

  const cancel = () => {
    setDraftExcluded(new Set(excluded))
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[60vh] w-[420px] flex-col p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter names"
            className="h-9 rounded-xl border border-border bg-background/70 text-foreground shadow-sm transition-colors placeholder:text-muted-foreground hover:border-primary/50 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 dark:bg-muted/40"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-2">
          {matchedNothing.length > 0 && (
            <div className="space-y-1.5 px-2">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Needs attention
              </p>
              {matchedNothing.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs"
                >
                  <span className="flex-1 truncate font-mono">{name}</span>
                  <span className="text-muted-foreground">matched nothing</span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${name}`}
                    onClick={() => onRemoveName(name)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-0.5" role="listbox" aria-multiselectable>
            {visible.map((term) => {
              const checked = !draftExcluded.has(term.id)
              const widthPct =
                maxCount > 0 ? (term.count / maxCount) * 100 : 0
              return (
                <label
                  key={term.id}
                  role="option"
                  aria-selected={checked}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50",
                    !checked && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleName(term.id, v === true)}
                  />
                  <span
                    className="w-[7rem] shrink-0 truncate font-mono text-xs"
                    title={term.name}
                  >
                    {term.name}
                  </span>
                  <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/40">
                    <span
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-sm",
                        checked ? "bg-primary/80" : "bg-muted-foreground/35",
                      )}
                      style={{
                        width: `${Math.max(widthPct, term.count > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {term.count.toLocaleString()}
                  </span>
                </label>
              )
            })}
          </div>

          {!withCounts.length ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No names with hits yet.
            </p>
          ) : !visible.length ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No names match this filter.
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-muted/20 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={selectAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={clearAll}
          >
            Clear all
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={reset}
          >
            Reset
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {!canApply && (
              <span className="text-[11px] text-muted-foreground">
                Select at least one name
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={cancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-7 px-3 text-xs"
              disabled={!canApply}
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        </footer>
      </PopoverContent>
    </Popover>
  )
}
