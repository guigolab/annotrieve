"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChevronRight, ChevronDown, X, ExternalLink, Dna, Database, FileText } from "lucide-react"
import type { TaxonRecord, AssemblyRecord } from "@/lib/api/types"
import { buildEntityDetailsUrl } from "@/lib/utils"

function getRankColor(rank?: string): string {
  const colors: Record<string, string> = {
    superkingdom: "#3b82f6",
    kingdom: "#8b5cf6",
    phylum: "#ec4899",
    class: "#f59e0b",
    order: "#10b981",
    family: "#06b6d4",
    genus: "#6366f1",
    species: "#22c55e",
  }
  return rank ? colors[rank.toLowerCase()] ?? "#6b7280" : "#6b7280"
}

function extractCounts(taxon: TaxonRecord): {
  organisms?: number
  assemblies?: number
  annotations?: number
} {
  return {
    organisms: taxon.organisms_count,
    assemblies: taxon.assemblies_count,
    annotations: taxon.annotations_count,
  }
}

export interface EntityData {
  id: string
  name: string
  subtitle?: string
  badge?: {
    label: string
    color?: string
  }
  counts?: {
    organisms?: number
    assemblies?: number
    annotations?: number
  }
  detailsUrl?: string
}

interface SelectedEntityProps {
  title: string
  entities: EntityData[]
  onClear: () => void
  onRemove: (id: string) => void
  onAction?: () => void
  actionLabel?: string
}

export function SelectedEntity({
  title,
  entities,
  onClear,
  onRemove,
  onAction,
  actionLabel = "View",
}: SelectedEntityProps) {
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(true)

  if (entities.length === 0) return null

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <span className="font-semibold text-sm text-card-foreground">
            {title} ({entities.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onClear} className="h-7">
            Clear Selection
          </Button>
          {onAction && (
            <Button size="sm" onClick={onAction} className="h-7">
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 max-h-[400px]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {entities.map((entity) => {
              const counts = entity.counts
              const hasCounts =
                counts &&
                (counts.organisms || counts.assemblies || counts.annotations)
              return (
                <div
                  key={entity.id}
                  className="flex items-start justify-between gap-2 p-2 rounded-md border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {entity.badge && (
                        <Badge
                          variant="outline"
                          className="text-xs capitalize shrink-0"
                          style={
                            entity.badge.color
                              ? {
                                  borderColor: entity.badge.color,
                                  color: entity.badge.color,
                                }
                              : {}
                          }
                        >
                          {entity.badge.label}
                        </Badge>
                      )}
                      <span className="font-semibold text-xs text-card-foreground truncate flex-1">
                        {entity.name}
                      </span>
                      {entity.detailsUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(entity.detailsUrl!)
                          }}
                          title={`View ${title.toLowerCase()} details`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {entity.subtitle && (
                      <div className="text-xs text-muted-foreground mb-1">
                        {entity.subtitle}
                      </div>
                    )}
                    {hasCounts && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                        {counts!.organisms != null && counts!.organisms > 0 && (
                          <div
                            className="flex items-center gap-1 text-muted-foreground"
                            title={`Organisms: ${counts!.organisms}`}
                          >
                            <Dna className="w-3 h-3 text-green-500" />
                            <span className="font-semibold text-card-foreground">
                              {counts!.organisms.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {counts!.assemblies != null &&
                          counts!.assemblies > 0 && (
                            <div
                              className="flex items-center gap-1 text-muted-foreground"
                              title={`Assemblies: ${counts!.assemblies}`}
                            >
                              <Database className="w-3 h-3 text-purple-500" />
                              <span className="font-semibold text-card-foreground">
                                {counts!.assemblies.toLocaleString()}
                              </span>
                            </div>
                          )}
                        {counts!.annotations != null &&
                          counts!.annotations > 0 && (
                            <div
                              className="flex items-center gap-1 text-muted-foreground"
                              title={`Annotations: ${counts!.annotations}`}
                            >
                              <FileText className="w-3 h-3 text-blue-500" />
                              <span className="font-semibold text-card-foreground">
                                {counts!.annotations.toLocaleString()}
                              </span>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => onRemove(entity.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

export function taxonToEntity(taxon: TaxonRecord): EntityData {
  const counts = extractCounts(taxon)
  const rankColor = getRankColor(taxon.rank)
  return {
    id: taxon.taxid,
    name: taxon.scientific_name || taxon.taxid,
    subtitle: `TaxID: ${taxon.taxid}`,
    badge: {
      label: taxon.rank || "Unknown",
      color: rankColor,
    },
    counts: {
      organisms: counts.organisms,
      assemblies: counts.assemblies,
      annotations: counts.annotations,
    },
    detailsUrl: buildEntityDetailsUrl("taxon", taxon.taxid),
  }
}

export function assemblyToEntity(assembly: AssemblyRecord): EntityData {
  return {
    id: assembly.assembly_accession,
    name: assembly.assembly_name,
    subtitle: `${assembly.assembly_accession} • ${assembly.organism_name}`,
    badge:
      assembly.refseq_category === "reference genome"
        ? { label: "Reference", color: "#10b981" }
        : undefined,
    counts: {
      annotations: assembly.annotations_count,
    },
    detailsUrl: buildEntityDetailsUrl("assembly", assembly.assembly_accession),
  }
}
