"use client"

import { useEffect, useMemo, useRef } from "react"
import { X } from "lucide-react"

import { GenesAnnotationDetail } from "@/components/genes/genes-annotation-detail"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesDrawer } from "@/lib/genes/store"
import { cn } from "@/lib/utils"

export interface GenePeekState {
  annotationId: string
  species: string
  source: number
  localId: number | null
  geneName: string
  anchorRect: {
    top: number
    left: number
    width: number
    height: number
  }
}

interface GenesGenePeekPopoverProps {
  peek: GenePeekState | null
  adapter: GenesHitsAdapter | null
  activeNames: string[]
  termCount: number
  onClose: () => void
  onSetGene: (localId: number | null) => void
  className?: string
}

export function GenesGenePeekPopover({
  peek,
  adapter,
  activeNames,
  termCount,
  onClose,
  onSetGene,
  className,
}: GenesGenePeekPopoverProps) {
  const open = Boolean(peek)
  const anchorRef = useRef<HTMLDivElement>(null)

  const drawerShape: GenesDrawer | null = useMemo(() => {
    if (!peek) return null
    return {
      annotationId: peek.annotationId,
      localId: peek.localId,
      species: peek.species,
      source: peek.source,
    }
  }, [peek])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [open, onClose])

  if (!peek || !drawerShape) return null

  const { anchorRect } = peek

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      modal={false}
    >
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          aria-hidden
          className="pointer-events-none fixed z-50"
          style={{
            top: anchorRect.top,
            left: anchorRect.left,
            width: Math.max(anchorRect.width, 1),
            height: Math.max(anchorRect.height, 1),
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          "flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0",
          "max-h-[min(70vh,36rem)]",
          className,
        )}
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{peek.geneName}</p>
            <p className="truncate text-xs italic text-muted-foreground">
              {peek.species}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close gene details"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GenesAnnotationDetail
            adapter={adapter}
            drawer={drawerShape}
            activeNames={activeNames}
            termCount={termCount}
            onToggleGene={onSetGene}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
