"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Globe, MapPin } from "lucide-react"
import {
  getCountryFrequencies,
  getTopVisitors,
  type CountryFrequencies,
  type TopVisitor,
} from "@/lib/api/analytics"
import { getVisitorMapLegendStops } from "@/lib/visitor-map-theme"
import { useUIStore } from "@/lib/stores/ui"
import { SectionHeader } from "@/components/ui/section-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import VisitorChoroplethMap from "./visitor-choropleth-map"

interface VisitorAnalyticsSectionProps {
  title?: string
  description?: ReactNode
}

const RANK_STYLES = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-secondary/15 text-secondary border-secondary/30",
  "bg-accent/15 text-accent border-accent/30",
  "bg-muted text-muted-foreground border-border/60",
  "bg-muted text-muted-foreground border-border/60",
]

const RANK_BAR_COLORS = [
  "bg-primary/70",
  "bg-secondary/70",
  "bg-accent/70",
  "bg-muted-foreground/40",
  "bg-muted-foreground/40",
]

export function VisitorAnalyticsSection({
  title,
  description,
}: VisitorAnalyticsSectionProps) {
  const theme = useUIStore((s) => s.theme)
  const legendStops = getVisitorMapLegendStops(theme)

  const [topVisitors, setTopVisitors] = useState<TopVisitor[]>([])
  const [countryFrequencies, setCountryFrequencies] = useState<CountryFrequencies>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [visitors, frequencies] = await Promise.all([
        getTopVisitors(5),
        getCountryFrequencies(),
      ])
      setTopVisitors(visitors)
      setCountryFrequencies(frequencies)
    } catch (err) {
      setError("Failed to load usage analytics")
      console.error("Error fetching visitor analytics:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const maxVisits = Math.max(1, ...topVisitors.map((v) => v.visits_count))

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Global usage"}
          description={
            description ??
            "Anonymous, country-level usage of Annotrieve. We never store IP addresses—only hashed fingerprints and country."
          }
          icon={Globe}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            <p className="text-muted-foreground">Loading usage analytics…</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Global usage"}
          description={description}
          icon={Globe}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="mb-4 text-muted-foreground">{error}</p>
            <Button onClick={fetchData} variant="outline">
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "Global usage"}
        description={
          description ?? (
            <>
              Anonymous, country-level usage of Annotrieve. We never store IP addresses—only
              hashed fingerprints and approximate country. Visit counts reflect distinct days
              with API activity.
            </>
          )
        }
        icon={Globe}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Top visitors
          </p>
          {topVisitors.length === 0 ? (
            <Card className="border-border/60 bg-card/80">
              <CardContent className="p-4 text-sm text-muted-foreground">
                No visitor data yet.
              </CardContent>
            </Card>
          ) : (
            topVisitors.map((visitor, index) => (
              <Card
                key={`${visitor.country}-${index}`}
                className="group relative border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                style={{
                  animationDelay: `${index * 80}ms`,
                  animationDuration: "500ms",
                  animationFillMode: "both",
                }}
              >
                <CardContent className="flex items-center gap-3 p-3 pb-4">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform duration-300 group-hover:scale-110",
                      RANK_STYLES[index] ?? RANK_STYLES[4]
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors duration-300">
                      {visitor.country}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            RANK_BAR_COLORS[index] ?? RANK_BAR_COLORS[4]
                          )}
                          style={{
                            width: `${Math.max(8, (visitor.visits_count / maxVisits) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {visitor.visits_count}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Card>
            ))
          )}
        </div>

        <Card className="group relative border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: "200ms", animationDuration: "600ms", animationFillMode: "both" }}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-2 rounded-xl bg-primary/10 transition-all duration-300 group-hover:scale-110">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <span className="group-hover:text-primary transition-colors duration-300">Global distribution</span>
            </CardTitle>
            <CardDescription>
              Unique users per country. Countries in the top-5 list are outlined.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border/40">
              <VisitorChoroplethMap
                countryFrequencies={countryFrequencies}
                topVisitors={topVisitors}
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <span className="text-xs text-muted-foreground">Low</span>
              <div className="flex h-3 w-48 overflow-hidden rounded-full border border-border/60 sm:w-64">
                {legendStops.map((color, i) => (
                  <div key={i} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">High</span>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Hover countries for unique user counts
            </p>
          </CardContent>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Card>
      </div>
    </div>
  )
}
