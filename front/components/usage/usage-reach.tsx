"use client"

import { MapPin } from "lucide-react"
import VisitorChoroplethMap from "@/components/home/visitor-choropleth-map"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { CountryFrequencies } from "@/lib/api/analytics"
import { getVisitorMapLegendStops } from "@/lib/visitor-map-theme"
import { useUIStore } from "@/lib/stores/ui"
import { useMemo } from "react"

interface UsageReachProps {
  countryFrequencies: CountryFrequencies
  loading?: boolean
  className?: string
}

export function UsageReach({
  countryFrequencies,
  loading,
  className,
}: UsageReachProps) {
  const theme = useUIStore((s) => s.theme)
  const legendStops = getVisitorMapLegendStops(theme)

  const highlightCountries = useMemo(() => {
    return Object.entries(countryFrequencies)
      .filter(([name, count]) => name !== "Unknown" && count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name)
  }, [countryFrequencies])

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Where users are</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Unique users per country from API activity.
        </p>
      </div>

      <Card className="border-border/60 bg-card/80 shadow-sm overflow-hidden">
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-24 text-center">Loading map…</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-border/40">
                <VisitorChoroplethMap
                  countryFrequencies={countryFrequencies}
                  highlightCountries={highlightCountries}
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
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
