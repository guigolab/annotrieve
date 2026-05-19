"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import * as d3 from "d3"
import { feature } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"
import type { FeatureCollection } from "geojson"
import { useUIStore } from "@/lib/stores/ui"
import { normalizeCountryName } from "@/lib/country-name-map"
import {
  getVisitorMapColorScale,
  getVisitorMapThemeColors,
} from "@/lib/visitor-map-theme"
import type { CountryFrequencies, TopVisitor } from "@/lib/api/analytics"

const WORLD_ATLAS_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

const MAP_HEIGHT = 420

let cachedTopology: Topology | null = null

function normalizeFrequencies(data: CountryFrequencies): Record<string, number> {
  const normalized: Record<string, number> = {}
  Object.entries(data).forEach(([country, count]) => {
    if (country !== "Unknown") {
      const name = normalizeCountryName(country)
      normalized[name] = (normalized[name] || 0) + count
    }
  })
  return normalized
}

async function loadWorldTopology(): Promise<Topology> {
  if (cachedTopology) return cachedTopology
  const res = await fetch(WORLD_ATLAS_URL)
  if (!res.ok) throw new Error(`Failed to load map topology: HTTP ${res.status}`)
  cachedTopology = (await res.json()) as Topology
  return cachedTopology
}

interface VisitorChoroplethMapProps {
  countryFrequencies: CountryFrequencies
  topVisitors?: TopVisitor[]
}

function VisitorChoroplethMap({
  countryFrequencies,
  topVisitors = [],
}: VisitorChoroplethMapProps) {
  const theme = useUIStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 0, height: MAP_HEIGHT })
  const [mapError, setMapError] = useState(false)

  const normalizedData = useMemo(
    () => normalizeFrequencies(countryFrequencies),
    [countryFrequencies]
  )
  const maxCount = useMemo(
    () => Math.max(1, ...Object.values(normalizedData)),
    [normalizedData]
  )
  const highlightCountries = useMemo(
    () => new Set(topVisitors.map((v) => normalizeCountryName(v.country))),
    [topVisitors]
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateSize = () => {
      const width = el.clientWidth
      if (width > 0) setSize({ width, height: MAP_HEIGHT })
    }

    updateSize()
    let timeoutId: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(updateSize, 100)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container || size.width <= 0) return

    let cancelled = false
    let tooltip: d3.Selection<HTMLDivElement, unknown, null, undefined> | null =
      null

    async function draw() {
      try {
        d3.selectAll(".visitor-choropleth-tooltip").remove()

        const worldData = await loadWorldTopology()
        if (cancelled) return

        const countries = feature(
          worldData,
          worldData.objects.countries as GeometryCollection
        ) as FeatureCollection

        const colors = getVisitorMapThemeColors(theme)
        const colorScale = getVisitorMapColorScale(theme, maxCount)

        const width = size.width
        const height = size.height

        const svgSel = d3.select(svg)
        svgSel.selectAll("*").remove()
        svgSel.attr("viewBox", `0 0 ${width} ${height}`)

        const projection = d3.geoNaturalEarth1().fitSize([width, height], countries)
        const path = d3.geoPath().projection(projection)
        const g = svgSel.append("g")

        tooltip = d3
          .select(document.body)
          .append("div")
          .attr("class", "visitor-choropleth-tooltip")
          .style("position", "fixed")
          .style("pointer-events", "none")
          .style("z-index", "50")
          .style("display", "none")

        g.selectAll("path")
          .data(countries.features)
          .join("path")
          .attr("d", path)
          .attr("fill", (d) => {
            const name = d.properties?.name as string | undefined
            const count = name ? normalizedData[name] : undefined
            return count ? colorScale(count) : colors.emptyFill
          })
          .attr("stroke", (d) => {
            const name = d.properties?.name as string | undefined
            return name && highlightCountries.has(name)
              ? colors.highlightStroke
              : colors.stroke
          })
          .attr("stroke-width", (d) => {
            const name = d.properties?.name as string | undefined
            return name && highlightCountries.has(name) ? 1.5 : 0.5
          })
          .attr("class", "transition-colors duration-150")
          .style("cursor", (d) => {
            const name = d.properties?.name as string | undefined
            return name && normalizedData[name] ? "pointer" : "default"
          })
          .on("mouseenter", function (event, d) {
            const countryName = d.properties?.name as string
            const count = normalizedData[countryName]
            if (!count || !tooltip) return

            d3.select(this)
              .attr("stroke", colors.hoverStroke)
              .attr("stroke-width", 1.5)
              .attr("opacity", 0.9)

            tooltip
              .style("left", `${event.pageX + 12}px`)
              .style("top", `${event.pageY - 8}px`)
              .style("display", "block")
              .html(
                `<div class="font-semibold mb-1">${countryName}</div>` +
                  `<div class="text-muted-foreground"><span class="font-medium text-foreground">${count}</span> unique ${count === 1 ? "user" : "users"}</div>`
              )
          })
          .on("mousemove", function (event) {
            if (!tooltip) return
            tooltip
              .style("left", `${event.pageX + 12}px`)
              .style("top", `${event.pageY - 8}px`)
          })
          .on("mouseleave", function (_, d) {
            const countryName = d.properties?.name as string
            const isHighlight = highlightCountries.has(countryName)

            d3.select(this)
              .attr("stroke", isHighlight ? colors.highlightStroke : colors.stroke)
              .attr("stroke-width", isHighlight ? 1.5 : 0.5)
              .attr("opacity", 1)

            tooltip?.style("display", "none")
          })
      } catch (err) {
        console.error("Choropleth render error:", err)
        if (!cancelled) setMapError(true)
      }
    }

    draw()

    return () => {
      cancelled = true
      d3.selectAll(".visitor-choropleth-tooltip").remove()
      d3.select(svg).selectAll("*").remove()
    }
  }, [
    theme,
    normalizedData,
    maxCount,
    highlightCountries,
    size.width,
    size.height,
  ])

  if (mapError) {
    return (
      <div className="flex h-[420px] items-center justify-center text-muted-foreground">
        Failed to render map
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[420px] w-full"
      aria-label="World map of Annotrieve users by country"
    >
      {size.width <= 0 ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          Loading map…
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="visitor-choropleth-svg h-full w-full rounded-md border border-border/40 bg-muted/20"
          role="img"
        />
      )}
    </div>
  )
}

export default memo(VisitorChoroplethMap)
