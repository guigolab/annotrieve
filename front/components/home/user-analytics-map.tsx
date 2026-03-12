"use client"

import { useEffect, useState, useRef } from "react"
import { getCountryFrequencies, type CountryFrequencies } from "@/lib/api/analytics"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/ui/section-header"
import { Globe } from "lucide-react"
import { ReactNode } from "react"
import * as d3 from "d3"
import { feature } from "topojson-client"
import type { Topology, GeometryCollection } from "topojson-specification"

interface UserAnalyticsMapProps {
  title?: string
  description?: ReactNode
}

// Country name mapping to handle variations
const COUNTRY_NAME_MAP: Record<string, string> = {
  "United States": "United States of America",
  "United Kingdom": "United Kingdom",
  "Czechia": "Czech Republic",
  "UAE": "United Arab Emirates",
  "United Arab Emirates": "United Arab Emirates",
}

export function UserAnalyticsMap({ title, description }: UserAnalyticsMapProps) {
  const [data, setData] = useState<CountryFrequencies>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const frequencies = await getCountryFrequencies()
        setData(frequencies)
      } catch (err) {
        setError('Failed to load user analytics')
        console.error('Error fetching country frequencies:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  useEffect(() => {
    if (loading || error || !svgRef.current || !containerRef.current || Object.keys(data).length === 0) {
      return
    }

    const renderMap = async () => {
      const svg = d3.select(svgRef.current)
      const container = containerRef.current!
      
      // Clear previous content
      svg.selectAll("*").remove()

      // Get container dimensions
      const width = container.clientWidth
      const height = Math.min(600, width * 0.6)

      svg.attr("viewBox", `0 0 ${width} ${height}`)

      // Create main group for map
      const g = svg.append("g")

      // Load world topology
      const worldData = await d3.json<Topology>(
        "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
      )

      if (!worldData) {
        throw new Error("Failed to load world map data")
      }

      // Convert TopoJSON to GeoJSON
      const countries = feature(
        worldData,
        worldData.objects.countries as GeometryCollection
      )

      // Create projection
      const projection = d3.geoNaturalEarth1()
        .fitSize([width, height], countries)

      const path = d3.geoPath().projection(projection)

      // Prepare data with normalized country names
      const normalizedData: Record<string, number> = {}
      Object.entries(data).forEach(([country, count]) => {
        if (country !== "Unknown") {
          const normalizedName = COUNTRY_NAME_MAP[country] || country
          normalizedData[normalizedName] = (normalizedData[normalizedName] || 0) + count
        }
      })

      // Get max value for color scale
      const maxCount = Math.max(...Object.values(normalizedData))
      
      // Create color scale with red palette
      const colorScale = d3.scaleSequential()
        .domain([0, maxCount])
        .interpolator(d3.interpolateReds)

      // Create tooltip
      const tooltip = d3.select("body")
        .append("div")
        .attr("class", "absolute hidden bg-background border border-border rounded-lg shadow-lg px-3 py-2 text-sm pointer-events-none z-50")
        .style("max-width", "200px")

      // Draw countries
      g.selectAll("path")
        .data(countries.features)
        .join("path")
        .attr("d", path as any)
        .attr("fill", (d: any) => {
          const countryName = d.properties.name
          const count = normalizedData[countryName]
          return count ? colorScale(count) : "#e5e7eb"
        })
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 0.5)
        .attr("class", "transition-all duration-200 cursor-pointer")
        .on("mouseenter", function(event: MouseEvent, d: any) {
          const countryName = d.properties.name
          const count = normalizedData[countryName]
          
          if (count) {
            d3.select(this)
              .attr("stroke", "#1e293b")
              .attr("stroke-width", 1.5)
              .attr("opacity", 0.8)

            tooltip
              .style("left", `${event.pageX + 10}px`)
              .style("top", `${event.pageY - 10}px`)
              .classed("hidden", false)
              .html(`
                <div class="font-semibold mb-1">${countryName}</div>
                <div class="text-muted-foreground">
                  <span class="font-medium text-foreground">${count}</span> unique ${count === 1 ? 'user' : 'users'}
                </div>
              `)
          }
        })
        .on("mousemove", function(event: MouseEvent) {
          tooltip
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY - 10}px`)
        })
        .on("mouseleave", function() {
          d3.select(this)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 0.5)
            .attr("opacity", 1)

          tooltip.classed("hidden", true)
        })

      // Add zoom behavior
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 8])
        .on("zoom", (event) => {
          g.attr("transform", event.transform.toString())
        })

      svg.call(zoom as any)

      // Cleanup tooltip on unmount
      return () => {
        tooltip.remove()
      }
    }

    renderMap().catch(err => {
      console.error("Error rendering map:", err)
      setError("Failed to render map visualization")
    })
  }, [data, loading, error])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "User Analytics by Country"}
          description={description ?? "Geographic distribution of unique users accessing Annotrieve worldwide."}
          icon={Globe}
          iconColor="text-red-600"
          iconBgColor="bg-red-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading analytics data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "User Analytics by Country"}
          description={description ?? "Geographic distribution of unique users accessing Annotrieve worldwide."}
          icon={Globe}
          iconColor="text-red-600"
          iconBgColor="bg-red-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "User Analytics by Country"}
        description={description ?? "Geographic distribution of unique users accessing Annotrieve worldwide. Hover over countries to see detailed user counts."}
        icon={Globe}
        iconColor="text-red-600"
        iconBgColor="bg-red-500/10"
        align="center"
      />

      <div className="max-w-7xl mx-auto">
        {/* Map Visualization */}
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-red-600" />
              Global Distribution
            </CardTitle>
            <CardDescription>
              Interactive choropleth map showing user distribution. Zoom and pan to explore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={containerRef} className="w-full">
              <svg 
                ref={svgRef} 
                className="w-full h-auto border border-border/40 rounded-md bg-background/50"
              />
            </div>
            
            {/* Color Legend */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground">Low</span>
              <div className="flex h-4 w-64 rounded-sm overflow-hidden border border-border/60">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{
                      backgroundColor: d3.interpolateReds(i / 9)
                    }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">High</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
