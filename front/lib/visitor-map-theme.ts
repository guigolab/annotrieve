import * as d3 from "d3"
import type { Theme } from "@/lib/stores/ui"

export interface VisitorMapThemeColors {
  emptyFill: string
  stroke: string
  hoverStroke: string
  highlightStroke: string
  gradientLow: string
  gradientHigh: string
}

const LIGHT_COLORS: VisitorMapThemeColors = {
  emptyFill: "oklch(0.96 0 0)",
  stroke: "oklch(0.85 0 0)",
  hoverStroke: "oklch(0.15 0 0)",
  highlightStroke: "#dc2626",
  gradientLow: "oklch(0.94 0.02 215)",
  gradientHigh: "oklch(0.58 0.13 215)",
}

const DARK_COLORS: VisitorMapThemeColors = {
  emptyFill: "oklch(0.22 0 0)",
  stroke: "oklch(0.35 0 0)",
  hoverStroke: "oklch(0.95 0 0)",
  highlightStroke: "#dc2626",
  gradientLow: "oklch(0.25 0.02 215)",
  gradientHigh: "oklch(0.72 0.14 215)",
}

export function getVisitorMapThemeColors(theme: Theme): VisitorMapThemeColors {
  return theme === "dark" ? DARK_COLORS : LIGHT_COLORS
}

export function getVisitorMapColorScale(theme: Theme, maxCount: number) {
  const colors = getVisitorMapThemeColors(theme)
  const max = Math.max(1, maxCount)
  const interpolator = d3.interpolate(colors.gradientLow, colors.gradientHigh)
  return d3.scaleSequential().domain([0, max]).interpolator(interpolator)
}

const LEGEND_STEPS = 10

export function getVisitorMapLegendStops(theme: Theme): string[] {
  const colors = getVisitorMapThemeColors(theme)
  const interpolator = d3.interpolate(colors.gradientLow, colors.gradientHigh)
  return Array.from({ length: LEGEND_STEPS }, (_, i) =>
    interpolator(i / (LEGEND_STEPS - 1))
  )
}
