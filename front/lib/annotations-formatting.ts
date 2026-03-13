import { BarChart3, Hash, Ruler, Layers, Code, type LucideIcon } from "lucide-react"

export function formatLabel(str: string): string {
  return str.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

export function formatTranscriptTypeLabel(str: string): string {
  return str.replace(/_/g, " ")
}

export function formatMetricLabel(metric: string): string {
  const formatted = formatLabel(metric)
  const lower = formatted.toLowerCase()
  const result = lower.startsWith("average") ? formatted : `Average ${formatted}`
  return result.charAt(0).toUpperCase() + result.slice(1)
}

export function getMetricIcon(metric: string): LucideIcon {
  const lower = metric.toLowerCase()
  if (lower.includes("count")) return Hash
  if (lower.includes("length")) return Ruler
  if (lower.includes("exon")) return Layers
  if (lower.includes("cds") || lower.includes("coding")) return Code
  return BarChart3
}

export interface MetricColorScheme {
  iconBg: string
  iconColor: string
}

export function getMetricColor(metric: string): MetricColorScheme {
  const lower = metric.toLowerCase()
  if (lower.includes("exon")) {
    return { iconBg: "bg-blue-500/20", iconColor: "text-blue-600" }
  }
  if (lower.includes("cds") || lower.includes("coding")) {
    return { iconBg: "bg-green-500/20", iconColor: "text-green-600" }
  }
  return { iconBg: "bg-muted", iconColor: "text-muted-foreground" }
}

export function formatAxisValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(0)
}
