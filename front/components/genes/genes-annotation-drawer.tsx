"use client"

import { useEffect, useRef } from "react"
import { ExternalLink, X } from "lucide-react"
import Link from "next/link"

import { GenesAnnotationDetail } from "@/components/genes/genes-annotation-detail"
import { Button } from "@/components/ui/button"
import {
  ANNOTATIONS_LIST_PATH,
  ANNOTATION_ID_PARAM,
} from "@/lib/annotations-url"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import { sourceColor, sourceLabel } from "@/lib/genes/hits"
import type { GenesDrawer } from "@/lib/genes/store"
import { cn } from "@/lib/utils"

interface GenesAnnotationDrawerProps {
  open: boolean
  drawer: GenesDrawer | null
  adapter: GenesHitsAdapter | null
  activeNames: string[]
  termCount: number
  assemblyName: string | null
  onClose: () => void
  onSetGene: (localId: number | null) => void
  className?: string
}

export function GenesAnnotationDrawer({
  open,
  drawer,
  adapter,
  activeNames,
  termCount,
  assemblyName,
  onClose,
  onSetGene,
  className,
}: GenesAnnotationDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()
  }, [open, drawer?.annotationId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !drawer) return null

  const species = drawer.species ?? "Annotation"
  const assembly =
    assemblyName ??
    adapter?.rows.find((r) => r.annotationId === drawer.annotationId)
      ?.assemblyName ??
    null
  const source =
    drawer.source ??
    adapter?.rows.find((r) => r.annotationId === drawer.annotationId)?.source ??
    0
  const sources = adapter?.hits.sources
  const openHref = `${ANNOTATIONS_LIST_PATH}?${ANNOTATION_ID_PARAM}=${encodeURIComponent(drawer.annotationId)}`

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={`Annotation ${species}`}
      className={cn(
        "flex h-full w-full shrink-0 flex-col border-l border-border bg-background",
        "lg:w-[640px]",
        className,
      )}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-sm font-semibold italic">{species}</h2>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: sourceColor(source) }}
              aria-hidden
            />
            <span className="shrink-0">{sourceLabel(source, sources)}</span>
            {assembly ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate" title={assembly}>
                  {assembly}
                </span>
              </>
            ) : null}
          </div>
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            title={drawer.annotationId}
          >
            {drawer.annotationId}
          </p>
        </div>
        <Link
          href={openHref}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-primary hover:underline"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </Link>
        <Button
          ref={closeBtnRef}
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label="Close annotation drawer"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <GenesAnnotationDetail
          adapter={adapter}
          drawer={drawer}
          activeNames={activeNames}
          termCount={termCount}
          onToggleGene={onSetGene}
        />
      </div>
    </aside>
  )
}
