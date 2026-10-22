"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Copy, Loader2 } from "lucide-react"

import { GenesPagination } from "@/components/genes/genes-pagination"
import { listGeneXrefs, XrefsApiError } from "@/lib/api/xrefs"
import type { GeneXrefRow } from "@/lib/api/xrefs-types"
import { accessionToCurie } from "@/lib/genes/curie"
import {
  groupNamespaces,
  type NamespaceGroupId,
} from "@/lib/genes/namespace-groups"
import { cn } from "@/lib/utils"

const PAGE = 100

const GROUP_ORDER: NamespaceGroupId[] = [
  "identity",
  "domains",
  "uniprot",
  "model",
  "eggnog",
  "other",
]

const GROUP_LABELS: Record<NamespaceGroupId, string> = {
  identity: "Identity",
  domains: "Domains & ontology",
  uniprot: "UniProt",
  model: "Model / community",
  eggnog: "eggNOG / COG",
  other: "Other",
}

function viaLabel(level: number | undefined): string {
  if (level === 0) return "gene level"
  if (level === 1) return "transcript level"
  if (level === 2) return "CDS level"
  return "unknown level"
}

function xrefTooltip(xref: GeneXrefRow): string {
  const parts = [
    xref.display || `${xref.namespace}:${xref.accession}`,
    xref.origin ? `origin: ${xref.origin}` : null,
    viaLabel(xref.via_level),
  ]
  return parts.filter(Boolean).join(" · ")
}

interface GenesGeneXrefsProps {
  annotationId: string
  localId: number
  /** When false, skip the fetch (lazy open). Default true. */
  enabled?: boolean
  onTotalChange?: (total: number | null) => void
}

export function GenesGeneXrefs({
  annotationId,
  localId,
  enabled = true,
  onTotalChange,
}: GenesGeneXrefsProps) {
  const [limit, setLimit] = useState(PAGE)
  const [copied, setCopied] = useState<string | null>(null)

  const xrefsQuery = useQuery({
    queryKey: ["genes-xrefs", annotationId, localId, limit],
    enabled,
    queryFn: ({ signal }) =>
      listGeneXrefs(
        annotationId,
        localId,
        { limit, offset: 0 },
        { signal },
      ),
    staleTime: 5 * 60 * 1000,
  })

  const results = xrefsQuery.data?.results ?? []
  const total = xrefsQuery.data?.total ?? 0

  useEffect(() => {
    if (!enabled) {
      onTotalChange?.(null)
      return
    }
    if (xrefsQuery.data) onTotalChange?.(total)
  }, [enabled, onTotalChange, total, xrefsQuery.data])

  const grouped = useMemo(() => {
    const nsCounts = new Map<string, number>()
    for (const xref of results) {
      nsCounts.set(xref.namespace, (nsCounts.get(xref.namespace) ?? 0) + 1)
    }
    const groups = groupNamespaces(
      [...nsCounts.entries()].map(([namespace, accession_count]) => ({
        namespace,
        accession_count,
      })),
    )
    const byNs = new Map<string, GeneXrefRow[]>()
    for (const xref of results) {
      const list = byNs.get(xref.namespace) ?? []
      list.push(xref)
      byNs.set(xref.namespace, list)
    }
    return groups.map((group) => ({
      ...group,
      label: GROUP_LABELS[group.id],
      items: group.namespaces.flatMap((ns) => byNs.get(ns) ?? []),
    }))
  }, [results])

  if (!enabled) return null

  const errorMessage =
    xrefsQuery.error instanceof XrefsApiError
      ? xrefsQuery.error.detail?.message ?? xrefsQuery.error.message
      : xrefsQuery.error
        ? String((xrefsQuery.error as Error).message ?? xrefsQuery.error)
        : null

  const onCopy = async (xref: GeneXrefRow) => {
    const curie = accessionToCurie(xref.namespace, xref.accession)
    try {
      await navigator.clipboard.writeText(curie)
      setCopied(curie)
      window.setTimeout(() => setCopied(null), 1200)
    } catch {
      /* ignore */
    }
  }

  if (xrefsQuery.isLoading && !results.length) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-6 w-20 rounded-full bg-muted animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return <p className="text-xs text-destructive">{errorMessage}</p>
  }

  if (!results.length) {
    return <p className="text-xs text-muted-foreground">No xrefs</p>
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((id) => {
        const group = grouped.find((g) => g.id === id)
        if (!group || !group.items.length) return null
        return (
          <div key={id} className="space-y-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}{" "}
              <span className="tabular-nums normal-case tracking-normal">
                ({group.items.length})
              </span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {group.items.map((xref) => {
                const curie = accessionToCurie(xref.namespace, xref.accession)
                const isCopied = copied === curie
                return (
                  <li key={`${xref.namespace}:${xref.accession}:${xref.origin ?? ""}`}>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-left text-[11px] hover:bg-muted/60",
                      )}
                      title={xrefTooltip(xref)}
                      onClick={() => void onCopy(xref)}
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {xref.namespace}
                      </span>
                      <span className="min-w-0 truncate font-mono">
                        {xref.accession}
                      </span>
                      {isCopied ? (
                        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-50" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      <GenesPagination
        total={total}
        limit={limit}
        offset={0}
        onOffsetChange={() => {}}
        loadMore
        loading={xrefsQuery.isFetching}
        onLoadMore={() => setLimit((n) => Math.min(n + PAGE, 200))}
      />
      {xrefsQuery.isFetching && results.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating…
        </div>
      )}
    </div>
  )
}
