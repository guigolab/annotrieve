"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)
import { cn } from "@/lib/utils"
import {
  type EntityMode,
  type GeneRowData,
  type TranscriptRowData,
  SEGMENT_COLORS,
  GENE_CATEGORY_LABELS,
  collectGeneCategories,
  collectTranscriptTypes,
} from "./comparison-chart-utils"

interface ComparisonStackedBarCardProps {
  entityMode: EntityMode
  onEntityModeChange: (mode: EntityMode) => void
  geneData: GeneRowData[]
  transcriptData: TranscriptRowData[]
  organismLabelMap: Record<string, string>
  hasGeneData: boolean
  hasTranscriptData: boolean
}

export function ComparisonStackedBarCard({
  entityMode,
  onEntityModeChange,
  geneData,
  transcriptData,
  organismLabelMap,
  hasGeneData,
  hasTranscriptData,
}: ComparisonStackedBarCardProps) {
  const geneCategories = collectGeneCategories(geneData)
  const transcriptTypes = collectTranscriptTypes(transcriptData)

  const activeData = entityMode === "genes" ? geneData : transcriptData
  const labels = activeData.map((row) => organismLabelMap[row.annotation.annotation_id])

  const segments =
    entityMode === "genes"
      ? geneCategories.map((key) => ({
          key,
          label: GENE_CATEGORY_LABELS[key],
        }))
      : transcriptTypes.map((type) => ({ key: type, label: type }))

  const hasActiveData =
    entityMode === "genes" ? geneCategories.length > 0 : transcriptTypes.length > 0

  const datasets = segments.map((segment, idx) => ({
    label: segment.label,
    data:
      entityMode === "genes"
        ? geneData.map((row) => row.categories?.[segment.key]?.total_count || 0)
        : transcriptData.map((row) => row.transcriptTypeStats?.[segment.key]?.total_count || 0),
    backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
    borderColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
    borderWidth: 1,
  }))

  const chartData = { labels, datasets }

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
        labels: {
          color: "#64748b",
          font: { size: 10 },
          boxWidth: 12,
          padding: 8,
        },
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        borderColor: "#374151",
        borderWidth: 1,
        callbacks: {
          label(context: { dataset: { label?: string }; parsed: { x: number | null } }) {
            const value = (context.parsed.x ?? 0).toLocaleString()
            const unit = entityMode === "genes" ? " genes" : " transcripts"
            return `${context.dataset.label}: ${value}${unit}`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          color: "#64748b",
          font: { size: 10 },
          callback(value: string | number) {
            return Number(value).toLocaleString()
          },
        },
        grid: { display: true, color: "#e2e8f0" },
      },
      y: {
        stacked: true,
        ticks: { color: "#64748b", font: { size: 11 } },
        grid: { display: false },
      },
    },
  }

  return (
    <Card className="p-3 sm:p-4 flex-shrink-0">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-semibold text-sm sm:text-base text-foreground mb-1">
            Feature distribution — stacked
          </h4>
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            Each bar is an annotation; segments are{" "}
            {entityMode === "genes" ? "gene categories" : "transcript types"} (counts only).
          </p>
        </div>
        <EntityModeToggle
          entityMode={entityMode}
          onEntityModeChange={onEntityModeChange}
          hasGeneData={hasGeneData}
          hasTranscriptData={hasTranscriptData}
        />
      </div>

      {!hasActiveData ? (
        <div className="flex items-center justify-center h-[200px] sm:h-[250px]">
          <p className="text-xs text-muted-foreground italic">
            No {entityMode === "genes" ? "gene category" : "transcript type"} data for the selected
            annotations.
          </p>
        </div>
      ) : (
        <div className="h-[250px] sm:h-[300px]">
          <Bar data={chartData} options={options} />
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
