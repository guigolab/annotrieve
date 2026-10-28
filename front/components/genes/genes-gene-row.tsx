"use client"

import type { KeyboardEvent } from "react"
import { ChevronRight } from "lucide-react"

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
  onSelect: () => void
}

export function GenesGeneRow({
  gene,
  selected,
  onSelect,
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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
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
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
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
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  )
}
