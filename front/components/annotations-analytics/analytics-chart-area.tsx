"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { BarChart2, BarChart3, Activity, SlidersHorizontal, Star, Database, Dna, X, Beaker } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  getGeneStats,
  getGeneCategoryMetricValues,
  getTranscriptStats,
  getTranscriptTypeDetails,
  getTranscriptTypeMetricValues,
  getBuscoStats,
  getBuscoMetricValues,
  type GeneCategoryMetricValues,
  type GeneStatsSummary,
  type TranscriptStatsSummary,
  type TranscriptTypeDetails,
  type TranscriptTypeMetricValues,
  type BuscoStatsSummary,
  type BuscoMetricValues,
} from "@/lib/api/annotations"
import { useStatsCacheStore } from "@/lib/stores/stats-cache"
import { BoxplotChart } from "@/components/annotations-stats/boxplot-chart"
import { HistogramChart, type HistogramSeries } from "@/components/annotations-stats/histogram-chart"
import type { AnalyticsEntry, EntityType } from "./analytics-sidebar"
import { CURRENT_ENTRY_ID } from "./analytics-sidebar"
import { formatLabel } from "@/lib/annotations-formatting"
import type { Annotation } from "@/lib/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartType = "boxplot" | "histogram"

export interface RefLineData {
  id: string
  label: string
  color: string
  value: number // median for boxplot
  values: number[] // for histogram ref lines
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REF_PALETTE = [
  "#e11d48", "#ea580c", "#ca8a04", "#65a30d", "#0891b2",
  "#7c3aed", "#be185d", "#0d9488", "#dc2626", "#4f46e5",
]
const MAX_REF_SELECTION = 10

// ─── Props ────────────────────────────────────────────────────────────────────

interface AnalyticsChartAreaProps {
  selectedEntries: AnalyticsEntry[]
  entityType: EntityType
  onEntityTypeChange: (type: EntityType) => void
  favoriteAnnotationIds: string[]
  favoriteAnnotations: Annotation[]
  buildCurrentParams: () => Record<string, any>
  buildFavoritesParams: (ids: string[]) => Record<string, any>
  subsetParams: Record<string, Record<string, any>>
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AnalyticsChartArea({
  selectedEntries,
  entityType,
  onEntityTypeChange,
  favoriteAnnotationIds,
  favoriteAnnotations,
  buildCurrentParams,
  buildFavoritesParams,
  subsetParams,
}: AnalyticsChartAreaProps) {
  const [chartType, setChartType] = useState<ChartType>("boxplot")
  const [useLogScale, setUseLogScale] = useState(false)
  const [refsPanelOpen, setRefsPanelOpen] = useState(false)
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([])

  const [selectedCatOrType, setSelectedCatOrType] = useState("")
  const [selectedMetric, setSelectedMetric] = useState("")

  // ── Stats (for categories/types list) ───────────────────────────────────
  const [geneStats, setGeneStats] = useState<GeneStatsSummary | null>(null)
  const [transcriptStats, setTranscriptStats] = useState<TranscriptStatsSummary | null>(null)
  const [buscoStats, setBuscoStats] = useState<BuscoStatsSummary | null>(null)
  const [typeDetails, setTypeDetails] = useState<TranscriptTypeDetails | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  // ── Metric values per entry ──────────────────────────────────────────────
  const [metricValues, setMetricValues] = useState<Record<string, number[]>>({})
  const [metricLoading, setMetricLoading] = useState(false)
  const [failedEntries, setFailedEntries] = useState<Set<string>>(() => new Set())

  // ── Multi-ref data (one line per selected favorite, each with its own color) ─
  const [refLinesData, setRefLinesData] = useState<RefLineData[]>([])
  const [refsLoading, setRefsLoading] = useState(false)

  // ── Cache store ──────────────────────────────────────────────────────────
  const getCachedGeneStats = useStatsCacheStore(s => s.getGeneStats)
  const setCachedGeneStats = useStatsCacheStore(s => s.setGeneStats)
  const getCachedTranscriptStats = useStatsCacheStore(s => s.getTranscriptStats)
  const setCachedTranscriptStats = useStatsCacheStore(s => s.setTranscriptStats)
  const getCachedTypeDetails = useStatsCacheStore(s => s.getTranscriptTypeDetails)
  const setCachedTypeDetails = useStatsCacheStore(s => s.setTranscriptTypeDetails)
  const getCachedGeneMetric = useStatsCacheStore(s => s.getGeneMetric)
  const setCachedGeneMetric = useStatsCacheStore(s => s.setGeneMetric)
  const getCachedTranscriptMetric = useStatsCacheStore(s => s.getTranscriptMetric)
  const setCachedTranscriptMetric = useStatsCacheStore(s => s.setTranscriptMetric)
  const getCachedBuscoStats = useStatsCacheStore(s => s.getBuscoStats)
  const setCachedBuscoStats = useStatsCacheStore(s => s.setBuscoStats)
  const getCachedBuscoMetric = useStatsCacheStore(s => s.getBuscoMetric)
  const setCachedBuscoMetric = useStatsCacheStore(s => s.setBuscoMetric)

  // ── Derive a stable params getter per entry ──────────────────────────────
  const getParams = useCallback(
    (entryId: string): Record<string, any> => {
      if (entryId === CURRENT_ENTRY_ID) return buildCurrentParams()
      return subsetParams[entryId] || {}
    },
    [buildCurrentParams, subsetParams]
  )

  // ── Stable string key for selected entries ───────────────────────────────
  const selectedEntriesKey = selectedEntries.map(e => e.id).join(",")
  const firstEntry = selectedEntries[0]

  // ── Fetch stats (categories/types or busco metrics) when entity or first entry changes ────
  useEffect(() => {
    if (!firstEntry) {
      setGeneStats(null)
      setTranscriptStats(null)
      setBuscoStats(null)
      setTypeDetails(null)
      setSelectedCatOrType("")
      setSelectedMetric("")
      return
    }

    // Clear metric/category immediately so dependent effects don't request with stale values (e.g. mean_length for busco)
    setSelectedMetric("")
    if (entityType === "busco") setSelectedCatOrType("")

    let cancelled = false
    setStatsLoading(true)
    setStatsError(null)

    async function fetchStats() {
      const params = getParams(firstEntry.id)

      try {
        if (entityType === "genes") {
          let result = getCachedGeneStats(firstEntry.id)
          if (!result) {
            result = await getGeneStats(params)
            setCachedGeneStats(firstEntry.id, result)
          }
          if (!cancelled) {
            setGeneStats(result)
            setTranscriptStats(null)
            setBuscoStats(null)
            setTypeDetails(null)
            setStatsLoading(false)
            setSelectedMetric("")
            if (result.categories?.length) {
              const preferred = result.categories.find((c: string) => c.toLowerCase() === "coding")
              setSelectedCatOrType(preferred || result.categories[0])
            }
            if (result.metrics?.length) {
              const preferred = result.metrics.find((m: string) => m.toLowerCase().includes("mean_length"))
              setSelectedMetric(preferred || result.metrics[0])
            }
          }
        } else if (entityType === "transcripts") {
          let result = getCachedTranscriptStats(firstEntry.id)
          if (!result) {
            result = await getTranscriptStats(params)
            setCachedTranscriptStats(firstEntry.id, result)
          }
          if (!cancelled) {
            setTranscriptStats(result)
            setGeneStats(null)
            setBuscoStats(null)
            setTypeDetails(null)
            setStatsLoading(false)
            setSelectedMetric("")
            if (result.types?.length) {
              const preferred = result.types.find((t: string) => t.toLowerCase() === "mrna")
              const summary = result.summary?.types || {}
              const sorted = [...result.types].sort(
                (a, b) => (summary[b]?.annotations_count || 0) - (summary[a]?.annotations_count || 0)
              )
              setSelectedCatOrType(preferred || sorted[0])
            }
          }
        } else {
          // busco: metrics only
          let result = getCachedBuscoStats(firstEntry.id)
          if (!result) {
            result = await getBuscoStats(params)
            setCachedBuscoStats(firstEntry.id, result)
          }
          if (!cancelled) {
            setBuscoStats(result)
            setGeneStats(null)
            setTranscriptStats(null)
            setTypeDetails(null)
            setStatsLoading(false)
            setSelectedCatOrType("")
            setSelectedMetric("")
            if (result.metrics?.length) {
              const preferred = result.metrics.find((m: string) => m === "complete")
              setSelectedMetric(preferred || result.metrics[0])
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatsError(err instanceof Error ? err.message : "Failed to load statistics")
          setStatsLoading(false)
        }
      }
    }

    fetchStats()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEntry?.id, entityType])

  // ── Fetch transcript type details (to get metrics list) ──────────────────
  useEffect(() => {
    if (entityType !== "transcripts" || !firstEntry || !selectedCatOrType) {
      setTypeDetails(null)
      return
    }
    let cancelled = false

    async function fetchDetails() {
      const params = getParams(firstEntry.id)
      try {
        let result = getCachedTypeDetails(firstEntry.id, selectedCatOrType)
        if (!result) {
          result = await getTranscriptTypeDetails(selectedCatOrType, params)
          setCachedTypeDetails(firstEntry.id, selectedCatOrType, result)
        }
        if (!cancelled) {
          setTypeDetails(result)
          if (result.metrics?.length) {
            const preferred = result.metrics.find((m: string) => m.toLowerCase().includes("mean_length"))
            setSelectedMetric(preferred || result.metrics[0])
          }
        }
      } catch {
        // Silently ignore — likely a 404 for this type
      }
    }

    fetchDetails()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEntry?.id, entityType, selectedCatOrType])

  // ── Available categories / types & metrics ───────────────────────────────
  const categories = useMemo(
    () =>
      entityType === "genes"
        ? geneStats?.categories || []
        : entityType === "transcripts"
          ? transcriptStats?.types || []
          : [],
    [entityType, geneStats, transcriptStats]
  )
  const metrics = useMemo(() => {
    if (entityType === "genes") return geneStats?.metrics || []
    if (entityType === "busco") return buscoStats?.metrics || []
    return typeDetails?.metrics || []
  }, [entityType, geneStats, typeDetails, buscoStats])

  // Reset metric if it's no longer in the list
  useEffect(() => {
    if (metrics.length && selectedMetric && !metrics.includes(selectedMetric)) {
      setSelectedMetric(metrics[0])
    }
  }, [metrics, selectedMetric])

  // ── Fetch metric values for all selected entries ─────────────────────────
  const needCatOrType = entityType !== "busco"
  useEffect(() => {
    if ((needCatOrType && !selectedCatOrType) || !selectedMetric || selectedEntries.length === 0) {
      setMetricValues({})
      setMetricLoading(false)
      setFailedEntries(new Set())
      return
    }
    // Only fetch when current entity's stats are loaded and metric is valid (avoids e.g. requesting mean_length for busco)
    if (metrics.length === 0 || !metrics.includes(selectedMetric)) {
      setMetricValues({})
      setMetricLoading(false)
      setFailedEntries(new Set())
      return
    }

    let cancelled = false
    setFailedEntries(new Set())

    async function fetchAllMetrics() {
      setMetricLoading(true)

      const cached: Record<string, number[]> = {}
      const toFetch: AnalyticsEntry[] = []

      for (const entry of selectedEntries) {
        const hit =
          entityType === "genes"
            ? getCachedGeneMetric(entry.id, selectedCatOrType, selectedMetric)
            : entityType === "transcripts"
              ? getCachedTranscriptMetric(entry.id, selectedCatOrType, selectedMetric)
              : getCachedBuscoMetric(entry.id, selectedMetric)
        if (hit) {
          cached[entry.id] = hit.values || []
        } else {
          toFetch.push(entry)
        }
      }

      if (Object.keys(cached).length > 0) setMetricValues(prev => ({ ...prev, ...cached }))
      if (toFetch.length === 0) {
        setMetricLoading(false)
        return
      }

      const fetchOne = async (entry: AnalyticsEntry) => {
        const params = getParams(entry.id)
        try {
          if (entityType === "genes") {
            const result = await getGeneCategoryMetricValues(selectedCatOrType, selectedMetric, params)
            return { entryId: entry.id, values: result.values || [], result, err: null as Error | null }
          }
          if (entityType === "transcripts") {
            const result = await getTranscriptTypeMetricValues(selectedCatOrType, selectedMetric, params)
            return { entryId: entry.id, values: result.values || [], result, err: null as Error | null }
          }
          const result = await getBuscoMetricValues(selectedMetric, params)
          return { entryId: entry.id, values: result.values || [], result, err: null as Error | null }
        } catch (err) {
          return { entryId: entry.id, values: [], result: null, err: err as Error }
        }
      }

      const results = await Promise.all(toFetch.map(fetchOne))

      if (cancelled) return
      const nextValues = { ...cached }
      const nextFailed = new Set<string>()
      for (const r of results) {
        if (r.err) nextFailed.add(r.entryId)
        else {
          nextValues[r.entryId] = r.values
          if (r.result) {
            if (entityType === "genes") {
              setCachedGeneMetric(r.entryId, selectedCatOrType, selectedMetric, r.result as GeneCategoryMetricValues)
            } else if (entityType === "transcripts") {
              setCachedTranscriptMetric(r.entryId, selectedCatOrType, selectedMetric, r.result as TranscriptTypeMetricValues)
            } else {
              setCachedBuscoMetric(r.entryId, selectedMetric, r.result as BuscoMetricValues)
            }
          }
        }
      }
      setMetricValues(prev => ({ ...prev, ...nextValues }))
      setFailedEntries(prev => (nextFailed.size > 0 ? new Set([...prev, ...nextFailed]) : prev))
      setMetricLoading(false)
    }

    fetchAllMetrics()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntriesKey, entityType, selectedCatOrType, selectedMetric, metrics])

  // ── Fetch reference line data for each selected ref (up to 10) ─────────────
  useEffect(() => {
    if (selectedRefIds.length === 0 || !selectedMetric || (needCatOrType && !selectedCatOrType)) {
      setRefLinesData([])
      return
    }
    if (metrics.length === 0 || !metrics.includes(selectedMetric)) {
      setRefLinesData([])
      return
    }
    let cancelled = false
    setRefsLoading(true)

    const fetchAll = async () => {
      const fetchOne = async (id: string, i: number): Promise<RefLineData> => {
        const ann = favoriteAnnotations.find(a => a.annotation_id === id)
        const label = ann ? `${ann.organism_name} (${ann.assembly_name || ann.assembly_accession})` : id
        const color = REF_PALETTE[i % REF_PALETTE.length]
        try {
          const params = buildFavoritesParams([id])
          const result =
            entityType === "genes"
              ? await getGeneCategoryMetricValues(selectedCatOrType, selectedMetric, params)
              : entityType === "transcripts"
                ? await getTranscriptTypeMetricValues(selectedCatOrType, selectedMetric, params)
                : await getBuscoMetricValues(selectedMetric, params)
          const vals = (result.values || []).filter((v): v is number => typeof v === "number" && isFinite(v) && v > 0)
          const sorted = [...vals].sort((a, b) => a - b)
          const mid = Math.floor(sorted.length / 2)
          const median = sorted.length === 0 ? 0 : sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
          return { id, label, color, value: median, values: vals }
        } catch {
          return { id, label, color, value: 0, values: [] }
        }
      }

      const results = await Promise.all(selectedRefIds.map((id, i) => fetchOne(id, i)))
      if (!cancelled) {
        setRefLinesData(results)
        setRefsLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRefIds.join(","), entityType, selectedCatOrType, selectedMetric, metrics])

  // ── Build chart data series ──────────────────────────────────────────────
  const chartSeries: HistogramSeries[] = useMemo(() => {
    return selectedEntries
      .filter(e => !failedEntries.has(e.id))
      .map(e => ({
        id: e.id,
        label: e.name,
        values: metricValues[e.id] || [],
        color: e.color,
      }))
      .filter(s => s.values.length > 0)
  }, [selectedEntries, metricValues, failedEntries])

  const boxplotData = useMemo(
    () => chartSeries.map(s => ({ label: s.label, values: s.values, color: s.color })),
    [chartSeries]
  )

  // Memoize ref line props to avoid new array references every render (re-render optimization)
  const boxplotRefLines = useMemo(
    () =>
      refLinesData.length > 0
        ? refLinesData.map(r => ({ value: r.value, color: r.color, label: r.label }))
        : undefined,
    [refLinesData]
  )
  const histogramRefLines = useMemo(
    () =>
      refLinesData.length > 0
        ? refLinesData.map(r => ({ values: r.values, color: r.color, label: r.label }))
        : undefined,
    [refLinesData]
  )

  const favCount = favoriteAnnotationIds.length
  const hasFavorites = favCount > 0
  const isLoading = statsLoading || metricLoading

  const catLabel = entityType === "genes" ? "Category" : entityType === "transcripts" ? "Type" : ""
  const metricLabel = selectedMetric ? formatLabel(selectedMetric) : ""
  const catOrTypeLabel = selectedCatOrType ? formatLabel(selectedCatOrType) : ""
  const showCategorySelect = entityType !== "busco"

  // Chart container ref and height: must be declared before any conditional return (rules of hooks)
  const chartVisible = selectedEntries.length > 0 && !statsError
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartHeight, setChartHeight] = useState(400)
  useEffect(() => {
    if (!chartVisible) return
    const el = chartContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight
      if (h > 0) setChartHeight(h)
    })
    ro.observe(el)
    setChartHeight(el.clientHeight || 400)
    return () => ro.disconnect()
  }, [chartVisible])

  // ── Empty states ─────────────────────────────────────────────────────────
  if (selectedEntries.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <div className="text-center space-y-2">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Select filter sets from the sidebar to start comparing</p>
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm text-destructive">{statsError}</p>
        </div>
      </div>
    )
  }

  const hasRefsSelected = selectedRefIds.length > 0
  const refsButtonActive = refsPanelOpen || hasRefsSelected

  return (
    <div className="flex flex-col h-full relative">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-border bg-background/90 shrink-0 flex-wrap">

        {/* Left group: what to analyze */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Entity type toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs gap-1.5",
                entityType === "genes" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"
              )}
              onClick={() => onEntityTypeChange("genes")}
            >
              Genes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs gap-1.5 border-l border-border",
                entityType === "transcripts" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"
              )}
              onClick={() => onEntityTypeChange("transcripts")}
            >
              Transcripts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs gap-1.5 border-l border-border",
                entityType === "busco" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-muted"
              )}
              onClick={() => onEntityTypeChange("busco")}
            >
              Busco
            </Button>
          </div>

          {/* Separator */}
          <div className="h-5 w-px bg-border/70 shrink-0 hidden sm:block" />

          {/* Category / Type select (hidden for Busco) */}
          {showCategorySelect && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium shrink-0">{catLabel}</span>
              <Select
                value={selectedCatOrType}
                onValueChange={val => {
                  setSelectedCatOrType(val)
                  if (entityType === "transcripts") {
                    setSelectedMetric("") // type-details effect will set preferred metric when new type loads
                  } else if (metrics.length) {
                    const preferred = metrics.find((m: string) => m.toLowerCase().includes("mean_length"))
                    setSelectedMetric(preferred || metrics[0])
                  } else {
                    setSelectedMetric("")
                  }
                }}
                disabled={statsLoading || categories.length === 0}
              >
                <SelectTrigger className="h-8 text-xs w-[168px]">
                  <SelectValue placeholder={statsLoading ? "Loading…" : `Select ${catLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat} className="text-xs">
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Metric select */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-medium shrink-0">Metric</span>
            <Select
              value={selectedMetric}
              onValueChange={setSelectedMetric}
              disabled={metrics.length === 0 || (showCategorySelect && !selectedCatOrType)}
            >
              <SelectTrigger className="h-8 text-xs w-[196px]">
                <SelectValue
                  placeholder={
                    statsLoading
                      ? "Loading…"
                      : showCategorySelect && !selectedCatOrType
                        ? `Choose ${catLabel.toLowerCase()} first`
                        : "Select metric"
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {metrics.map(m => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {formatLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 min-w-2" />

        {/* Right group: display options */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Separator */}
          <div className="h-5 w-px bg-border/70 shrink-0 hidden sm:block mr-0.5" />

          {/* Chart type toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs gap-1.5 border-0",
                chartType === "boxplot" ? "bg-muted font-medium" : "hover:bg-muted/50"
              )}
              onClick={() => setChartType("boxplot")}
              title="Boxplot"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Boxplot</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs gap-1.5 border-0 border-l border-border",
                chartType === "histogram" ? "bg-muted font-medium" : "hover:bg-muted/50"
              )}
              onClick={() => setChartType("histogram")}
              title="Histogram"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Histogram</span>
            </Button>
          </div>

          {/* Scale toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs border-0",
                !useLogScale ? "bg-muted font-medium" : "hover:bg-muted/50"
              )}
              onClick={() => setUseLogScale(false)}
            >
              Linear
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 px-3 rounded-none text-xs border-0 border-l border-border",
                useLogScale ? "bg-muted font-medium" : "hover:bg-muted/50"
              )}
              onClick={() => setUseLogScale(true)}
            >
              log₁₀
            </Button>
          </div>

          {/* Refs button */}
          <div className="relative inline-block">
            <Button
              variant={refsButtonActive ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-8 px-3 text-xs gap-1.5",
                !hasFavorites && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => hasFavorites && setRefsPanelOpen(v => !v)}
              disabled={!hasFavorites}
              title={hasFavorites ? "Select favorites to show as reference lines on the chart" : "No saved annotations"}
            >
              <Star className={cn("h-3.5 w-3.5", (refsPanelOpen || hasRefsSelected) && "fill-current")} />
              {favCount > 0 && <span>{favCount}</span>}
              <span className="hidden sm:inline">Favs</span>
            </Button>
            {hasRefsSelected && (
              <span
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground shadow-sm"
                aria-label={`${selectedRefIds.length} reference lines active`}
              >
                {selectedRefIds.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Chart card ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden px-4 sm:px-5 pb-4 pt-3">
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-border bg-card/50 shadow-sm overflow-hidden">
          <div className="flex-1 min-h-0 p-5">
            <div ref={chartContainerRef} className="h-full w-full min-h-[280px]">
              {isLoading && chartSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center space-y-3">
                    <Activity className="h-8 w-8 mx-auto animate-spin text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">Loading data…</p>
                  </div>
                </div>
              ) : (showCategorySelect && !selectedCatOrType) || !selectedMetric ? (
                <div className="flex h-full items-center justify-center border border-dashed rounded-lg bg-muted/20">
                  <div className="text-center space-y-2">
                    <SlidersHorizontal className="h-8 w-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {entityType === "busco"
                        ? "Choose a metric above to see the chart"
                        : `Choose a ${catLabel.toLowerCase()} and metric above to see the chart`}
                    </p>
                  </div>
                </div>
              ) : chartSeries.length === 0 ? (
                <div className="flex h-full items-center justify-center border border-dashed rounded-lg bg-muted/20">
                  <p className="text-sm text-muted-foreground">No data available for the current selection</p>
                </div>
              ) : chartType === "boxplot" ? (
                <BoxplotChart
                  data={boxplotData}
                  title={entityType === "busco" ? metricLabel : `${catOrTypeLabel} — ${metricLabel}`}
                  yAxisLabel={metricLabel}
                  height={chartHeight}
                  useLogScale={useLogScale}
                  referenceLines={boxplotRefLines}
                />
              ) : (
                <HistogramChart
                  series={chartSeries}
                  title={metricLabel}
                  xAxisLabel={metricLabel}
                  yAxisLabel="Count"
                  height={chartHeight}
                  useLogScale={useLogScale}
                  referenceSeries={histogramRefLines}
                />
              )}
            </div>
          </div>
        </div>

        {/* Refs panel (right sidebar) */}
        {refsPanelOpen && (
          <RefsPanel
            favoriteAnnotations={favoriteAnnotations}
            selectedRefIds={selectedRefIds}
            onSelectionChange={setSelectedRefIds}
            onClose={() => setRefsPanelOpen(false)}
            refPalette={REF_PALETTE}
            maxSelection={MAX_REF_SELECTION}
          />
        )}
      </div>
    </div>
  )
}

// ─── Refs panel (favorites list, select up to 10 as reference lines) ─────────

function RefsPanel({
  favoriteAnnotations,
  selectedRefIds,
  onSelectionChange,
  onClose,
  refPalette,
  maxSelection,
}: {
  favoriteAnnotations: Annotation[]
  selectedRefIds: string[]
  onSelectionChange: (ids: string[]) => void
  onClose: () => void
  refPalette: string[]
  maxSelection: number
}) {
  const toggle = (id: string) => {
    if (selectedRefIds.includes(id)) {
      onSelectionChange(selectedRefIds.filter((x) => x !== id))
    } else if (selectedRefIds.length < maxSelection) {
      onSelectionChange([...selectedRefIds, id])
    }
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-background/95 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold">Favorites as refs</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground px-3 py-1.5">
        Select up to {maxSelection} to show as lines on the chart.
      </p>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {favoriteAnnotations.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">No favorites saved.</p>
        ) : (
          favoriteAnnotations.map((ann, idx) => {
            const id = ann.annotation_id
            const isSelected = selectedRefIds.includes(id)
            const refIndex = selectedRefIds.indexOf(id)
            const color = refIndex >= 0 ? refPalette[refIndex % refPalette.length] : undefined
            const disabled = !isSelected && selectedRefIds.length >= maxSelection
            return (
              <button
                key={id}
                type="button"
                onClick={() => !disabled && toggle(id)}
                disabled={disabled}
                className={cn(
                  "w-full text-left rounded-md border px-2.5 py-2 text-xs transition-colors",
                  isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50",
                  disabled && !isSelected && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded border shrink-0 flex items-center justify-center"
                    style={{ borderColor: color ?? "var(--border)", backgroundColor: color ? `${color}30` : "transparent" }}
                  >
                    {isSelected && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{ann.organism_name}</div>
                    <div className="text-muted-foreground truncate text-[10px]">
                      {ann.assembly_name || ann.assembly_accession} · {ann.source_file_info?.database}
                    </div>
                  </div>
                  <Checkbox checked={isSelected} disabled={disabled} className="pointer-events-none shrink-0" />
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
