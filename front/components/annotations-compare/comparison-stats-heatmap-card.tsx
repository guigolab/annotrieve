"use client"

import { useEffect, useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  type EntityMode,
  type GeneRowData,
  type TranscriptRowData,
  type GeneHeatmapMetric,
  type TranscriptHeatmapMetric,
  GENE_CATEGORY_LABELS,
  buildGeneHeatmapMetrics,
  buildTranscriptHeatmapMetrics,
  collectGeneCategories,
  collectTranscriptTypes,
  getHeatmapColor,
  getGeneHeatmapValue,
  getTranscriptHeatmapValue,
  formatHeatmapCellValue,
  isLengthMetric,
} from "./comparison-chart-utils"

interface ComparisonStatsHeatmapCardProps {
  entityMode: EntityMode
  onEntityModeChange: (mode: EntityMode) => void
  geneData: GeneRowData[]
  transcriptData: TranscriptRowData[]
  organismLabelMap: Record<string, string>
  hasGeneData: boolean
  hasTranscriptData: boolean
}

export function ComparisonStatsHeatmapCard({
  entityMode,
  onEntityModeChange,
  geneData,
  transcriptData,
  organismLabelMap,
  hasGeneData,
  hasTranscriptData,
}: ComparisonStatsHeatmapCardProps) {
  const [geneMetric, setGeneMetric] = useState<GeneHeatmapMetric>("total_count")
  const [transcriptMetric, setTranscriptMetric] = useState<TranscriptHeatmapMetric>("total_count")

  const geneMetricOptions = useMemo(() => buildGeneHeatmapMetrics(geneData), [geneData])
  const transcriptMetricOptions = useMemo(
    () => buildTranscriptHeatmapMetrics(transcriptData),
    [transcriptData],
  )
  const metricOptions = entityMode === "genes" ? geneMetricOptions : transcriptMetricOptions

  useEffect(() => {
    const options = entityMode === "genes" ? geneMetricOptions : transcriptMetricOptions
    const current = entityMode === "genes" ? geneMetric : transcriptMetric
    if (!options.some((opt) => opt.value === current)) {
      const fallback = options[0]?.value ?? "total_count"
      if (entityMode === "genes") {
        setGeneMetric(fallback as GeneHeatmapMetric)
      } else {
        setTranscriptMetric(fallback as TranscriptHeatmapMetric)
      }
    }
  }, [entityMode, geneMetricOptions, transcriptMetricOptions, geneMetric, transcriptMetric])

  const geneCategories = collectGeneCategories(geneData)
  const transcriptTypes = collectTranscriptTypes(transcriptData)

  const columns =
    entityMode === "genes"
      ? geneCategories.map((key) => ({ key, label: GENE_CATEGORY_LABELS[key] }))
      : transcriptTypes.map((type) => ({ key: type, label: type }))

  const metricField = entityMode === "genes" ? geneMetric : transcriptMetric

  const maxValue = useMemo(() => {
    const values: number[] = []
    if (entityMode === "genes") {
      geneData.forEach((row) => {
        geneCategories.forEach((cat) => {
          values.push(getGeneHeatmapValue(row.categories?.[cat], geneMetric))
        })
      })
    } else {
      transcriptData.forEach((row) => {
        transcriptTypes.forEach((type) => {
          values.push(getTranscriptHeatmapValue(row.transcriptTypeStats?.[type], transcriptMetric))
        })
      })
    }
    return Math.max(...values, 1)
  }, [entityMode, geneData, transcriptData, geneCategories, transcriptTypes, geneMetric, transcriptMetric])

  const rows = entityMode === "genes" ? geneData : transcriptData
  const hasActiveData = columns.length > 0

  return (
    <Card className="p-3 sm:p-4 flex-shrink-0">
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="font-semibold text-sm sm:text-base text-foreground mb-1">Statistics heatmap</h4>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Matrix of {entityMode === "genes" ? "gene categories" : "transcript types"} per annotation.
              Color intensity reflects the selected metric.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
            <EntityModeToggle
              entityMode={entityMode}
              onEntityModeChange={onEntityModeChange}
              hasGeneData={hasGeneData}
              hasTranscriptData={hasTranscriptData}
            />
            <Select
              value={metricField}
              onValueChange={(value) => {
                if (entityMode === "genes") {
                  setGeneMetric(value as GeneHeatmapMetric)
                } else {
                  setTranscriptMetric(value as TranscriptHeatmapMetric)
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {metricOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!hasActiveData ? (
        <div className="flex items-center justify-center h-[200px]">
          <p className="text-xs text-muted-foreground italic">
            No {entityMode === "genes" ? "gene category" : "transcript type"} data for the selected
            annotations.
          </p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[400px] border border-border rounded-md">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="h-10">
                <th className="border border-border p-1.5 text-left text-xs font-semibold bg-muted sticky left-0 z-20">
                  Annotation
                </th>
                {columns.map((col) => (
                  <th key={col.key} className="border border-border p-1.5 text-xs font-semibold bg-muted">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const annotationLabel = organismLabelMap[row.annotation.annotation_id]
                return (
                  <tr key={idx}>
                    <td className="border border-border p-1.5 text-xs font-medium bg-muted sticky left-0 z-10">
                      {annotationLabel}
                    </td>
                    {columns.map((col) => {
                      const value =
                        entityMode === "genes"
                          ? getGeneHeatmapValue(
                              (row as GeneRowData).categories?.[col.key],
                              geneMetric,
                            )
                          : getTranscriptHeatmapValue(
                              (row as TranscriptRowData).transcriptTypeStats?.[col.key],
                              transcriptMetric,
                            )

                      const displayValue = formatHeatmapCellValue(value, metricField)
                      const bgColor = value > 0 ? getHeatmapColor(value, maxValue) : "transparent"
                      const textColor = value > maxValue * 0.5 ? "#ffffff" : "#1e293b"
                      const suffix = isLengthMetric(metricField) ? " bp" : ""

                      return (
                        <td
                          key={col.key}
                          className="border border-border p-1.5 text-center text-xs"
                          style={{ backgroundColor: bgColor, color: textColor }}
                          title={`${annotationLabel} - ${col.label}: ${displayValue}${suffix}`}
                        >
                          {displayValue}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function EntityModeToggle({
  entityMode,
  onEntityModeChange,
  hasGeneData,
  hasTranscriptData,
}: {
  entityMode: EntityMode
  onEntityModeChange: (mode: EntityMode) => void
  hasGeneData: boolean
  hasTranscriptData: boolean
}) {
  return (
    <div className="flex rounded-md border border-border overflow-hidden shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-none text-xs",
          entityMode === "genes" && "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        onClick={() => onEntityModeChange("genes")}
        disabled={!hasGeneData}
      >
        Genes
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-3 rounded-none text-xs border-l border-border",
          entityMode === "transcripts" && "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
        onClick={() => onEntityModeChange("transcripts")}
        disabled={!hasTranscriptData}
      >
        Transcripts
      </Button>
    </div>
  )
}
