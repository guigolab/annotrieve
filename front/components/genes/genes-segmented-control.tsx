"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface GenesSegmentedOption<T extends string> {
  id: T
  label: ReactNode
}

interface GenesSegmentedControlProps<T extends string> {
  label: string
  value: T
  options: GenesSegmentedOption<T>[]
  onChange: (value: T) => void
  className?: string
  size?: "sm" | "md"
  /** Stretch options to fill the control width. */
  stretch?: boolean
}

/** Shared muted-track segmented control used across Genes views. */
export function GenesSegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  size = "md",
  stretch = false,
}: GenesSegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5",
        stretch && "flex w-full",
        size === "sm" ? "h-8" : "h-9",
        className,
      )}
    >
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={cn(
              "rounded-sm px-2.5 text-xs font-medium transition-colors",
              stretch && "flex-1",
              size === "sm" ? "h-7" : "h-8",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
