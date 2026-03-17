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

/** Area chart: number of annotations per BUSCO completeness % (0–100). Excludes no_value. */
function BuscoAreaChart({ data, className }: { data: Record<string, number>; className?: string }) {
  const values = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i <= 100; i++) out.push(data[String(i)] ?? 0)
    return out
  }, [data])
  const maxCount = useMemo(() => Math.max(1, ...values), [values])
  const pathD = useMemo(() => {
    const w = 100
    const h = 80
    const points = values.map((v, i) => [(i / 100) * w, h - (v / maxCount) * h] as [number, number])
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ")
    return `${line} L 100 ${h} L 0 ${h} Z`
  }, [values, maxCount])
  return (
    <svg
      className={cn("block w-full h-full overflow-hidden", className)}
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={pathD} fill="currentColor" className="text-primary/30" />
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
  const totalWithBusco = useMemo(
    () => [...Array(101)].reduce((sum, _, i) => sum + (data[String(i)] ?? 0), 0),
    [data]
  )
  const noValueCount = data[NO_VALUE_KEY] ?? 0

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "BUSCO completeness distribution"}
          description={description}
          icon={BarChart3}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
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
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
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
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-500/10"
        align="center"
      />
      <div className="max-w-6xl mx-auto">
        <div className="rounded-lg border border-border/70 bg-card/80 p-6 shadow-sm overflow-hidden">
          <div className="h-60 w-full min-h-0">
            <BuscoAreaChart data={chartData} />
          </div>
          <div className="mt-4 flex justify-between text-sm text-muted-foreground">
            <span>0%</span>
            <span>BUSCO completeness</span>
            <span>100%</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>{totalWithBusco.toLocaleString()} with BUSCO score</span>
            {noValueCount > 0 && (
              <span>{noValueCount.toLocaleString()} without BUSCO score</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
