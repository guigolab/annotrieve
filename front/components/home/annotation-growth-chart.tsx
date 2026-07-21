"use client"

import { useEffect, useMemo, useState } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { LineChart } from "@mui/x-charts/LineChart"
import { Button } from "@/components/ui/button"
import { useUIStore } from "@/lib/stores/ui"
import {
  DATABASE_COLORS,
  DATABASE_NAMES,
  type DatabaseName,
} from "@/lib/constants/annotation-sources"

type CountsByDatabase = Record<DatabaseName, number>

interface ReleaseDateData extends CountsByDatabase {
  date: Date
  year: string
}

function emptyCounts(): CountsByDatabase {
  return Object.fromEntries(DATABASE_NAMES.map((name) => [name, 0])) as CountsByDatabase
}

const THEME_TEXT_COLORS = {
  light: "#0f172a",
  dark: "#e2e8f0",
} as const

const DESKTOP_QUERY = "(min-width: 768px)"

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
})

function formatToYear(dateString: string): string {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return dateString.substring(0, 4)
    }
    return date.toISOString().substring(0, 4)
  } catch {
    return dateString.substring(0, 4)
  }
}

function getMaxValue(data: ReleaseDateData[]): number {
  return data.reduce(
    (max, d) => Math.max(max, ...DATABASE_NAMES.map((name) => d[name])),
    0
  )
}

function getYearsArray(data: ReleaseDateData[]): Date[] {
  if (data.length === 0) return []

  const years = new Set<number>()
  data.forEach((d) => {
    years.add(d.date.getFullYear())
  })

  return Array.from(years)
    .sort((a, b) => a - b)
    .map((year) => new Date(year, 0, 1))
}

function useChartHeight() {
  const [height, setHeight] = useState(400)

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const update = () => setHeight(mq.matches ? 400 : 280)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  return height
}

export function AnnotationGrowthChart() {
  const [data, setData] = useState<ReleaseDateData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const theme = useUIStore((s) => s.theme)
  const textColor = THEME_TEXT_COLORS[theme]
  const chartHeight = useChartHeight()

  const margins = useMemo(
    () =>
      chartHeight <= 280
        ? { top: 16, right: 16, left: 48, bottom: 32 }
        : { top: 20, right: 24, left: 56, bottom: 36 },
    [chartHeight]
  )

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const promises = DATABASE_NAMES.map((dbSource) =>
          getAnnotationsFrequencies("release_date", { db_sources: dbSource })
        )

        const results = await Promise.all(promises)

        const yearMap = new Map<string, CountsByDatabase>()

        results.forEach((frequencies, index) => {
          const dbSource = DATABASE_NAMES[index]
          Object.entries(frequencies).forEach(([date, count]) => {
            const year = formatToYear(date)
            if (!yearMap.has(year)) {
              yearMap.set(year, emptyCounts())
            }
            const yearData = yearMap.get(year)!
            yearData[dbSource] = (yearData[dbSource] || 0) + count
          })
        })

        const sortedData: ReleaseDateData[] = Array.from(yearMap.entries())
          .map(([year, values]) => {
            const yearNum = Number(year)
            const date = new Date(yearNum, 0, 1)
            return {
              date,
              year,
              ...values,
            }
          })
          .sort((a, b) => a.date.getTime() - b.date.getTime())

        const cumulativeData: ReleaseDateData[] = []
        const cumulative = emptyCounts()

        sortedData.forEach((d) => {
          for (const name of DATABASE_NAMES) {
            cumulative[name] += d[name]
          }
          cumulativeData.push({
            date: d.date,
            year: d.year,
            ...cumulative,
          })
        })

        setData(cumulativeData)
      } catch (err) {
        setError("Failed to load release date frequencies")
        console.error("Error fetching release date frequencies:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-muted-foreground">Loading release timeline…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No release date data available</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden px-2 sm:px-4 pt-4 pb-2">
        <LineChart
          height={chartHeight}
          series={DATABASE_NAMES.map((dbSource: DatabaseName) => ({
            id: dbSource,
            label: dbSource,
            data: data.map((d) => d[dbSource]),
            color: DATABASE_COLORS[dbSource],
            curve: "monotoneX",
            showMark: true,
            area: true,
          }))}
          xAxis={[
            {
              id: "years",
              data: data.map((d) => d.date),
              scaleType: "time",
              valueFormatter: (value: Date) => value.getFullYear().toString(),
              position: "bottom",
              tickInterval: getYearsArray(data),
              tickLabelStyle: {
                fill: textColor,
                fontSize: 12,
              },
            },
          ]}
          yAxis={[
            {
              position: "left",
              min: 0,
              max: getMaxValue(data) * 1.05,
              valueFormatter: (value: number | null) =>
                value == null ? "" : compactNumber.format(value),
              tickLabelStyle: {
                fill: textColor,
                fontSize: 12,
              },
            },
          ]}
          grid={{ horizontal: true }}
          axisHighlight={{ x: "line" }}
          slotProps={{
            tooltip: { trigger: "axis" },
          }}
          hideLegend
          margin={margins}
          sx={{
            "& .MuiChartsAxis-root .MuiChartsAxis-tickLabel": {
              fill: textColor,
              fontSize: "12px",
            },
            "& .MuiChartsAxis-root .MuiChartsAxis-label": {
              fill: textColor,
            },
            "& .MuiChartsAxis-root[data-axis-id=\"bottom\"] .MuiChartsAxis-tickLabel": {
              fill: textColor,
              opacity: 1,
            },
            "& .MuiAreaElement-root": {
              opacity: 0.12,
            },
            "& .MuiChartsGrid-line": {
              stroke: textColor,
              strokeOpacity: 0.12,
            },
          }}
        />
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Colors match the database cards below
      </p>
    </div>
  )
}
