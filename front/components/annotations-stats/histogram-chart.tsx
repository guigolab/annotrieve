"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { useUIStore } from "@/lib/stores/ui"

export interface HistogramSeries {
  id: string
  label: string
  values: number[]
  color: string
}

interface HistogramChartProps {
  /** Single-series legacy API */
  values?: number[]
  color?: string
  title: string
  xAxisLabel?: string
  yAxisLabel?: string
  binCount?: number
  height?: number
  useLogScale?: boolean
  /** Multi-series API — overrides values/color when provided */
  series?: HistogramSeries[]
  /** Optional single set of reference lines (legacy) */
  referenceValues?: number[]
  referenceColor?: string
  referenceLabel?: string
  /** Multiple reference series (e.g. one per selected favorite) */
  referenceSeries?: { values: number[]; color: string; label: string }[]
}

// ─── KDE helpers ────────────────────────────────────────────────────────────

function kernelEpanechnikov(k: number) {
  return (v: number) => (Math.abs((v /= k)) <= 1 ? (0.75 * (1 - v * v)) / k : 0)
}

function kernelDensityEstimator(kernel: (v: number) => number, X: number[]) {
  return (V: number[]): [number, number][] =>
    X.map(x => [x, d3.mean(V, v => kernel(x - v)) || 0])
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HistogramChart({
  values,
  color,
  title,
  xAxisLabel,
  yAxisLabel = "Frequency",
  binCount = 30,
  height = 400,
  useLogScale = false,
  series: seriesProp,
  referenceValues,
  referenceColor = "#f59e0b",
  referenceLabel = "Favorites",
  referenceSeries,
}: HistogramChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"

  const textColor = isDark ? "#e5e7eb" : "#0f172a"
  const gridColor = isDark ? "rgba(156, 163, 175, 0.1)" : "rgba(100, 116, 139, 0.1)"
  const axisColor = isDark ? "#9ca3af" : "#64748b"

  // Normalise to a unified series array
  const allSeries: HistogramSeries[] = seriesProp
    ? seriesProp
    : [
        {
          id: "__single__",
          label: title,
          values: values || [],
          color: color || (isDark ? "#3b82f6" : "#2563eb"),
        },
      ]

  const isMulti = allSeries.length > 1

  // ── ResizeObserver ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Main D3 effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || containerWidth === 0) return
    if (allSeries.every(s => s.values.length === 0)) return

    const margin = { top: isMulti ? 24 : 20, right: 20, bottom: isMulti ? 80 : 60, left: 60 }
    const svgWidth = Math.max(containerWidth, 320)
    const width = svgWidth - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    const svg = d3.select(svgRef.current)
      .attr("width", svgWidth)
      .attr("height", height)

    // ── Get-or-create persistent SVG structure ──────────────────────────────
    let mainG = svg.select<SVGGElement>("g.main-group")
    if (mainG.empty()) {
      mainG = svg.append("g")
        .attr("class", "main-group")
        .attr("transform", `translate(${margin.left},${margin.top})`)
    } else {
      mainG.attr("transform", `translate(${margin.left},${margin.top})`)
    }

    // Filter valid values per series
    const cleanSeries = allSeries
      .map(s => ({
        ...s,
        values: s.values.filter(v => typeof v === "number" && isFinite(v) && v > 0),
      }))
      .filter(s => s.values.length > 0)

    if (cleanSeries.length === 0) return

    // ── Process values (log transform if needed) ────────────────────────────
    const processedSeries = cleanSeries.map(s => ({
      ...s,
      processed: useLogScale ? s.values.map(v => Math.log10(v)) : s.values,
    }))

    const allProcessed = processedSeries.flatMap(s => s.processed)
    const xExtent = d3.extent(allProcessed) as [number, number]
    if (xExtent[0] === xExtent[1]) return

    // ── Scales ──────────────────────────────────────────────────────────────
    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, width])
      .nice()

    const xNice = xScale.domain() as [number, number]

    // Compute bins per series using shared thresholds
    const histGen = d3.bin()
      .domain(xNice)
      .thresholds(binCount)

    const binnedSeries = processedSeries.map(s => ({
      ...s,
      bins: histGen(s.processed),
    }))

    const maxCount = d3.max(binnedSeries.flatMap(s => s.bins), d => d.length) || 1
    const yScale = d3.scaleLinear()
      .domain([0, maxCount * 1.05])
      .range([chartHeight, 0])
      .nice()

    // ── Grid ────────────────────────────────────────────────────────────────
    let gridGroup = mainG.select<SVGGElement>("g.grid")
    if (gridGroup.empty()) gridGroup = mainG.append("g").attr("class", "grid")
    gridGroup
      .transition().duration(600).ease(d3.easeQuadInOut)
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => "")
          .ticks(5) as any
      )
      .attr("stroke", gridColor)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
    gridGroup.select(".domain").remove()

    // ── X Axis ──────────────────────────────────────────────────────────────
    let xAxisGroup = mainG.select<SVGGElement>("g.x-axis")
    if (xAxisGroup.empty()) {
      xAxisGroup = mainG.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${chartHeight})`)
    } else {
      xAxisGroup.attr("transform", `translate(0,${chartHeight})`)
    }
    const fmtTick = (d: d3.NumberValue) => {
      const v = d as number
      if (useLogScale) {
        const orig = Math.pow(10, v)
        if (orig >= 1_000_000) return `${(orig / 1_000_000).toFixed(1)}M`
        if (orig >= 1_000) return `${(orig / 1_000).toFixed(1)}k`
        return orig.toFixed(0)
      }
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
      if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
      return v.toFixed(0)
    }
    xAxisGroup
      .transition().duration(600).ease(d3.easeQuadInOut)
      .call(d3.axisBottom(xScale).ticks(8).tickFormat(fmtTick) as any)
    xAxisGroup.selectAll("text").attr("fill", axisColor).attr("font-size", "11px")
    xAxisGroup.selectAll("line, path").attr("stroke", axisColor)

    // ── Y Axis ──────────────────────────────────────────────────────────────
    let yAxisGroup = mainG.select<SVGGElement>("g.y-axis")
    if (yAxisGroup.empty()) yAxisGroup = mainG.append("g").attr("class", "y-axis")
    yAxisGroup
      .transition().duration(600).ease(d3.easeQuadInOut)
      .call(
        d3.axisLeft(yScale).ticks(5).tickFormat(d => {
          const v = d as number
          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
          if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
          return v.toFixed(0)
        }) as any
      )
    yAxisGroup.selectAll("text").attr("fill", axisColor).attr("font-size", "11px")
    yAxisGroup.selectAll("line, path").attr("stroke", axisColor)

    // ── Axis labels ──────────────────────────────────────────────────────────
    let xLabelEl = mainG.select<SVGTextElement>("text.x-label")
    if (xLabelEl.empty()) {
      xLabelEl = mainG.append("text").attr("class", "x-label")
        .attr("text-anchor", "middle")
        .attr("fill", textColor)
        .attr("font-size", "12px")
        .attr("font-weight", "500")
    }
    xLabelEl
      .attr("transform", `translate(${width / 2},${chartHeight + (isMulti ? 45 : 45)})`)
      .text(useLogScale ? `log₁₀(${xAxisLabel || title})` : (xAxisLabel || title))

    let yLabelEl = mainG.select<SVGTextElement>("text.y-label")
    if (yLabelEl.empty()) {
      yLabelEl = mainG.append("text").attr("class", "y-label")
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .attr("fill", textColor)
        .attr("font-size", "12px")
        .attr("font-weight", "500")
    }
    yLabelEl
      .attr("x", -chartHeight / 2)
      .attr("y", -45)
      .text(yAxisLabel)

    // ── Series bar groups (enter / update / exit) ───────────────────────────
    let seriesContainer = mainG.select<SVGGElement>("g.series-container")
    if (seriesContainer.empty()) {
      seriesContainer = mainG.append("g").attr("class", "series-container")
    }

    const seriesGroups = seriesContainer
      .selectAll<SVGGElement, typeof binnedSeries[number]>("g.series")
      .data(binnedSeries, d => d.id)

    // Exit
    seriesGroups.exit()
      .transition().duration(400).ease(d3.easeCubicIn)
      .style("opacity", 0)
      .remove()

    // Enter
    const seriesEnter = seriesGroups.enter()
      .append("g")
      .attr("class", "series")
      .style("opacity", 0)

    seriesEnter.transition().duration(600).ease(d3.easeCubicOut).style("opacity", 1)

    // Update + enter merged
    const seriesMerged = seriesEnter.merge(seriesGroups)

    const barFillOpacity = isMulti ? 0.3 : 0.55
    const barStrokeOpacity = isMulti ? 0.8 : 0.9

    seriesMerged.each(function (seriesData) {
      const g = d3.select(this)
      const { bins, color: sc } = seriesData
      const transitionDur = 700

      // Bars
      const bars = g.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .data(bins, d => String(d.x0))

      bars.exit()
        .transition().duration(400).ease(d3.easeCubicIn)
        .attr("y", chartHeight)
        .attr("height", 0)
        .style("opacity", 0)
        .remove()

      bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("fill", sc)
        .attr("fill-opacity", barFillOpacity)
        .attr("stroke", sc)
        .attr("stroke-opacity", barStrokeOpacity)
        .attr("stroke-width", 1.5)
        .attr("rx", 1)
        .attr("x", d => xScale(d.x0!))
        .attr("width", d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
        .attr("y", chartHeight)
        .attr("height", 0)
        .merge(bars)
        .transition().duration(transitionDur).ease(d3.easeCubicOut)
        .attr("x", d => xScale(d.x0!))
        .attr("width", d => Math.max(0, xScale(d.x1!) - xScale(d.x0!) - 1))
        .attr("y", d => yScale(d.length))
        .attr("height", d => Math.max(0, chartHeight - yScale(d.length)))
        .attr("fill", sc)
        .attr("stroke", sc)

      // KDE density curve
      const range = xNice[1] - xNice[0]
      const stdDev = d3.deviation(seriesData.processed) || range / 4
      const bw = Math.max(1.06 * stdDev * Math.pow(seriesData.processed.length, -0.2), range / 100)
      const numTicks = Math.max(80, Math.floor(width / 3))
      const xTicks: number[] = []
      for (let i = 0; i <= numTicks; i++) {
        xTicks.push(xNice[0] + range * (i / numTicks))
      }
      const kde = kernelDensityEstimator(kernelEpanechnikov(bw), xTicks)
      const density = kde(seriesData.processed)
        .filter(([x, y]) => y > 0 && isFinite(y) && x >= xNice[0] && x <= xNice[1])

      const avgBinWidth = range / binCount
      const densityToCount = seriesData.processed.length * avgBinWidth

      const lineGen = d3.line<[number, number]>()
        .x(([x]) => xScale(x))
        .y(([, y]) => yScale(Math.max(0, y * densityToCount)))
        .curve(d3.curveBasis)
        .defined(([x, y]) => isFinite(xScale(x)) && isFinite(yScale(y * densityToCount)))

      let kdePath = g.select<SVGPathElement>("path.kde")
      if (kdePath.empty()) {
        kdePath = g.append("path")
          .attr("class", "kde")
          .attr("fill", "none")
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .style("opacity", 0)
      }
      if (density.length > 1) {
        kdePath
          .attr("stroke", sc)
          .attr("stroke-width", isMulti ? 2 : 2.5)
          .attr("d", lineGen(density))
          .transition().duration(transitionDur + 200).ease(d3.easeCubicOut)
          .style("opacity", isMulti ? 0.75 : 0.85)
      } else {
        kdePath.style("opacity", 0)
      }

      // Hover interactions
      g.selectAll<SVGRectElement, d3.Bin<number, number>>("rect.bar")
        .on("mouseover", function (event, d) {
          d3.select(this)
            .transition().duration(150)
            .attr("fill-opacity", Math.min(barFillOpacity + 0.25, 0.85))
            .attr("stroke-width", 2.5)

          let tip = d3.select<HTMLDivElement, unknown>("div.histogram-tooltip-global")
          if (tip.empty()) {
            tip = d3.select("body").append("div")
              .attr("class", "histogram-tooltip-global")
              .style("position", "absolute")
              .style("background", isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)")
              .style("border", `1px solid ${isDark ? "#334155" : "#e2e8f0"}`)
              .style("border-radius", "6px")
              .style("padding", "8px 12px")
              .style("font-size", "12px")
              .style("pointer-events", "none")
              .style("box-shadow", "0 4px 6px -1px rgba(0,0,0,0.1)")
              .style("z-index", "1000")
              .style("opacity", "0")
          }

          const dispX0 = useLogScale ? Math.pow(10, d.x0!).toFixed(2) : d.x0!.toFixed(2)
          const dispX1 = useLogScale ? Math.pow(10, d.x1!).toFixed(2) : d.x1!.toFixed(2)
          const pct = ((d.length / seriesData.processed.length) * 100).toFixed(1)
          tip
            .style("opacity", "1")
            .html(`
              <div style="font-weight:600;color:${textColor};margin-bottom:4px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${sc};margin-right:6px;vertical-align:middle"></span>
                ${seriesData.label}
              </div>
              <div style="color:${axisColor}">
                <strong>Range:</strong> ${dispX0} – ${dispX1}<br/>
                <strong>Count:</strong> ${d.length.toLocaleString()}<br/>
                <strong>Pct:</strong> ${pct}%
              </div>
            `)
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY - 10}px`)
        })
        .on("mousemove", function (event) {
          d3.select("div.histogram-tooltip-global")
            .style("left", `${event.pageX + 12}px`)
            .style("top", `${event.pageY - 10}px`)
        })
        .on("mouseout", function () {
          d3.select(this).transition().duration(150)
            .attr("fill-opacity", barFillOpacity)
            .attr("stroke-width", 1.5)
          d3.select("div.histogram-tooltip-global").style("opacity", "0")
        })
    })

    // ── Legend (multi-series only) ──────────────────────────────────────────
    let legendGroup = mainG.select<SVGGElement>("g.series-legend")
    if (!isMulti) {
      legendGroup.remove()
    } else {
      if (legendGroup.empty()) {
        legendGroup = mainG.append("g").attr("class", "series-legend")
      }
      legendGroup.attr("transform", `translate(${width / 2}, ${chartHeight + 56})`)

      const legendItems = legendGroup.selectAll<SVGGElement, typeof binnedSeries[number]>("g.leg-item")
        .data(binnedSeries, d => d.id)

      legendItems.exit().transition().duration(400).style("opacity", 0).remove()

      const legendEnter = legendItems.enter().append("g").attr("class", "leg-item").style("opacity", 0)
      legendEnter.transition().duration(600).style("opacity", 1)

      const legendMerged = legendEnter.merge(legendItems)
      const itemW = 130
      legendMerged.each(function (d, i) {
        const total = binnedSeries.length
        const startX = -(total * itemW) / 2
        const gItem = d3.select(this)

        let rect = gItem.select<SVGRectElement>("rect")
        if (rect.empty()) rect = gItem.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("y", -6)
        rect.transition().duration(600).attr("x", startX + i * itemW).attr("fill", d.color)

        let txt = gItem.select<SVGTextElement>("text")
        if (txt.empty()) {
          txt = gItem.append("text")
            .attr("font-size", "11px")
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .attr("fill", textColor)
        }
        txt.transition().duration(600).attr("x", startX + i * itemW + 16).attr("y", 0).text(d.label)
      })
    }

    // ── Reference lines (single or multiple series) ──────────────────────────
    mainG.select("g.reference-lines").remove()
    const seriesToDraw = (referenceSeries && referenceSeries.length > 0)
      ? referenceSeries
      : (referenceValues && referenceValues.length > 0)
        ? [{ values: referenceValues.filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0), color: referenceColor, label: referenceLabel }]
        : []
    if (seriesToDraw.length > 0) {
      const refG = mainG.append("g").attr("class", "reference-lines")
      let legendY = 4
      seriesToDraw.forEach(({ values, color, label }) => {
        values.forEach(rv => {
          const xPos = xScale(useLogScale ? Math.log10(rv) : rv)
          if (!isFinite(xPos)) return
          refG.append("line")
            .attr("x1", xPos).attr("x2", xPos)
            .attr("y1", 0).attr("y2", chartHeight)
            .attr("stroke", color)
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4,3")
            .style("opacity", 0.8)
        })
        const legG = refG.append("g").attr("transform", `translate(${width - 4}, ${legendY})`)
        legG.append("line").attr("x1", -54).attr("x2", -38).attr("y1", 6).attr("y2", 6)
          .attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,3")
        legG.append("text").attr("x", -34).attr("y", 10).attr("fill", textColor).attr("font-size", "10px").text(label)
        legendY += 18
      })
    }
  }, [allSeries, containerWidth, height, binCount, useLogScale, referenceValues, referenceColor, referenceLabel, referenceSeries, isDark, textColor, gridColor, axisColor, isMulti, xAxisLabel, yAxisLabel, title])

  // Cleanup global tooltip on unmount
  useEffect(() => {
    return () => {
      d3.select("div.histogram-tooltip-global").remove()
    }
  }, [])

  const hasData = allSeries.some(s => s.values.length > 0)
  if (!hasData) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-sm text-muted-foreground">No data to display</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
    </div>
  )
}
