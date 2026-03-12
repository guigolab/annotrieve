"use client"

import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
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
  colorScheme: {
    bg: string
    bgHover: string
    border: string
    text: string
  }
}

export function FilterChip({ label, onRemove, icon, onClick, colorScheme, isActive = false, readOnly = false }: FilterChipProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs flex-shrink-0 transition-colors",
        colorScheme.bg,
        colorScheme.border,
        colorScheme.bgHover,
        onClick && "cursor-pointer",
        isActive && "border-primary bg-primary/10"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? isActive : undefined}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className={cn("font-medium whitespace-nowrap", colorScheme.text)}>{label}</span>
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

