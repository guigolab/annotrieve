"use client"

import { cn } from "@/lib/utils"

export type GenesMobileView = "overview" | "annotations"

interface GenesViewSwitcherProps {
  value: GenesMobileView
  onChange: (view: GenesMobileView) => void
  annotationCount?: number
  className?: string
}

export function GenesViewSwitcher({
  value,
  onChange,
  annotationCount,
  className,
}: GenesViewSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Results view"
      className={cn(
        "flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium",
        className,
      )}
    >
      {(
        [
          { id: "overview" as const, label: "Overview" },
          {
            id: "annotations" as const,
            label:
              annotationCount != null
                ? `Annotations (${annotationCount.toLocaleString()})`
                : "Annotations",
          },
        ] as const
      ).map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 transition-colors",
            value === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
