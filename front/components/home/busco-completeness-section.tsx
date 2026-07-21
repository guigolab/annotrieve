"use client"

import { useEffect, useState, useMemo, type ReactNode } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { SectionHeader } from "@/components/ui/section-header"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Award,
  BarChart3,
  CheckCircle2,
  CircleOff,
  Gauge,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface BuscoCompletenessSectionProps {
  title?: string
  description?: ReactNode
}

const NO_VALUE_KEY = "no_value"

interface KpiCardProps {
  label: string
  value: string
  description: string
  icon: LucideIcon
  highlight?: boolean
  index: number
}

function KpiCard({ label, value, description, icon: Icon, highlight = false, index }: KpiCardProps) {
  const delay = `${index * 100}ms`

  return (
    <Card
      className="group relative flex h-full flex-col border-foreground/20 bg-card shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        animationDelay: delay,
        animationDuration: "600ms",
        animationFillMode: "both",
      }}
    >
      <CardHeader className="space-y-4">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "p-3 rounded-lg transition-all duration-300 group-hover:scale-110 flex-shrink-0",
              highlight ? "bg-primary/10" : "bg-muted"
            )}
          >
            <Icon className={cn("h-6 w-6", highlight ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="min-w-0 space-y-1 flex-1">
            <CardTitle className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
              {label}
            </CardTitle>
            <p
              className={cn(
                "text-3xl font-semibold tabular-nums tracking-tight",
                highlight ? "text-primary" : "text-foreground"
              )}
            >
              {value}
            </p>
            <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </Card>
  )
}

export function BuscoCompletenessSection({ title, description }: BuscoCompletenessSectionProps) {
  const [data, setData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        const frequencies = await getAnnotationsFrequencies("busco_complete", {})
        if (!cancelled) setData(frequencies || {})
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load BUSCO completeness distribution")
          console.error("Error fetching BUSCO frequencies:", err)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const counts = [...Array(101)].map((_, i) => data[String(i)] ?? 0)
    const total = counts.reduce((s, c) => s + c, 0)
    if (total === 0) return null

    let cumulative = 0
    let median = 0
    for (let i = 0; i <= 100; i++) {
      cumulative += counts[i]
      if (cumulative >= total / 2) {
        median = i
        break
      }
    }

    const above90 = counts.slice(90).reduce((s, c) => s + c, 0)

    return {
      total,
      median,
      above90,
      pct90: Math.round((above90 / total) * 100),
      noValue: data[NO_VALUE_KEY] ?? 0,
    }
  }, [data])

  const showNoValue = (stats?.noValue ?? 0) > 0

  return (
    <div className="container mx-auto px-4 py-20 sm:py-24">
      <div className="mb-8">
        <SectionHeader
          title={title ?? "BUSCO completeness"}
          description={description}
          icon={BarChart3}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          align="center"
        />
      </div>

      <div className="min-h-[280px]">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-muted-foreground">Loading BUSCO distribution…</p>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()} variant="outline">
                Try again
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && !stats && (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">No BUSCO completeness data available</p>
          </div>
        )}

        {!loading && !error && stats && (
          <div
            className={cn(
              "grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-6xl mx-auto pt-4",
              showNoValue ? "lg:grid-cols-4" : "lg:grid-cols-3"
            )}
          >
            <KpiCard
              index={0}
              icon={CheckCircle2}
              label="With BUSCO"
              value={stats.total.toLocaleString()}
              description="Annotations with a BUSCO score"
            />
            <KpiCard
              index={1}
              icon={Gauge}
              label="Median completeness"
              value={`${stats.median}%`}
              description="Median BUSCO complete score"
              highlight
            />
            <KpiCard
              index={2}
              icon={Award}
              label="≥ 90% complete"
              value={`${stats.pct90}%`}
              description="Of annotations with BUSCO data"
              highlight
            />
            {showNoValue && (
              <KpiCard
                index={3}
                icon={CircleOff}
                label="No BUSCO data"
                value={stats.noValue.toLocaleString()}
                description="Annotations without a BUSCO score"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
