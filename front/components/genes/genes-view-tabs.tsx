"use client"

import { useCallback, useRef, type KeyboardEvent } from "react"

import type { GenesView } from "@/lib/genes/view"
import { cn } from "@/lib/utils"

interface GenesViewTabsProps {
  view: GenesView
  onViewChange: (view: GenesView) => void
  annotationTotal: number
  pinCount: number
  className?: string
}

const TABS: { id: GenesView; label: string }[] = [
  { id: "distribution", label: "Distribution" },
  { id: "annotations", label: "Annotations" },
  { id: "compare", label: "Compare" },
]

export function GenesViewTabs({
  view,
  onViewChange,
  annotationTotal,
  pinCount,
  className,
}: GenesViewTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusTab = useCallback((index: number) => {
    const el = tabRefs.current[index]
    el?.focus()
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent, index: number) => {
      let next = index
      if (e.key === "ArrowRight") next = (index + 1) % TABS.length
      else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length
      else if (e.key === "Home") next = 0
      else if (e.key === "End") next = TABS.length - 1
      else return
      e.preventDefault()
      onViewChange(TABS[next]!.id)
      focusTab(next)
    },
    [focusTab, onViewChange],
  )

  return (
    <div
      role="tablist"
      aria-label="Genes views"
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5",
        className,
      )}
    >
      {TABS.map((tab, index) => {
        const selected = view === tab.id
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el
            }}
            type="button"
            role="tab"
            id={`genes-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={selected ? `genes-panel-${tab.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onViewChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium outline-none transition-colors sm:px-3 sm:text-sm",
              "focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.id === "annotations" && annotationTotal > 0 ? (
              <span className="tabular-nums text-xs text-muted-foreground">
                {annotationTotal.toLocaleString()}
              </span>
            ) : null}
            {tab.id === "compare" && pinCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
                {pinCount}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
