"use client"

import { useEffect, useRef } from "react"
import { Info, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { GLASS_PANEL, GLASS_PANEL_PADDING } from "./taxonomy-types"

const RANK_RESET_MESSAGE =
  "The root is at or below the selected leaf rank. Rank selector has been reset to All leaves."

const AUTO_DISMISS_MS = 5000

export interface RankResetToastProps {
  open: boolean
  onClose: () => void
  message?: string
  className?: string
}

export function RankResetToast({
  open,
  onClose,
  message = RANK_RESET_MESSAGE,
  className,
}: RankResetToastProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      onClose()
    }, AUTO_DISMISS_MS)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        GLASS_PANEL,
        GLASS_PANEL_PADDING,
        "pointer-events-auto flex items-start gap-2 shadow-md max-w-[280px]",
        "animate-in fade-in slide-in-from-right-4 duration-200",
        className
      )}
    >
      <Info
        className="h-4 w-4 shrink-0 text-primary mt-0.5"
        aria-hidden
      />
      <p className="text-xs text-foreground leading-snug flex-1 min-w-0">
        {message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className={cn(
          "shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
