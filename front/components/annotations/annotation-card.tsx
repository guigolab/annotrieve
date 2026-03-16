"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, HardDrive } from "lucide-react"
import { AnnotationActions } from "./annotation-actions"
import type { Annotation } from "@/lib/types"

interface AnnotationCardProps {
  annotation: Annotation
  isSelected: boolean
}

function convertToHumanReadableSize(file_size: any) {
  const units = ["B", "KB", "MB", "GB", "TB"]
  const index = Math.floor(Math.log10(file_size) / 3)
  return (file_size / Math.pow(1024, index)).toFixed(2) + " " + units[index]
}

export function AnnotationCard({ annotation, isSelected }: AnnotationCardProps) {
  const rootCounts = annotation.features_summary?.root_type_counts ?? {};
  const rootCountEntries = Object.entries(rootCounts).sort((a, b) => b[1] - a[1]);
  
  // Get top biotypes
  const topBiotypes = annotation.features_summary?.biotypes?.slice(0, 4) || [];
  const hasMoreBiotypes = (annotation.features_summary?.biotypes?.length || 0) > 4;
  
  // Get gene counts from new structure
  const codingGenes = annotation.features_statistics?.gene_category_stats?.['coding']?.total_count;
  const nonCodingGenes = annotation.features_statistics?.gene_category_stats?.['non_coding']?.total_count;
  const pseudogenes = annotation.features_statistics?.gene_category_stats?.['pseudogene']?.total_count;
  const hasGeneCounts = codingGenes !== undefined || nonCodingGenes !== undefined || pseudogenes !== undefined;
  const buscoComplete = annotation.busco?.complete;
  const hasBusco = buscoComplete !== undefined && buscoComplete !== null;
  
  return (
    <Card className={`group relative overflow-hidden transition-all duration-200 ${
      isSelected 
        ? 'border-primary bg-primary/5 shadow-md' 
        : 'border hover:border-primary/50 hover:shadow-lg hover:bg-muted/30'
    }`}>
      {/* Selection indicator bar */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 bg-primary" />
      )}
      
      <div className="p-5">
        <div className="flex items-start gap-4">

          <div className="flex-1 min-w-0 space-y-4">
            {/* Header Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge 
                  variant="secondary" 
                  className="text-xs font-semibold"
                >
                  {annotation.source_file_info.database}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {annotation.source_file_info.provider}
                </Badge>
              </div>
              
              <h4 className="text-base italic font-semibold mb-1 group-hover:text-primary transition-colors">
                {annotation.organism_name}
              </h4>
              
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="text-xs font-mono">{annotation.assembly_name}</span>
              </div>
            </div>

            {/* Gene Counts */}
            {(hasGeneCounts || hasBusco) && (
                <div className="flex items-center gap-4 flex-wrap">
                  {codingGenes !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Coding</span>
                      <span className="text-sm font-semibold text-primary">{codingGenes.toLocaleString()}</span>
                    </div>
                  )}
                  {nonCodingGenes !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Non-coding</span>
                      <span className="text-sm font-semibold text-secondary">{nonCodingGenes.toLocaleString()}</span>
                    </div>
                  )}
                  {pseudogenes !== undefined && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Pseudo</span>
                      <span className="text-sm font-semibold text-accent">{pseudogenes.toLocaleString()}</span>
                    </div>
                  )}
                  {hasBusco && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">BUSCO complete</span>
                      <span className="text-sm font-semibold text-foreground">{Number(buscoComplete).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
            )}


            {/* Biotypes Tags */}
            {topBiotypes.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {topBiotypes.map((biotype) => (
                  <Badge key={biotype} variant="outline" className="text-xs">
                    {biotype}
                  </Badge>
                ))}
                {hasMoreBiotypes && (
                  <span className="text-xs text-muted-foreground">
                    +{(annotation.features_summary?.biotypes?.length || 0) - 4} more
                  </span>
                )}
              </div>
            )}

            {/* Metadata Footer */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                <span>{convertToHumanReadableSize(annotation.indexed_file_info.file_size)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>{new Date(annotation.source_file_info.release_date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-start pt-1">
            <AnnotationActions annotation={annotation} />
          </div>
        </div>
      </div>
    </Card>
  )
}

