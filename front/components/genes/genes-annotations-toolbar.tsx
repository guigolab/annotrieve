"use client"

import { useEffect, useRef, useState } from "react"
import { Download, MoreHorizontal, Search, X } from "lucide-react"

import { GenesCoveragePopover } from "@/components/genes/genes-coverage-popover"
import { Button } from "@/components/ui/button"
import {
  type AnnotationsSort,
  type KeepPolicy,
} from "@/lib/genes/annotations-controls"
import type { CoverageRange } from "@/lib/genes/coverage"
import { GENES_TSV_DOWNLOAD_CAP, PILL_CLASS, SOURCE_DEFS } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

interface GenesAnnotationsToolbarProps {
  search: string
  onSearchChange: (q: string) => void
  keep: KeepPolicy
  onKeepChange: (k: KeepPolicy) => void
  sources: Set<number>
  sourceCounts: Map<number, number>
  onToggleSource: (code: number) => void
  termCount: number
  coverage: CoverageRange | null
  onCoverageChange: (range: CoverageRange | null) => void
  coverageOpen: boolean
  onCoverageOpenChange: (open: boolean) => void
  matchedCounts: number[]
  sort: AnnotationsSort
  onSortChange: (s: AnnotationsSort) => void
  visibleTotal: number
  overviewTotal: number
  keptTotal: number
  visibleSpecies: number
  showReset: boolean
  onReset: () => void
  onDownload: () => void
  downloadDisabled?: boolean
  className?: string
}

export function GenesAnnotationsToolbar({
  search,
  onSearchChange,
  keep,
  onKeepChange,
  sources,
  sourceCounts,
  onToggleSource,
  termCount,
  coverage,
  onCoverageChange,
  coverageOpen,
  onCoverageOpenChange,
  matchedCounts,
  sort,
  onSortChange,
  visibleTotal,
  overviewTotal,
  keptTotal,
  visibleSpecies,
  showReset,
  onReset,
  onDownload,
  downloadDisabled,
  className,
}: GenesAnnotationsToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchDraft, setSearchDraft] = useState(search)

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  useEffect(() => {
    if (searchDraft === search) return
    const t = window.setTimeout(() => onSearchChange(searchDraft), 150)
    return () => window.clearTimeout(t)
  }, [searchDraft, search, onSearchChange])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border bg-card/40 px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 basis-[12rem]">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={searchRef}
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search organisms…"
            aria-label="Search organisms"
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {searchDraft ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearchDraft("")
                onSearchChange("")
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <label className="inline-flex h-8 items-center gap-1 text-xs text-muted-foreground">
          Keep
          <select
            className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            value={keep}
            aria-label="Keep policy"
            onChange={(e) => onKeepChange(e.target.value as KeepPolicy)}
          >
            <option value="all">All</option>
            <option value="best">Best match</option>
            <option value="latest">Latest</option>
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-1">
          {SOURCE_DEFS.map((source) => {
            const checked = sources.has(source.code)
            const count = sourceCounts.get(source.code) ?? 0
            return (
              <button
                key={source.code}
                type="button"
                aria-pressed={checked}
                onClick={() => onToggleSource(source.code)}
                className={cn(
                  PILL_CLASS,
                  "h-8",
                  checked
                    ? "border-border bg-background text-foreground"
                    : "border-transparent bg-muted/50 text-muted-foreground opacity-60",
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: source.color }}
                />
                <span>{source.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {count.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>

        {termCount >= 2 ? (
          <GenesCoveragePopover
            matchedCounts={matchedCounts}
            termCount={termCount}
            range={coverage}
            onChange={onCoverageChange}
            open={coverageOpen}
            onOpenChange={onCoverageOpenChange}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                aria-label="Coverage options"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                Coverage
              </Button>
            }
          />
        ) : null}

        <label className="inline-flex h-8 items-center gap-1 text-xs text-muted-foreground">
          Sort
          <select
            className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as AnnotationsSort)}
          >
            <option value="coverage">Coverage</option>
            <option value="species">Organism A–Z</option>
            <option value="release">Release newest</option>
            <option value="source">Source</option>
          </select>
        </label>

        <span
          className="ml-auto text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {visibleTotal.toLocaleString()} annotations ·{" "}
          {visibleSpecies.toLocaleString()} organisms
          {overviewTotal > 0
            ? ` (of ${overviewTotal.toLocaleString()})`
            : null}
          {keep !== "all" && keptTotal !== visibleTotal
            ? ` · showing ${visibleTotal.toLocaleString()} of ${keptTotal.toLocaleString()}`
            : keep !== "all"
              ? ` · showing ${keptTotal.toLocaleString()} of ${overviewTotal || keptTotal}`
              : null}
        </span>

        {showReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onReset}
          >
            Reset
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={downloadDisabled || visibleTotal === 0}
          onClick={onDownload}
        >
          <Download className="h-3.5 w-3.5" />
          Download TSV
          {visibleTotal > GENES_TSV_DOWNLOAD_CAP ? (
            <span className="text-muted-foreground">
              (first {GENES_TSV_DOWNLOAD_CAP.toLocaleString()})
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  )
}
