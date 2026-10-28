"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  buildCoverageBins,
  coverageBarLabel,
  namesMatchedChipLabel,
  type CoverageBin,
  type CoverageRange,
  type CoverageSegment,
} from "@/lib/genes/coverage"
import { cn } from "@/lib/utils"

interface GenesCoveragePopoverProps {
  matchedCounts: number[]
  termCount: number
  range: CoverageRange | null
  onChange: (range: CoverageRange | null) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
}

function binKey(bin: CoverageBin): string {
  return `${bin.minK}-${bin.maxK}`
}

function rangeFromPicked(
  bins: CoverageBin[],
  picked: Set<string>,
): CoverageRange | null {
  if (!picked.size) return null
  // Selecting every visible (non-zero) bin ≡ no coverage filter.
  if (picked.size === bins.length) return null

  const segments: CoverageSegment[] = []
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const bin of bins) {
    if (!picked.has(binKey(bin))) continue
    segments.push({ min: bin.minK, max: bin.maxK })
    min = Math.min(min, bin.minK)
    max = Math.max(max, bin.maxK)
  }
  if (!segments.length || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null
  }
  return { min, max, segments }
}

function pickedFromRange(
  bins: CoverageBin[],
  range: CoverageRange | null,
): Set<string> {
  if (!range) return new Set()
  const next = new Set<string>()
  if (range.segments?.length) {
    const keys = new Set(
      range.segments.map((s) => `${s.min}-${s.max}`),
    )
    for (const bin of bins) {
      if (keys.has(binKey(bin))) next.add(binKey(bin))
    }
    return next
  }
  for (const bin of bins) {
    if (bin.maxK >= range.min && bin.minK <= range.max) {
      next.add(binKey(bin))
    }
  }
  return next
}

export function GenesCoveragePopover({
  matchedCounts,
  termCount,
  range,
  onChange,
  open,
  onOpenChange,
  disabled,
}: GenesCoveragePopoverProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const dragging = useRef(false)
  const didDrag = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bins = useMemo(
    () =>
      buildCoverageBins(matchedCounts, termCount).filter((b) => b.count > 0),
    [matchedCounts, termCount],
  )
  const maxCount = useMemo(
    () => bins.reduce((m, b) => Math.max(m, b.count), 0),
    [bins],
  )
  const axisMin = bins[0]?.minK ?? 0
  const axisMax = bins[bins.length - 1]?.maxK ?? termCount

  const active = range != null

  // Sync pick set from committed range when popover opens or data changes.
  useEffect(() => {
    if (!open) return
    setPicked(pickedFromRange(bins, range))
    setFocusIndex(0)
  }, [open, bins, range])

  const previewPicked = useMemo(() => {
    if (dragStart == null || dragEnd == null) return picked
    const lo = Math.min(dragStart, dragEnd)
    const hi = Math.max(dragStart, dragEnd)
    const next = new Set(picked)
    for (let i = lo; i <= hi; i++) {
      const bin = bins[i]
      if (bin) next.add(binKey(bin))
    }
    return next
  }, [bins, dragStart, dragEnd, picked])

  const commit = useCallback(
    (nextPicked: Set<string>) => {
      setPicked(nextPicked)
      const next = rangeFromPicked(bins, nextPicked)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(next)
      }, 150)
    },
    [bins, onChange],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const toggleBin = (index: number) => {
    const bin = bins[index]
    if (!bin) return
    const key = binKey(bin)
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    commit(next)
  }

  const onPointerDown = (index: number, e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    didDrag.current = false
    setDragStart(index)
    setDragEnd(index)
  }

  const onPointerEnter = (index: number) => {
    setHoverIndex(index)
    if (dragging.current && dragStart != null) {
      if (index !== dragStart) didDrag.current = true
      setDragEnd(index)
    }
  }

  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = false
    if (didDrag.current && dragStart != null && dragEnd != null) {
      const lo = Math.min(dragStart, dragEnd)
      const hi = Math.max(dragStart, dragEnd)
      const next = new Set(picked)
      for (let i = lo; i <= hi; i++) {
        const bin = bins[i]
        if (bin) next.add(binKey(bin))
      }
      commit(next)
    }
    setDragStart(null)
    setDragEnd(null)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!bins.length) return
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault()
      const delta = e.key === "ArrowRight" ? 1 : -1
      setFocusIndex((i) => Math.max(0, Math.min(bins.length - 1, i + delta)))
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggleBin(focusIndex)
    }
  }

  const tipBin = bins[hoverIndex ?? focusIndex]
  const selectedCount = previewPicked.size

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || termCount <= 0}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "border-primary/40 bg-primary/10 text-foreground"
              : "border-border bg-background text-foreground hover:bg-muted/50",
            disabled && "opacity-50",
          )}
        >
          {namesMatchedChipLabel(range, termCount)}
          <span className="text-muted-foreground">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] overflow-hidden p-0">
        <div className="flex items-start justify-between gap-2 border-b border-border/60 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium">Best matches</p>
            <p className="text-[10px] text-muted-foreground">
              Keep annotations that hit the most queried names
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => {
              setPicked(new Set())
              onChange(null)
            }}
          >
            Reset
          </Button>
        </div>
        <div className="space-y-2 p-3">
          <div
            className="relative flex h-16 items-end gap-px"
            role="listbox"
            aria-multiselectable
            aria-label="Filter annotations by number of matched names"
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              setHoverIndex(null)
              if (dragging.current) onPointerUp()
            }}
          >
            {bins.map((bin, index) => {
              const heightPct =
                maxCount > 0 ? (bin.count / maxCount) * 100 : 0
              const selected = previewPicked.has(binKey(bin))
              return (
                <button
                  key={binKey(bin)}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-label={coverageBarLabel(bin, termCount)}
                  className="relative flex h-full min-w-[3px] flex-1 items-end focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onFocus={() => setFocusIndex(index)}
                  onPointerDown={(e) => onPointerDown(index, e)}
                  onPointerEnter={() => onPointerEnter(index)}
                  onClick={() => {
                    if (didDrag.current) return
                    toggleBin(index)
                  }}
                >
                  <span
                    className={cn(
                      "w-full rounded-t-sm",
                      selected
                        ? "bg-primary"
                        : "bg-muted-foreground/35 hover:bg-muted-foreground/60",
                    )}
                    style={{
                      height: `${Math.max(heightPct, 6)}%`,
                    }}
                  />
                </button>
              )
            })}
          </div>
          {tipBin ? (
            <p className="text-[11px] text-muted-foreground">
              {coverageBarLabel(tipBin, termCount)}
              {selectedCount > 0 ? (
                <span className="text-muted-foreground/80">
                  {" "}
                  · {selectedCount} bin{selectedCount === 1 ? "" : "s"} selected
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Click bars to multi-select; drag to add a range.
            </p>
          )}
        </div>
        <div className="border-t border-border/60 bg-muted/20 px-3 py-1.5">
          <p className="text-[10px] tabular-nums text-muted-foreground">
            {bins.length
              ? `${axisMin}…${axisMax} of ${termCount}`
              : `0…${termCount}`}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
