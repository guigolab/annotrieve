"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, ChevronDown, ChevronRight, Copy, Loader2 } from "lucide-react"

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
}

export function GenesGeneDetail({
  annotationId,
  gene,
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
  const showFeatureType =
    gene.feature_type && gene.feature_type.toLowerCase() !== "gene"
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
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-3 py-3 space-y-3 border-b">
        {/* 1. Identity */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0",
              catStyle.textClass,
              catStyle.bgClass,
            )}
          >
            {catStyle.label}
          </span>
          <h3 className="text-base font-semibold truncate">{geneName}</h3>
          {gene.source_gene_id && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => void copy("gene", gene.source_gene_id!)}
              aria-label="Copy gene id"
            >
              {copied === "gene" ? (
                <Check className="h-3 w-3 text-emerald-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
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
          </div>
        </div>

        {/* 2. Description */}
        {gene.prose ? (
          <p className="text-sm text-foreground">
            {gene.prose_kind && (
              <span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                {gene.prose_kind}
              </span>
            )}
            {gene.prose}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No description</p>
        )}

        {/* 3. Matched by */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Matched by
          </div>
          <GenesMatchChips matches={gene.matches} />
        </div>

        {/* 4. Facts grid */}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
          {gene.seqid && (
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Locus
              </dt>
              <dd className="mt-0.5 flex items-center gap-1 min-w-0">
                <span className="font-mono tabular-nums truncate" title={locus}>
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
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Length
            </dt>
            <dd className="mt-0.5 tabular-nums">{formatBp(length)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Strand
            </dt>
            <dd className="mt-0.5 font-mono">
              {gene.strand === "+" || gene.strand === "-" ? gene.strand : "·"}
            </dd>
          </div>
          {gene.source_gene_id && (
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Source ID
              </dt>
              <dd
                className="mt-0.5 font-mono truncate"
                title={gene.source_gene_id}
              >
                {gene.source_gene_id}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Transcripts
            </dt>
            <dd className="mt-0.5 tabular-nums">
              {transcriptCount != null
                ? transcriptCount.toLocaleString()
                : gffQuery.isLoading
                  ? "…"
                  : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <section className="px-3 py-3 space-y-2 border-b">
        <header className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-sm font-medium">
            Transcripts of {geneName}
            {transcriptCount != null && (
              <span className="ml-1.5 tabular-nums text-muted-foreground font-normal">
                · {transcriptCount}
              </span>
            )}
          </h4>
          {spanLabel && (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {spanLabel} · {formatBp(length)}
            </span>
          )}
        </header>

        {!gene.seqid && (
          <p className="text-xs text-muted-foreground">No sequence id for this gene.</p>
        )}
        {gene.seqid && gffQuery.isLoading && (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading isoforms…
          </div>
        )}
        {gffQuery.error && (
          <p className="text-xs text-destructive">Could not load the gene model.</p>
        )}
        {gffModel && (
          <GenesGeneBrowser model={gffModel} geneCategory={category} />
        )}
        {gene.seqid && gffQuery.data && !gffModel && !gffQuery.isLoading && (
          <p className="text-xs text-muted-foreground">No transcripts in this window.</p>
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
            <span className="tabular-nums text-muted-foreground font-normal text-xs">
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
