"use client"

import { useMemo } from "react"
import { Activity } from "lucide-react"
import { HistogramChart } from "@/components/annotations-stats/histogram-chart"
import { BoxplotChart } from "@/components/annotations-stats/boxplot-chart"
import { formatLabel } from "@/lib/annotations-formatting"

export type ChartType = "histogram" | "boxplot"

export interface ChartDataEntry {
  id: string
  label: string
  values: number[]
  color?: string
}

interface AnalyticsChartProps {
  chartType: ChartType
  data: ChartDataEntry[]
  loading: boolean
  selectedMetric: string
  useLogScale: boolean
  /** Reference values for histogram (favorites) */
  referenceValues?: number[]
  /** Reference line value for boxplot (favorites median) */
  referenceLine?: number | null
  referenceLabel?: string
  height?: number
}

const CHART_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
]

export function AnalyticsChart({
  chartType,
  data,
  loading,
  selectedMetric,
  useLogScale,
  referenceValues,
  referenceLine,
  referenceLabel = "Favorites",
  height = 440,
}: AnalyticsChartProps) {
  const allValues = useMemo(
    () => data.flatMap((d) => d.values),
    [data]
  )

  const metricLabel = useMemo(
    () => (selectedMetric ? formatLabel(selectedMetric) : ""),
    [selectedMetric]
  )

  if (loading) {
    return (
      <div
        className="flex items-center justify-center w-full"
        style={{ height }}
      >
        <div className="text-center">
          <Activity className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        </div>
      </div>
    )
  }

  if (data.length === 0 || allValues.length === 0) {
    return (
      <div
        className="flex items-center justify-center w-full border border-dashed rounded-lg bg-muted/20"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">
          No data available for the current selection
        </p>
      </div>
    )
  }

  if (chartType === "histogram") {
    // Histogram: render one chart per data source overlaid.
    // When there's only one source, render a single clean histogram.
    // With multiple sources, stack them vertically.
    if (data.length === 1) {
      const entry = data[0]
      return (
        <HistogramChart
          values={entry.values}
          title={metricLabel}
          xAxisLabel={metricLabel}
          yAxisLabel="Number of annotations"
          height={height}
          useLogScale={useLogScale}
          color={entry.color || CHART_COLORS[0]}
          referenceValues={referenceValues}
          referenceLabel={referenceLabel}
        />
      )
    }

    return (
      <div className="space-y-4 w-full">
        {data.map((entry, idx) => (
          <div key={entry.id}>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: entry.color || CHART_COLORS[idx % CHART_COLORS.length] }}
              />
              {entry.label}
            </p>
            <HistogramChart
              values={entry.values}
              title={metricLabel}
              xAxisLabel={metricLabel}
              yAxisLabel="Number of annotations"
              height={Math.round(height * 0.6)}
              useLogScale={useLogScale}
              color={entry.color || CHART_COLORS[idx % CHART_COLORS.length]}
              referenceValues={referenceValues}
              referenceLabel={referenceLabel}
            />
          </div>
        ))}
      </div>
    )
  }

  // Boxplot: multi-series natively
  const boxplotData = data.map((entry, idx) => ({
    label: entry.label,
    values: entry.values,
    color: entry.color || CHART_COLORS[idx % CHART_COLORS.length],
  }))

  return (
    <BoxplotChart
      data={boxplotData}
      title={metricLabel}
      yAxisLabel={metricLabel}
      height={height}
      useLogScale={useLogScale}
      referenceLine={referenceLine}
      referenceLabel={referenceLabel}
    />
  )
}
