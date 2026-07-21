"use client"

import { Button } from "@/components/ui/button"
import { Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface FilterChipProps {
  label: string
  value: string
  onRemove: () => void
  icon?: ReactNode
  onClick?: () => void
  isActive?: boolean
  readOnly?: boolean
  /** True while URL stub label is being hydrated (taxon name, etc.). */
  isLoading?: boolean
  colorScheme: {
    bg: string
    bgHover: string
    border: string
    text: string
  }
}

export function FilterChip({
  label,
  onRemove,
  icon,
  onClick,
  colorScheme,
  isActive = false,
  readOnly = false,
  isLoading = false,
}: FilterChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs flex-shrink-0 transition-colors",
        colorScheme.bg,
        colorScheme.border,
        colorScheme.bgHover,
        onClick && !isLoading && "cursor-pointer",
        isActive && "border-primary bg-primary/10",
        isLoading && "opacity-80"
      )}
      onClick={isLoading ? undefined : onClick}
      role={onClick && !isLoading ? "button" : undefined}
      tabIndex={onClick && !isLoading ? 0 : undefined}
      aria-pressed={onClick && !isLoading ? isActive : undefined}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      <span
        className={cn(
          "font-medium whitespace-nowrap",
          colorScheme.text,
          isLoading && "text-muted-foreground animate-pulse"
        )}
      >
        {label}
      </span>
      {!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 hover:bg-destructive/10 hover:text-destructive"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          title="Remove filter"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}
