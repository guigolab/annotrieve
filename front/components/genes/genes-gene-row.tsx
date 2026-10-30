"use client"

import type { KeyboardEvent, MouseEvent } from "react"
import { ChevronDown, ChevronRight, Pin } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
} from "@/lib/genes/gene-category"
import { formatBp, locusLength } from "@/lib/genes/format"
import { cn } from "@/lib/utils"

interface GenesGeneRowProps {
  gene: AnnotationGeneRow
  selected?: boolean
  /** When true, show ▾ instead of ▸ (inline expand in drawer). */
  expanded?: boolean
  pinned?: boolean
  onSelect: () => void
  onTogglePin?: () => void
}

export function GenesGeneRow({
  gene,
  selected,
  expanded,
  pinned,
  onSelect,
  onTogglePin,
}: GenesGeneRowProps) {
  const length = locusLength(gene.start, gene.end)
  const category = geneCategoryOf({
    feature_type: gene.feature_type,
    biotype: gene.biotype,
  })
  const catStyle = GENE_CATEGORY_STYLE[category]
  const hasLocus = Boolean(gene.seqid)
  const strand =
    gene.strand === "+" || gene.strand === "-" ? gene.strand : null
  const canPin = Boolean(onTogglePin) && hasLocus

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
  }

  const onPinClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onTogglePin?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-local-id={gene.local_id}
      className={cn(
        "w-full cursor-pointer border-l-[3px] px-3 py-2.5 text-left",
        catStyle.borderClass,
        "hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
        selected && "bg-muted/40",
      )}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold">
              {gene.primary_name || `Gene ${gene.local_id}`}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                catStyle.textClass,
                catStyle.bgClass,
              )}
            >
              {catStyle.shortLabel}
            </span>
          </div>
          {hasLocus ? (
            <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">
              {gene.seqid}:{gene.start.toLocaleString()}-
              {gene.end.toLocaleString()}
              <span className="font-sans"> · {formatBp(length)}</span>
              {strand ? <span className="font-mono"> · {strand}</span> : null}
            </p>
          ) : null}
        </div>
        {onTogglePin ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0",
              pinned
                ? "text-primary hover:text-primary"
                : "text-muted-foreground",
            )}
            disabled={!canPin && !pinned}
            aria-label={
              pinned
                ? `Unpin ${gene.primary_name || gene.local_id}`
                : hasLocus
                  ? `Pin ${gene.primary_name || gene.local_id} for transcript compare`
                  : "Cannot pin gene without locus"
            }
            aria-pressed={pinned}
            title={
              !hasLocus
                ? "No genomic locus to pin"
                : pinned
                  ? "Unpin"
                  : "Pin for transcript compare"
            }
            onClick={onPinClick}
          >
            <Pin
              className={cn("h-3.5 w-3.5", pinned && "fill-current")}
            />
          </Button>
        ) : null}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
