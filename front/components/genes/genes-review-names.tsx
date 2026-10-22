"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronRight, X } from "lucide-react"

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

interface PrefixGroup {
  prefix: string
  names: ResolvedTerm[]
}

interface GenesReviewNamesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  terms: ResolvedTerm[]
  hitTerms: HitTerm[]
  excluded: Set<string>
  prefixExpansions: { prefix: string; count: number }[]
  onApply: (excluded: Set<string>) => void
  onRemoveName: (name: string) => void
  children: React.ReactNode
}

function groupByPrefix(
  terms: ResolvedTerm[],
  expansions: { prefix: string; count: number }[],
): { singles: ResolvedTerm[]; groups: PrefixGroup[] } {
  const assigned = new Set<string>()
  const groups: PrefixGroup[] = []
  for (const exp of expansions) {
    const stem = exp.prefix.replace(/\*$/, "").toLowerCase()
    if (stem.length < 3) continue
    const names = terms.filter((t) => t.id.startsWith(stem))
    if (!names.length) continue
    for (const n of names) assigned.add(n.id)
    groups.push({ prefix: exp.prefix, names })
  }
  const singles = terms.filter((t) => !assigned.has(t.id))
  return { singles, groups }
}

export function GenesReviewNames({
  open,
  onOpenChange,
  terms,
  hitTerms,
  excluded,
  prefixExpansions,
  onApply,
  onRemoveName,
  children,
}: GenesReviewNamesProps) {
  const [filter, setFilter] = useState("")
  const [draftExcluded, setDraftExcluded] = useState<Set<string>>(
    () => new Set(excluded),
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (open) {
      setDraftExcluded(new Set(excluded))
      setFilter("")
    }
  }, [open, excluded])

  const matchedNothing = useMemo(() => {
    return hitTerms.filter((t) => t.n_hits === 0).map((t) => t.input)
  }, [hitTerms])

  const ambiguous = useMemo(() => {
    return terms.filter((t) => t.viaAlias)
  }, [terms])

  const { singles, groups } = useMemo(
    () => groupByPrefix(terms, prefixExpansions),
    [terms, prefixExpansions],
  )

  const q = filter.trim().toLowerCase()
  const matchQ = (name: string) => !q || name.toLowerCase().includes(q)

  const selectedCount = terms.filter(
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

  const setGroup = (names: ResolvedTerm[], checked: boolean) => {
    setDraftExcluded((prev) => {
      const next = new Set(prev)
      for (const n of names) {
        if (checked) next.delete(n.id)
        else next.add(n.id)
      }
      return next
    })
  }

  const groupState = (names: ResolvedTerm[]): boolean | "indeterminate" => {
    const checked = names.filter((n) => !draftExcluded.has(n.id)).length
    if (checked === 0) return false
    if (checked === names.length) return true
    return "indeterminate"
  }

  const selectAll = () => setDraftExcluded(new Set())
  const clearAll = () =>
    setDraftExcluded(new Set(terms.map((t) => t.id)))
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

  const renderRow = (term: ResolvedTerm) => {
    if (!matchQ(term.name)) return null
    const checked = !draftExcluded.has(term.id)
    return (
      <label
        key={term.id}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => toggleName(term.id, v === true)}
        />
        <span className="font-mono text-xs truncate flex-1" title={term.name}>
          {term.name}
        </span>
        {term.viaAlias && (
          <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">
            via alias
          </span>
        )}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {term.count.toLocaleString()}
        </span>
      </label>
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] p-0 flex flex-col max-h-[60vh]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="shrink-0 p-3 border-b border-border/60 space-y-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter names"
            className="h-9 rounded-xl shadow-sm bg-background/70 dark:bg-muted/40 text-foreground border border-border hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:border-primary/60 transition-colors placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-1 py-2 space-y-3">
          {(matchedNothing.length > 0 || ambiguous.length > 0) && (
            <div className="px-2 space-y-1.5">
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Needs attention
              </p>
              {matchedNothing.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs"
                >
                  <span className="font-mono flex-1 truncate">{name}</span>
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
              {ambiguous.slice(0, 8).map((term) => (
                <div
                  key={`amb-${term.id}`}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs"
                >
                  <span className="font-mono flex-1 truncate">{term.name}</span>
                  <span className="text-muted-foreground">via alias</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-0.5">
            {singles.map(renderRow)}
          </div>

          {groups.map((group) => {
            const openGroup = !collapsed.has(group.prefix)
            const state = groupState(group.names)
            const visible = group.names.filter((n) => matchQ(n.name))
            if (q && !visible.length) return null
            return (
              <div key={group.prefix} className="space-y-0.5">
                <div className="flex items-center gap-1.5 px-2 py-1">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(group.prefix)) next.delete(group.prefix)
                        else next.add(group.prefix)
                        return next
                      })
                    }
                    aria-label={
                      openGroup
                        ? `Collapse ${group.prefix}`
                        : `Expand ${group.prefix}`
                    }
                  >
                    {openGroup ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <Checkbox
                    checked={
                      state === "indeterminate" ? "indeterminate" : state
                    }
                    onCheckedChange={(v) =>
                      setGroup(group.names, v === true)
                    }
                  />
                  <span className="text-xs font-medium font-mono">
                    {group.prefix}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    · {group.names.length} names
                  </span>
                </div>
                {openGroup && visible.map(renderRow)}
              </div>
            )
          })}

          {!terms.length && (
            <p className="px-2 py-6 text-sm text-muted-foreground text-center">
              No resolved names yet.
            </p>
          )}
        </div>

        <footer className="shrink-0 border-t border-border/60 bg-muted/20 px-3 py-2 flex flex-wrap items-center gap-2">
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
