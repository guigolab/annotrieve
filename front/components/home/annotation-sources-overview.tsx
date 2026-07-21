"use client"

import { useEffect, useState, type ReactNode } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Server } from "lucide-react"
import { SectionHeader } from "@/components/ui/section-header"
import { AnnotationGrowthChart } from "@/components/home/annotation-growth-chart"
import {
  DATABASE_INFO,
  type DatabaseName,
} from "@/lib/constants/annotation-sources"

interface DatabaseFrequency {
  name: string
  value: number
  percentage: string
  description: string
  color: string
}

function useAnimatedCounter(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (end === 0) return

    let startTime: number | null = null
    const startValue = 0

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)

      const easeOutQuad = (t: number) => t * (2 - t)
      const currentCount = Math.floor(startValue + (end - startValue) * easeOutQuad(progress))

      setCount(currentCount)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(animate)
  }, [end, duration])

  return count
}

function DatabaseItem({ database, index }: { database: DatabaseFrequency; index: number }) {
  const animatedValue = useAnimatedCounter(database.value)
  const delay = `${index * 150}ms`
  const percentageNumber = Number(database.percentage)
  const barWidth = Math.max(0, Math.min(100, isNaN(percentageNumber) ? 0 : percentageNumber))

  return (
    <Card
      className="group relative flex h-full flex-col border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        animationDelay: delay,
        animationDuration: "600ms",
        animationFillMode: "both",
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="p-2.5 rounded-lg transition-all duration-300 group-hover:scale-110 shrink-0"
              style={{ backgroundColor: `${database.color}20` }}
            >
              <Server className="h-5 w-5" style={{ color: database.color }} />
            </div>
            <CardTitle className="text-base font-semibold truncate">{database.name}</CardTitle>
          </div>
          <span
            className="text-lg font-bold tabular-nums shrink-0"
            style={{ color: database.color }}
          >
            {database.percentage}%
          </span>
        </div>
        <CardDescription
          className="text-sm leading-relaxed line-clamp-2 min-h-[2.5rem] mt-2"
          title={database.description}
        >
          {database.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {animatedValue.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            annotations
          </span>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Share of annotations</span>
            <span>{database.percentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${barWidth}%`,
                backgroundColor: database.color,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DatabaseCards() {
  const [data, setData] = useState<DatabaseFrequency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const frequencies = await getAnnotationsFrequencies("database")

        const total = Object.values(frequencies).reduce((sum, count) => sum + count, 0)
        const transformedData = Object.entries(frequencies)
          .map(([name, value]) => {
            const info = DATABASE_INFO[name as DatabaseName]
            return {
              name,
              value,
              percentage: ((value / total) * 100).toFixed(1),
              description: info?.description || "Database annotations",
              color: info?.color || "#6b7280",
            }
          })
          .sort((a, b) => b.value - a.value)

        setData(transformedData)
      } catch (err) {
        setError("Failed to load database frequencies")
        console.error("Error fetching database frequencies:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading database sources…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {data.map((database, index) => (
        <DatabaseItem key={database.name} database={database} index={index} />
      ))}
    </div>
  )
}

interface AnnotationSourcesOverviewProps {
  title?: string
  description?: ReactNode
}

export function AnnotationSourcesOverview({
  title,
  description,
}: AnnotationSourcesOverviewProps) {
  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? ""}
        description={description}
        icon={Server}
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-500/10"
        align="center"
      />

      <div className="space-y-10">
        <AnnotationGrowthChart />
        <DatabaseCards />
      </div>
    </div>
  )
}
