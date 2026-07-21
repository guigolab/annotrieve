"use client"

import Link from "next/link"
import { Dna, Database, Network } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buildEntityDetailsUrl, cn } from "@/lib/utils"
import type { TopEntitiesResponse, TopEntityRow } from "@/lib/api/analytics"

interface UsageTopEntitiesProps {
  data: TopEntitiesResponse | null
  loading?: boolean
  className?: string
}

function EntityList({
  title,
  icon: Icon,
  rows,
  hrefFor,
}: {
  title: string
  icon: typeof Dna
  rows: TopEntityRow[]
  hrefFor: (row: TopEntityRow) => string
}) {
  return (
    <Card className="border-border/60 bg-card/80 shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No data yet</p>
        ) : (
          rows.map((row, index) => (
            <Link
              key={row.id}
              href={hrefFor(row)}
              className="flex items-start justify-between gap-3 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <div className="min-w-0 flex items-start gap-2">
                <span className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground w-4 shrink-0">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary">
                    {row.label || row.id}
                  </p>
                  {row.organism_name && row.label !== row.organism_name ? (
                    <p className="text-xs text-muted-foreground truncate italic">
                      {row.organism_name}
                    </p>
                  ) : row.id && row.label && row.label !== row.id ? (
                    <p className="text-xs text-muted-foreground truncate font-mono">{row.id}</p>
                  ) : null}
                </div>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground pt-0.5">
                {row.unique_users.toLocaleString()}
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function UsageTopEntities({ data, loading, className }: UsageTopEntitiesProps) {
  const empty =
    !loading &&
    data != null &&
    data.top_assemblies.length === 0 &&
    data.top_annotations.length === 0 &&
    data.top_taxons.length === 0 &&
    data.as_of == null

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Most opened</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Top assemblies, annotations, and taxa by unique users who opened them.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : empty ? (
        <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
          Aggregates update daily after the usage job runs.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <EntityList
            title="Assemblies"
            icon={Database}
            rows={data?.top_assemblies ?? []}
            hrefFor={(row) => buildEntityDetailsUrl("assembly", row.id)}
          />
          <EntityList
            title="Annotations"
            icon={Dna}
            rows={data?.top_annotations ?? []}
            hrefFor={(row) => `/annotations/?annotation_id=${encodeURIComponent(row.id)}`}
          />
          <EntityList
            title="Taxa"
            icon={Network}
            rows={data?.top_taxons ?? []}
            hrefFor={(row) => buildEntityDetailsUrl("taxon", row.id)}
          />
        </div>
      )}
    </section>
  )
}
