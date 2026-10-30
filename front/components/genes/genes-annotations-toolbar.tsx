"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Download, Pin, Search, SlidersHorizontal, X } from "lucide-react"

import { GenesCoverageHistogram } from "@/components/genes/genes-coverage-popover"
import { GenesSegmentedControl } from "@/components/genes/genes-segmented-control"
import { GenesViewToolbar } from "@/components/genes/genes-view-toolbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { type KeepPolicy } from "@/lib/genes/annotations-controls"
import {
  useCompareStore,
  type PinMode,
} from "@/lib/genes/compare-store"
import type { CoverageRange } from "@/lib/genes/coverage"
import { isDefaultCoverageRange } from "@/lib/genes/coverage"
import { ALL_SOURCE_CODES } from "@/lib/genes/filters"
import { GENES_TSV_DOWNLOAD_CAP, SOURCE_DEFS, TOGGLE_CHIP_CLASS } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

const KEEP_HELP: Record<KeepPolicy, string> = {
  all: "Show every matching annotation.",
  best: "One annotation per organism with the most matched genes.",
  latest: "One annotation per organism with the newest release.",
}

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
  matchedCounts: number[]
  visibleTotal: number
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
  matchedCounts,
  visibleTotal,
  showReset,
  onReset,
  onDownload,
  downloadDisabled,
  className,
}: GenesAnnotationsToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchDraft, setSearchDraft] = useState(search)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const pinMode = useCompareStore((s) => s.pinMode)
  const setPinMode = useCompareStore((s) => s.setPinMode)

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  useEffect(() => {
    if (searchDraft === search) return
    const t = window.setTimeout(() => onSearchChange(searchDraft), 150)
    return () => window.clearTimeout(t)
  }, [searchDraft, search, onSearchChange])

  useEffect(() => {
    const isTypingTarget = (t: HTMLElement | null) =>
      Boolean(
        t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable),
      )

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (isTypingTarget(t)) return
      if (e.key === "/") {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault()
        const next: PinMode = pinMode === "inspect" ? "pin" : "inspect"
        setPinMode(next)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pinMode, setPinMode])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (sources.size < ALL_SOURCE_CODES.length) n += 1
    if (coverage != null && !isDefaultCoverageRange(coverage, termCount)) n += 1
    if (keep !== "all") n += 1
    return n
  }, [sources, coverage, termCount, keep])

  return (
    <GenesViewToolbar className={cn(className)}>
      <div className="relative w-56 max-w-full shrink-0">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={searchRef}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search organisms…"
          aria-label="Search organisms"
          className="h-9 pl-9 pr-8 text-sm"
        />
        {searchDraft ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
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

      <GenesSegmentedControl
        label="Cell click action"
        value={pinMode}
        onChange={setPinMode}
        options={[
          { id: "inspect", label: "Inspect" },
          {
            id: "pin",
            label: (
              <span className="inline-flex items-center gap-1">
                <Pin className="h-3 w-3" aria-hidden />
                Pin
              </span>
            ),
          },
        ]}
      />

      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            aria-label="Filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[28rem] space-y-0 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            <p className="text-xs font-medium">Filters</p>
            {showReset ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  onReset()
                  setFiltersOpen(false)
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>

          <div className="space-y-1.5 border-b border-border/60 px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">Keep</p>
            <GenesSegmentedControl
              label="Keep policy"
              value={keep}
              stretch
              size="sm"
              onChange={onKeepChange}
              options={[
                { id: "all", label: "All" },
                { id: "best", label: "Best match" },
                { id: "latest", label: "Latest" },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              {KEEP_HELP[keep]}
            </p>
          </div>

          <div className="space-y-1.5 border-b border-border/60 px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">Source</p>
            <div
              role="group"
              aria-label="Source"
              className="flex flex-wrap gap-1.5"
            >
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
                      TOGGLE_CHIP_CLASS,
                      checked
                        ? "border-border bg-background text-foreground"
                        : "border-transparent bg-muted/50 text-muted-foreground opacity-60",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: source.color }}
                      aria-hidden
                    />
                    {source.label}
                    <span className="tabular-nums text-muted-foreground">
                      {count.toLocaleString()}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {termCount >= 2 ? (
            <div className="space-y-1.5 px-3 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                Coverage
              </p>
              <GenesCoverageHistogram
                matchedCounts={matchedCounts}
                termCount={termCount}
                range={coverage}
                onChange={onCoverageChange}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      <div className="ml-auto">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
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
    </GenesViewToolbar>
  )
}
