"use client"

import { useEffect, useMemo } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ExternalLink, Loader2 } from "lucide-react"
import Link from "next/link"

import { GenesGeneDetail } from "@/components/genes/genes-gene-detail"
import { GenesGeneRow } from "@/components/genes/genes-gene-row"
import {
  ANNOTATIONS_LIST_PATH,
  ANNOTATION_ID_PARAM,
} from "@/lib/annotations-url"
import { listAnnotationGenes, XrefsApiError } from "@/lib/api/xrefs"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import { namesForGeneBrowse } from "@/lib/genes/coverage"
import { sourceColor, sourceLabel } from "@/lib/genes/hits"
import { sortGenesByMatches } from "@/lib/genes/sort"
import type { PanelStack } from "@/lib/genes/store"

const MATCH_SORT_CAP = 200

interface GenesAnnotationDetailProps {
  adapter: GenesHitsAdapter | null
  panel: PanelStack
  activeNames: string[]
  termCount: number
  onOpenGene: (localId: number) => void
  onGeneTitle?: (title: string | null) => void
}

export function GenesAnnotationDetail({
  adapter,
  panel,
  activeNames,
  termCount,
  onOpenGene,
  onGeneTitle,
}: GenesAnnotationDetailProps) {
  const annotationId = panel.annotationId
  const keys = adapter?.keys ?? []
  const sources = adapter?.hits.sources

  const browseNames = useMemo(() => {
    if (!annotationId || !adapter) return activeNames
    const row = adapter.rows.find((r) => r.annotationId === annotationId)
    if (!row) return activeNames.slice(0, 50)
    return namesForGeneBrowse(activeNames, row, keys)
  }, [annotationId, adapter, activeNames, keys])

  const genesQuery = useQuery({
    queryKey: ["genes-panel-genes", annotationId, browseNames],
    enabled: Boolean(annotationId),
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      listAnnotationGenes(
        annotationId!,
        { names: browseNames, limit: MATCH_SORT_CAP, offset: 0 },
        { signal },
      ),
  })

  const genes = useMemo(
    () => sortGenesByMatches(genesQuery.data?.results ?? []),
    [genesQuery.data],
  )
  const selectedGene =
    panel.localId != null
      ? genes.find((g) => g.local_id === panel.localId) ?? null
      : null

  useEffect(() => {
    if (!onGeneTitle) return
    if (panel.level !== "gene") {
      onGeneTitle(null)
      return
    }
    onGeneTitle(
      selectedGene?.primary_name ||
        (panel.localId != null ? `Gene ${panel.localId}` : null),
    )
  }, [onGeneTitle, panel.level, panel.localId, selectedGene])

  const matchedRow = annotationId
    ? adapter?.rows.find((r) => r.annotationId === annotationId)
    : null
  const matchedK = matchedRow?.nMatched ?? 0

  const missingNames = useMemo(() => {
    if (!matchedRow || !keys.length) return []
    const hit = new Set(
      matchedRow.matchedKeyIndexes
        .map((ki) => keys[ki]?.name.toLowerCase())
        .filter(Boolean),
    )
    return activeNames.filter((n) => !hit.has(n.toLowerCase()))
  }, [matchedRow, keys, activeNames])

  const openInAnnotationsHref = annotationId
    ? `${ANNOTATIONS_LIST_PATH}?${ANNOTATION_ID_PARAM}=${encodeURIComponent(annotationId)}`
    : null

  const totalReported = genesQuery.data?.total ?? genes.length
  const truncated = totalReported > genes.length

  if (!annotationId) return null

  if (panel.level === "gene") {
    if (selectedGene) {
      return (
        <GenesGeneDetail annotationId={annotationId} gene={selectedGene} />
      )
    }
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        {genesQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Gene not found in this annotation."
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-3 py-2 border-b space-y-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: sourceColor(panel.source ?? 0) }}
          />
          <span>{sourceLabel(panel.source ?? 0, sources)}</span>
          <span className="font-mono text-muted-foreground truncate">
            {annotationId}
          </span>
          {openInAnnotationsHref && (
            <Link
              href={openInAnnotationsHref}
              className="inline-flex items-center gap-1 text-primary hover:underline ml-auto"
            >
              Open in Annotations
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <p className="text-muted-foreground">
          {matchedK} of {termCount} names found
        </p>
        {missingNames.length > 0 && (
          <p className="text-muted-foreground">
            Missing:{" "}
            <span className="font-mono">
              {missingNames.slice(0, 12).join(", ")}
              {missingNames.length > 12
                ? ` +${missingNames.length - 12}`
                : ""}
            </span>
          </p>
        )}
        {truncated && (
          <p className="text-amber-700 dark:text-amber-400">
            Showing {genes.length.toLocaleString()} of{" "}
            {totalReported.toLocaleString()} genes
          </p>
        )}
      </div>
      {genesQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading genes…
        </div>
      )}
      {genesQuery.error && (
        <p className="px-3 py-4 text-sm text-destructive">
          {genesQuery.error instanceof XrefsApiError
            ? genesQuery.error.detail?.message ?? genesQuery.error.message
            : String(genesQuery.error)}
        </p>
      )}
      <ul className="divide-y">
        {genes.map((gene) => (
          <li key={gene.local_id}>
            <GenesGeneRow
              gene={gene}
              onSelect={() => onOpenGene(gene.local_id)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

export { MATCH_SORT_CAP }
