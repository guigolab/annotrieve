"use client"

import { Pin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCompareStore } from "@/lib/genes/compare-store"
import { toastUndo } from "@/lib/genes/toast-undo"
import { cn } from "@/lib/utils"

interface GenesPinsTrayProps {
  onGoToCompare: () => void
  className?: string
}

export function GenesPinsTray({
  onGoToCompare,
  className,
}: GenesPinsTrayProps) {
  const pins = useCompareStore((s) => s.pins)
  const clearPins = useCompareStore((s) => s.clearPins)
  const setPins = useCompareStore((s) => s.setPins)

  if (!pins.length) return null

  const chips = pins.slice(0, 3).map((p) => ({
    id: p.id,
    label: `${p.species.split(" ").slice(0, 2).join(" ")} · ${p.geneName}`,
  }))
  const extra = pins.length - chips.length

  const onClear = () => {
    const snapshot = [...useCompareStore.getState().pins]
    if (!snapshot.length) return
    clearPins()
    toastUndo(
      `Cleared ${snapshot.length} pin${snapshot.length === 1 ? "" : "s"} · Undo`,
      () => setPins(snapshot),
    )
  }

  return (
    <div
      className={cn("pointer-events-none flex", className)}
      role="region"
      aria-label="Pinned genes"
    >
      <div
        className={cn(
          "pointer-events-auto flex h-full max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        )}
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium">
          <Pin className="h-3.5 w-3.5 fill-current text-primary" aria-hidden />
          {pins.length.toLocaleString()} pinned
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={onGoToCompare}
          >
            Compare
          </Button>
        </div>
      </div>
    </div>
  )
}
