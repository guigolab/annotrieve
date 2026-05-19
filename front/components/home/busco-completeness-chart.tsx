"use client"

import { useEffect, useState, useMemo } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { SectionHeader } from "@/components/ui/section-header"
import { Button } from "@/components/ui/button"
import { BarChart3 } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface BuscoCompletenessChartProps {
  title?: string
  description?: ReactNode
}

const NO_VALUE_KEY = "no_value"
const TICK_POSITIONS = [0, 25, 50, 75, 100]

/** Area chart: number of annotations per BUSCO completeness % (0–100). */
function BuscoAreaChart({ data, className }: { data: Record<string, number>; className?: string }) {
  const values = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i <= 100; i++) out.push(data[String(i)] ?? 0)
    return out
  }, [data])

  const maxCount = useMemo(() => Math.max(1, ...values), [values])

  const { areaPath, linePath } = useMemo(() => {
    const W = 100
    const H = 72
    const points = values.map((v, i) => [(i / 100) * W, H - (v / maxCount) * H] as [number, number])
    const lineSegments = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ")
    return {
      areaPath: `${lineSegments} L 100 ${H} L 0 ${H} Z`,
      linePath: lineSegments,
    }
  }, [values, maxCount])

  return (
    <svg
      className={cn("block w-full h-full", className)}
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="busco-area-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="75%" stopColor="var(--primary)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        {/* Highlight band 90–100 */}
        <linearGradient id="busco-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.08" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* High-completeness band (90–100%) */}
      <rect x="90" y="0" width="10" height="72" fill="url(#busco-highlight)" />

      {/* Vertical grid lines at 25, 50, 75 */}
      {[25, 50, 75].map((x) => (
        <line
          key={x}
          x1={x} y1="0" x2={x} y2="72"
          stroke="var(--border)"
          strokeWidth="0.3"
          strokeDasharray="1 1"
          strokeOpacity="0.5"
        />
      ))}

      {/* Baseline */}
      <line x1="0" y1="72" x2="100" y2="72" stroke="var(--border)" strokeWidth="0.4" strokeOpacity="0.7" />

      {/* Area fill */}
      <path d={areaPath} fill="url(#busco-area-gradient)" />

      {/* Stroke line — use theme color directly (oklch); non-scaling stroke stays visible when SVG is stretched */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="nonScalingStroke"
      />
    </svg>
  )
}

export function BuscoCompletenessChart({ title, description }: BuscoCompletenessChartProps) {
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
    return () => { cancelled = true }
  }, [])

  const chartData = useMemo(
    () => Object.fromEntries([...Array(101)].map((_, i) => [String(i), data[String(i)] ?? 0])),
    [data]
  )

  const stats = useMemo(() => {
    const counts = [...Array(101)].map((_, i) => data[String(i)] ?? 0)
    const total = counts.reduce((s, c) => s + c, 0)
    if (total === 0) return null

    let cumulative = 0
    let median = 0
    for (let i = 0; i <= 100; i++) {
      cumulative += counts[i]
      if (cumulative >= total / 2) { median = i; break }
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "BUSCO completeness distribution"}
          description={description}
          icon={BarChart3}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="text-muted-foreground">Loading BUSCO distribution…</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "BUSCO completeness distribution"}
          description={description}
          icon={BarChart3}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
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
        title={title ?? "BUSCO completeness"}
        description={description}
        icon={BarChart3}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />

      <div className="max-w-6xl mx-auto">
        <div className="group relative rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-lg hover:border-primary/40 transition-all duration-300 overflow-hidden animate-in fade-in slide-in-from-bottom-4" style={{ animationDuration: "600ms", animationFillMode: "both" }}>

          {/* Summary stats row */}
          {stats && (
            <div className="flex flex-wrap items-center gap-px border-b border-border/50 divide-x divide-border/50">
              <StatPill label="With BUSCO" value={stats.total.toLocaleString()} />
              <StatPill label="Median completeness" value={`${stats.median}%`} highlight />
              <StatPill label="≥ 90% complete" value={`${stats.pct90}%`} highlight />
              {stats.noValue > 0 && (
                <StatPill label="No BUSCO data" value={stats.noValue.toLocaleString()} />
              )}
            </div>
          )}

          {/* Chart */}
          <div className="px-6 pt-5 pb-2">
            <div className="h-52 w-full">
              <BuscoAreaChart data={chartData} />
            </div>
          </div>

          {/* X-axis labels */}
          <div className="relative px-6 pb-5">
            <div className="flex justify-between">
              {TICK_POSITIONS.map((tick) => (
                <span key={tick} className="text-xs text-muted-foreground tabular-nums">
                  {tick}%
                </span>
              ))}
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground/70">BUSCO completeness</p>
          </div>

          {/* Hover bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>
      </div>
    </div>
  )
}

function StatPill({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className={cn("flex flex-col items-center px-5 py-3 flex-1 min-w-0", highlight && "")}>
      <span className={cn("text-base font-semibold tabular-nums", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground mt-0.5 truncate">{label}</span>
    </div>
  )
}
