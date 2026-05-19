"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, HardDrive } from "lucide-react"
import { AnnotationActions } from "./annotation-actions"
import type { PortalAnnotation } from "@/lib/types"
import { cn } from "@/lib/utils"

interface AnnotationCardProps {
  annotation: PortalAnnotation
  isSelected: boolean
}

function convertToHumanReadableSize(fileSize: number) {
  if (!fileSize || fileSize <= 0) return "—"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.min(Math.floor(Math.log10(fileSize) / 3), units.length - 1)
  return (fileSize / Math.pow(1024, index)).toFixed(2) + " " + units[index]
}

export function AnnotationCard({ annotation, isSelected }: AnnotationCardProps) {
  const topBiotypes = annotation.features_summary?.biotypes?.slice(0, 4) || []
  const hasMoreBiotypes = (annotation.features_summary?.biotypes?.length || 0) > 4

  const codingGenes = annotation.features_statistics?.gene_category_stats?.["coding"]?.total_count
  const nonCodingGenes = annotation.features_statistics?.gene_category_stats?.["non_coding"]?.total_count
  const pseudogenes = annotation.features_statistics?.gene_category_stats?.["pseudogene"]?.total_count
  const hasGeneCounts =
    codingGenes !== undefined || nonCodingGenes !== undefined || pseudogenes !== undefined
  const buscoComplete = annotation.busco?.complete
  const hasBusco = buscoComplete !== undefined && buscoComplete !== null

  const fileSize = annotation.indexed_file_info?.file_size
  const releaseDate = annotation.source_file_info?.release_date

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200",
        isSelected
          ? "border-primary bg-primary/5 shadow-md"
          : "border hover:border-primary/50 hover:shadow-lg hover:bg-muted/30"
      )}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />}

      <div className="p-3 sm:p-4 lg:p-5">
        <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
          <div className="flex-1 min-w-0 space-y-2.5 sm:space-y-3 lg:space-y-4">
            {/* Header Section */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                <Badge variant="secondary" className="text-[10px] sm:text-xs font-semibold max-w-full truncate">
                  {annotation.source_file_info.database}
                </Badge>
                <Badge variant="outline" className="text-[10px] sm:text-xs max-w-full truncate">
                  {annotation.source_file_info.provider}
                </Badge>
              </div>

              <h4 className="text-sm sm:text-base italic font-semibold mb-0.5 sm:mb-1 truncate group-hover:text-primary transition-colors">
                {annotation.organism_name}
              </h4>

              <div className="min-w-0">
                <span
                  className="text-[10px] sm:text-xs font-mono text-muted-foreground truncate block"
                  title={annotation.assembly_name || annotation.assembly_accession}
                >
                  {annotation.assembly_name || annotation.assembly_accession}
                </span>
              </div>
            </div>

            {/* Gene Counts */}
            {(hasGeneCounts || hasBusco) && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
                {codingGenes !== undefined && (
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">Coding</span>
                    <span className="text-xs sm:text-sm font-semibold text-primary tabular-nums truncate">
                      {codingGenes.toLocaleString()}
                    </span>
                  </div>
                )}
                {nonCodingGenes !== undefined && (
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
                      <span className="sm:hidden">Non-cod.</span>
                      <span className="hidden sm:inline">Non-coding</span>
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-secondary tabular-nums truncate">
                      {nonCodingGenes.toLocaleString()}
                    </span>
                  </div>
                )}
                {pseudogenes !== undefined && (
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                    <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">Pseudo</span>
                    <span className="text-xs sm:text-sm font-semibold text-accent tabular-nums truncate">
                      {pseudogenes.toLocaleString()}
                    </span>
                  </div>
                )}
                {hasBusco && (
                  <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 col-span-2 sm:col-span-1">
                    <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
                      <span className="lg:hidden">BUSCO</span>
                      <span className="hidden lg:inline">BUSCO complete</span>
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-foreground tabular-nums">
                      {Number(buscoComplete).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Biotypes Tags */}
            {topBiotypes.length > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {topBiotypes.map((biotype) => (
                  <Badge key={biotype} variant="outline" className="text-[10px] sm:text-xs max-w-full truncate">
                    {biotype}
                  </Badge>
                ))}
                {hasMoreBiotypes && (
                  <span className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
                    +{(annotation.features_summary?.biotypes?.length || 0) - 4} more
                  </span>
                )}
              </div>
            )}

            {/* Metadata Footer */}
            <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1.5 text-[10px] sm:text-xs text-muted-foreground pt-2 border-t border-border/50">
              {fileSize != null && (
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <HardDrive className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="tabular-nums">{convertToHumanReadableSize(fileSize)}</span>
                </div>
              )}
              {releaseDate && (
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="tabular-nums">{new Date(releaseDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions — same column on the right at lg+ */}
          <div className="flex items-start pt-0.5 sm:pt-1 shrink-0">
            <AnnotationActions annotation={annotation} />
          </div>
        </div>
      </div>
    </Card>
  )
}
