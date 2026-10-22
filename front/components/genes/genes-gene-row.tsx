"use client"

import { useState, type KeyboardEvent, type MouseEvent } from "react"
import { Check, ChevronRight, Copy } from "lucide-react"

import { GenesMatchChips } from "@/components/genes/genes-match-chips"
import { Button } from "@/components/ui/button"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
} from "@/lib/genes/gene-category"
import { formatBp, formatLocus, locusLength } from "@/lib/genes/format"
import { groupMatches } from "@/lib/genes/matches"
import { cn } from "@/lib/utils"

interface GenesGeneRowProps {
  gene: AnnotationGeneRow
  selected?: boolean
  onSelect: () => void
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function GenesGeneRow({
  gene,
  selected,
  onSelect,
}: GenesGeneRowProps) {
  const [copied, setCopied] = useState(false)
  const length = locusLength(gene.start, gene.end)
  const locus = formatLocus(gene.seqid, gene.start, gene.end, gene.strand)
  const showFeatureType =
    gene.feature_type && gene.feature_type.toLowerCase() !== "gene"
  const category = geneCategoryOf({
    feature_type: gene.feature_type,
    biotype: gene.biotype,
  })
  const catStyle = GENE_CATEGORY_STYLE[category]
  const grouped = groupMatches(gene.matches)
  const termCount = grouped.distinctInputs.length

  const onCopyLocus = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!gene.seqid) return
    const ok = await copyText(locus)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        data-local-id={gene.local_id}
        className={cn(
          "w-full text-left px-3 py-3 cursor-pointer border-l-[3px]",
          catStyle.borderClass,
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/50",
          selected && "bg-muted/40",
        )}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        aria-current={selected ? "true" : undefined}
      >
        <div className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold truncate">
                {gene.primary_name || `Gene ${gene.local_id}`}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  catStyle.textClass,
                  catStyle.bgClass,
                )}
              >
                {catStyle.shortLabel}
              </span>
              {showFeatureType && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {gene.feature_type}
                </span>
              )}
              {gene.biotype && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {gene.biotype}
                </span>
              )}
              {termCount > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {termCount} {termCount === 1 ? "term" : "terms"}
                </span>
              )}
              {(gene.strand === "+" || gene.strand === "-") && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-mono tabular-nums text-muted-foreground">
                  {gene.strand}
                </span>
              )}
            </div>

            {gene.prose && (
              <p className="text-xs text-foreground line-clamp-2">
                {gene.prose_kind && (
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                    {gene.prose_kind}
                  </span>
                )}
                {gene.prose}
              </p>
            )}

            <GenesMatchChips matches={gene.matches} />

            {gene.seqid && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums truncate" title={locus}>
                  {gene.seqid}:{gene.start.toLocaleString()}-
                  {gene.end.toLocaleString()}
                </span>
                <span className="tabular-nums">· {formatBp(length)}</span>
                {gene.source_gene_id && (
                  <span
                    className="truncate font-mono text-[10px] max-w-[8rem]"
                    title={gene.source_gene_id}
                  >
                    {gene.source_gene_id}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onCopyLocus}
                  aria-label="Copy locus"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            )}
          </div>
          <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </li>
  )
}
