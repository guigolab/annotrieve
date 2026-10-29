"use client"

import { useMemo } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"

import { GenesGeneDetail } from "@/components/genes/genes-gene-detail"
import {
  getAnnotationGene,
  listAnnotationGenes,
  XrefsApiError,
} from "@/lib/api/xrefs"
import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import { pinIdFor, useCompareStore } from "@/lib/genes/compare-store"
import {
  locusSiblings,
  shortGeneId,
} from "@/lib/genes/locus-siblings"
import { pinInputFromGene } from "@/lib/genes/pin-gene"
import type { GenesDrawer } from "@/lib/genes/store"
import { cn } from "@/lib/utils"

const MATCH_SORT_CAP = 50

interface GenesAnnotationDetailProps {
  adapter: GenesHitsAdapter | null
  drawer: GenesDrawer
  activeNames: string[]
  termCount: number
  onToggleGene: (localId: number | null) => void
}

export function GenesAnnotationDetail({
  drawer,
  onToggleGene,
}: GenesAnnotationDetailProps) {
  const annotationId = drawer.annotationId
  const localId = drawer.localId
  const pins = useCompareStore((s) => s.pins)
  const togglePin = useCompareStore((s) => s.togglePin)

  const geneQuery = useQuery({
    queryKey: ["genes-drawer-gene", annotationId, localId],
    enabled: Boolean(annotationId && localId != null),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      getAnnotationGene(annotationId, localId!, { signal }),
  })

  const focusName = useMemo(() => {
    const g = geneQuery.data
    if (!g) return null
    return g.primary_name || g.matches?.[0]?.input || null
  }, [geneQuery.data])

  const siblingsQuery = useQuery({
    queryKey: [
      "genes-drawer-siblings",
      annotationId,
      focusName?.toLowerCase() ?? "",
    ],
    enabled: Boolean(annotationId && focusName),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listAnnotationGenes(
        annotationId,
        { names: [focusName!], limit: MATCH_SORT_CAP, offset: 0 },
        { signal },
      ),
  })

  const activeGene: AnnotationGeneRow | null = useMemo(() => {
    if (localId == null) return null
    const fromSiblings = siblingsQuery.data?.results.find(
      (g) => g.local_id === localId,
    )
    if (fromSiblings) return fromSiblings
    return geneQuery.data ?? null
  }, [localId, siblingsQuery.data, geneQuery.data])

  const siblings = useMemo(() => {
    if (localId == null || !siblingsQuery.data) return []
    return locusSiblings(siblingsQuery.data.results, localId)
  }, [localId, siblingsQuery.data])

  const onTogglePin = () => {
    if (!annotationId || !activeGene) return
    const input = pinInputFromGene(
      annotationId,
      drawer.species ?? "Annotation",
      drawer.source ?? 0,
      activeGene,
      activeGene.primary_name || `Gene ${activeGene.local_id}`,
    )
    if (!input) return
    togglePin(input)
  }

  if (localId == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
        <p>Click a filled gene cell to view details.</p>
      </div>
    )
  }

  const loading =
    (geneQuery.isLoading && !activeGene) ||
    (siblingsQuery.isLoading && !activeGene)
  const error = geneQuery.error || siblingsQuery.error

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading gene…
      </div>
    )
  }

  if (error && !activeGene) {
    return (
      <p className="px-4 py-6 text-sm text-destructive">
        {error instanceof XrefsApiError
          ? error.detail?.message ?? error.message
          : String(error)}
      </p>
    )
  }

  if (!activeGene) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        Gene not found in this annotation.
      </p>
    )
  }

  const pinned = pins.some(
    (p) => p.id === pinIdFor(annotationId, activeGene.local_id),
  )
  const showChooser = siblings.length > 1

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {showChooser ? (
        <div className="shrink-0 space-y-2 border-b border-border/70 bg-amber-50/80 px-3 py-2.5 text-xs dark:bg-amber-950/30">
          <p className="text-amber-900 dark:text-amber-200">
            {siblings.length} genes share this locus and match. Choose which
            gene ID to inspect (transcripts and pin follow your choice).
          </p>
          <div
            role="group"
            aria-label="Genes at this locus"
            className="flex flex-wrap gap-1"
          >
            {siblings.map((g) => {
              const selected = g.local_id === activeGene.local_id
              const label = shortGeneId(g)
              return (
                <button
                  key={g.local_id}
                  type="button"
                  aria-pressed={selected}
                  title={g.source_gene_id ?? label}
                  onClick={() => {
                    if (g.local_id !== activeGene.local_id) {
                      onToggleGene(g.local_id)
                    }
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 font-mono text-[11px] tabular-nums",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <GenesGeneDetail
        annotationId={annotationId}
        gene={activeGene}
        pinned={pinned}
        onTogglePin={onTogglePin}
      />
    </div>
  )
}

export { MATCH_SORT_CAP }
