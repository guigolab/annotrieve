"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AssemblyRecord, AnnotationRecord } from "@/lib/api/types"
import { Building2, Calendar, Database, Dna, FileText, Loader2 } from "lucide-react"

export const JBROWSE_SIDEBAR_WIDTH = 280

interface JBrowseSidebarProps {
  accession: string
  assembly: AssemblyRecord | null
  annotations: AnnotationRecord[]
  highlightedAnnotationId: string
  isLoading: boolean
  pairedAssemblyAccession?: string | null
}

function JBrowseAnnotationCard({
  annotation,
  isHighlighted,
  pairedAssemblyAccession,
}: {
  annotation: AnnotationRecord
  isHighlighted: boolean
  pairedAssemblyAccession?: string | null
}) {
  const codingGenes = annotation.features_statistics?.gene_category_stats?.["coding"]?.total_count
  const nonCodingGenes = annotation.features_statistics?.gene_category_stats?.["non_coding"]?.total_count
  const pseudogenes = annotation.features_statistics?.gene_category_stats?.["pseudogene"]?.total_count
  const hasGeneCounts =
    codingGenes !== undefined || nonCodingGenes !== undefined || pseudogenes !== undefined

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all duration-200",
        isHighlighted
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-background"
      )}
    >
      {isHighlighted && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />
      )}
      <div className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs font-semibold">
            {annotation.source_file_info?.database || "Unknown"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {annotation.source_file_info?.provider || "Unknown"}
          </Badge>
          {pairedAssemblyAccession &&
            annotation.assembly_accession === pairedAssemblyAccession && (
              <Badge className="text-xs font-semibold">Paired</Badge>
            )}
        </div>
        {annotation.source_file_info?.release_date && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3 shrink-0" />
            {new Date(annotation.source_file_info.release_date).toLocaleDateString()}
          </div>
        )}
        {hasGeneCounts && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {codingGenes !== undefined && (
              <span>
                <span className="text-muted-foreground">Coding </span>
                <span className="font-semibold text-foreground">{codingGenes.toLocaleString()}</span>
              </span>
            )}
            {nonCodingGenes !== undefined && (
              <span>
                <span className="text-muted-foreground">Non-coding </span>
                <span className="font-semibold text-foreground">{nonCodingGenes.toLocaleString()}</span>
              </span>
            )}
            {pseudogenes !== undefined && (
              <span>
                <span className="text-muted-foreground">Pseudo </span>
                <span className="font-semibold text-foreground">{pseudogenes.toLocaleString()}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function JBrowseSidebar({
  accession,
  assembly,
  annotations,
  highlightedAnnotationId,
  isLoading,
  pairedAssemblyAccession,
}: JBrowseSidebarProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 border-b border-border px-3 py-3 space-y-3">
        <div className="flex items-start gap-2">
          <Dna className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground italic leading-snug">
              {isLoading ? "Loading…" : assembly?.organism_name || accession}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">{accession}</p>
            {assembly?.assembly_name && (
              <p className="text-xs text-muted-foreground truncate">{assembly.assembly_name}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading assembly…
          </div>
        ) : assembly ? (
          <div className="space-y-1.5 text-xs">
            {assembly.submitter && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium text-foreground">Submitter: </span>
                  {assembly.submitter}
                </span>
              </div>
            )}
            <div className="flex items-start gap-2 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <span className="font-medium text-foreground">Released: </span>
                {assembly.release_date
                  ? new Date(assembly.release_date).toLocaleDateString()
                  : "N/A"}
              </span>
            </div>
            {assembly.paired_assembly_accession && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <Database className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-all">
                  <span className="font-medium text-foreground">Paired: </span>
                  {assembly.paired_assembly_accession}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 py-2 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Annotations
          </div>
        </div>
        <div className="p-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading annotations…
            </div>
          ) : annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No annotations found.</p>
          ) : (
            annotations.map((annotation) => (
              <JBrowseAnnotationCard
                key={annotation.annotation_id ?? annotation.md5_checksum}
                annotation={annotation}
                isHighlighted={highlightedAnnotationId === annotation.annotation_id}
                pairedAssemblyAccession={pairedAssemblyAccession}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
