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
  defaultCoverageRange,
  isDefaultCoverageRange,
  type CoverageRange,
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

function chipLabel(range: CoverageRange | null, termCount: number): string {
  if (!range || isDefaultCoverageRange(range, termCount)) {
    return `Names matched: any of ${termCount}`
  }
  if (range.min === range.max) {
    return `Names matched: ${range.min} of ${termCount}`
  }
  return `Names matched: ${range.min}-${range.max} of ${termCount}`
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
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)
  const dragging = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bins = useMemo(
    () => buildCoverageBins(matchedCounts, termCount),
    [matchedCounts, termCount],
  )
  const maxCount = useMemo(
    () => bins.reduce((m, b) => Math.max(m, b.count), 0),
    [bins],
  )

  const active = range != null && !isDefaultCoverageRange(range, termCount)

  const selection = useMemo(() => {
    if (dragStart != null && dragEnd != null) {
      const a = bins[Math.min(dragStart, dragEnd)]
      const b = bins[Math.max(dragStart, dragEnd)]
      if (a && b) return { min: a.minK, max: b.maxK }
    }
    return range ?? defaultCoverageRange(termCount)
  }, [bins, dragStart, dragEnd, range, termCount])

  const commit = useCallback(
    (next: CoverageRange) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (isDefaultCoverageRange(next, termCount)) onChange(null)
        else onChange(next)
      }, 150)
    },
    [onChange, termCount],
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const onPointerDown = (index: number, e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    setDragStart(index)
    setDragEnd(index)
  }

  const onPointerEnter = (index: number) => {
    setHoverIndex(index)
    if (dragging.current && dragStart != null) setDragEnd(index)
  }

  const onPointerUp = () => {
    if (!dragging.current) return
    dragging.current = false
    if (dragStart != null && dragEnd != null) {
      const a = bins[Math.min(dragStart, dragEnd)]
      const b = bins[Math.max(dragStart, dragEnd)]
      if (a && b) commit({ min: a.minK, max: b.maxK })
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
      const bin = bins[focusIndex]
      if (bin) commit({ min: bin.minK, max: bin.maxK })
    }
  }

  const tipBin = bins[hoverIndex ?? focusIndex]

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
          {chipLabel(range, termCount)}
          <span className="text-muted-foreground">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="text-xs font-medium">Names matched</span>
          <Button
            type="button"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={() => onChange(null)}
          >
            Reset
          </Button>
        </div>
        <div className="space-y-2 p-3">
        <div
          className="relative h-16 flex items-end gap-px"
          role="listbox"
          aria-label="Matched names coverage"
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
            const selected =
              bin.maxK >= selection.min && bin.minK <= selection.max
            return (
              <button
                key={`${bin.minK}-${bin.maxK}`}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={coverageBarLabel(bin, termCount)}
                title={coverageBarLabel(bin, termCount)}
                className="relative flex-1 min-w-[3px] h-full flex items-end focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onFocus={() => setFocusIndex(index)}
                onPointerDown={(e) => onPointerDown(index, e)}
                onPointerEnter={() => onPointerEnter(index)}
                onClick={() => commit({ min: bin.minK, max: bin.maxK })}
              >
                <span
                  className={cn(
                    "w-full rounded-t-sm",
                    selected
                      ? "bg-primary"
                      : "bg-muted-foreground/35 hover:bg-muted-foreground/60",
                  )}
                  style={{
                    height: `${Math.max(heightPct, bin.count > 0 ? 6 : 0)}%`,
                  }}
                />
              </button>
            )
          })}
        </div>
        {tipBin && (
          <p className="text-[11px] text-muted-foreground">
            {coverageBarLabel(tipBin, termCount)}
          </p>
        )}
        </div>
        <div className="border-t border-border/60 bg-muted/20 px-3 py-1.5">
          <p className="text-[10px] text-muted-foreground tabular-nums">
            0…{termCount}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
