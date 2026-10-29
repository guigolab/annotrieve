"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Pin,
} from "lucide-react"

import { GenesGeneBrowser } from "@/components/genes/genes-gene-browser"
import { GenesGeneXrefs } from "@/components/genes/genes-gene-xrefs"
import { GenesMatchChips } from "@/components/genes/genes-match-chips"
import { Button } from "@/components/ui/button"
import { streamAnnotationGff } from "@/lib/api/annotations"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
} from "@/lib/genes/gene-category"
import { parseGff } from "@/lib/genes/gff"
import { formatBp, formatLocus, formatTick, locusLength } from "@/lib/genes/format"
import { cn } from "@/lib/utils"

interface GenesGeneDetailProps {
  annotationId: string
  gene: AnnotationGeneRow
  pinned?: boolean
  onTogglePin?: () => void
}

export function GenesGeneDetail({
  annotationId,
  gene,
  pinned,
  onTogglePin,
}: GenesGeneDetailProps) {
  const [xrefsOpen, setXrefsOpen] = useState(false)
  const [xrefTotal, setXrefTotal] = useState<number | null>(null)
  const [copied, setCopied] = useState<"locus" | "gene" | null>(null)

  const gffQuery = useQuery({
    queryKey: ["genes-gff", annotationId, gene.seqid, gene.start, gene.end],
    enabled: Boolean(gene.seqid),
    staleTime: 5 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const response = await streamAnnotationGff(
        annotationId,
        {
          region: gene.seqid,
          start: Math.max(0, gene.start - 1),
          end: gene.end + 1,
        },
        { signal },
      )
      if (!response.ok) {
        throw new Error(`GFF request failed (${response.status})`)
      }
      return response.text()
    },
  })

  const gffModel = gffQuery.data
    ? parseGff(
        gffQuery.data,
        { start: gene.start, end: gene.end },
        gene.source_gene_id,
      )
    : null

  const length = locusLength(gene.start, gene.end)
  const locus = formatLocus(gene.seqid, gene.start, gene.end, gene.strand)
  const geneName = gene.primary_name || `Gene ${gene.local_id}`
  const spanLabel =
    gene.seqid
      ? `${formatTick(gene.start, length)}–${formatTick(gene.end, length)}`
      : null
  const transcriptCount = gffModel?.transcripts.length ?? null
  const category = geneCategoryOf({
    feature_type: gene.feature_type,
    biotype: gene.biotype,
    hasCds: gffModel?.transcripts.some((t) => t.cds.length > 0),
  })
  const catStyle = GENE_CATEGORY_STYLE[category]
  const hasLocus = Boolean(gene.seqid)
  const strand =
    gene.strand === "+" || gene.strand === "-" ? gene.strand : "·"

  const copy = async (kind: "locus" | "gene", text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-2.5 border-b border-border/60 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
              catStyle.textClass,
              catStyle.bgClass,
            )}
          >
            {catStyle.label}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold">
            {geneName}
          </h3>
          {onTogglePin ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 shrink-0",
                pinned ? "text-primary" : "text-muted-foreground",
              )}
              disabled={!hasLocus && !pinned}
              aria-label={
                pinned
                  ? `Unpin ${geneName}`
                  : hasLocus
                    ? `Pin ${geneName} for transcript compare`
                    : "Cannot pin gene without locus"
              }
              aria-pressed={Boolean(pinned)}
              title={
                !hasLocus
                  ? "No genomic locus to pin"
                  : pinned
                    ? "Unpin"
                    : "Pin for transcript compare"
              }
              onClick={onTogglePin}
            >
              <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
            </Button>
          ) : null}
        </div>

        {gene.prose ? (
          <p className="text-sm leading-snug text-foreground/90">{gene.prose}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {gene.seqid ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
              <span className="truncate font-mono tabular-nums" title={locus}>
                {locus}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={() => void copy("locus", locus)}
                aria-label="Copy locus"
              >
                {copied === "locus" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </span>
          ) : null}
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatBp(length)}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{strand}</span>
          {gene.source_gene_id ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex min-w-0 max-w-[14rem] items-center gap-0.5">
                <span
                  className="truncate font-mono"
                  title={gene.source_gene_id}
                >
                  {gene.source_gene_id.replace(/^gene:/i, "")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => void copy("gene", gene.source_gene_id!)}
                  aria-label="Copy gene id"
                >
                  {copied === "gene" ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </span>
            </>
          ) : null}
          {transcriptCount != null ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {transcriptCount.toLocaleString()} transcripts
              </span>
            </>
          ) : null}
        </div>

        {gene.matches && gene.matches.length > 0 ? (
          <GenesMatchChips matches={gene.matches} />
        ) : null}
      </div>

      <section className="space-y-2 border-b border-border/60 px-3 py-3">
        <header className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm font-medium">Transcripts</h4>
          {spanLabel ? (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {spanLabel}
            </span>
          ) : null}
        </header>

        {!gene.seqid && (
          <p className="text-xs text-muted-foreground">
            No sequence id for this gene.
          </p>
        )}
        {gene.seqid && gffQuery.isLoading && (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading isoforms…
          </div>
        )}
        {gffQuery.error && (
          <p className="text-xs text-destructive">
            Could not load the gene model.
          </p>
        )}
        {gffModel && (
          <GenesGeneBrowser model={gffModel} geneCategory={category} />
        )}
        {gene.seqid && gffQuery.data && !gffModel && !gffQuery.isLoading && (
          <p className="text-xs text-muted-foreground">
            No transcripts in this window.
          </p>
        )}
      </section>

      <section className="px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 py-1.5 text-left text-sm font-medium"
          onClick={() => setXrefsOpen((v) => !v)}
          aria-expanded={xrefsOpen}
        >
          {xrefsOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span>Cross-references</span>
          {xrefTotal != null && (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              · {xrefTotal.toLocaleString()}
            </span>
          )}
        </button>
        {xrefsOpen && (
          <div className="pb-3 pt-1">
            <GenesGeneXrefs
              annotationId={annotationId}
              localId={gene.local_id}
              enabled={xrefsOpen}
              onTotalChange={setXrefTotal}
            />
          </div>
        )}
      </section>
    </div>
  )
}
