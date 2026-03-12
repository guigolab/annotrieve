"use client"

import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import type { ReactNode } from "react"
import * as d3 from "d3"
import { Loader2 } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useFilteredTreeByRootAndRank } from "@/lib/stores/flattened-tree"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import { getTreeGeneColors, type TreeRankOption } from "./taxonomy-tree-controls"
import { TaxonomyNodeTooltip } from "./taxonomy-node-tooltip"
import { Button } from "@/components/ui/button"

const DISPLAY_LIMIT = 50
const PADDING = 100
const INNER_RADIUS = 60
const MIN_PAD_ANGLE = 0.002
const MAX_PAD_ANGLE = 0.04
const HOVER_EXPAND = 1.06
const LABEL_OFFSET = 8
const MIN_LABEL_RADIUS_OFFSET = 12
const CHART_HEIGHT_FALLBACK = 700
const TRANSITION_MS = 300
const Y_TICKS = 4

type Toggles = { showCoding: boolean; showNonCoding: boolean; showPseudogene: boolean }

type ChartLayout = {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  bandWidth: number
  padAngle: number
  n: number
}

export type StackedRadialBarRow = {
  taxid: number
  taxon_name: string
  rank: string
  coding: number
  non_coding: number
  pseudogene: number
  total: number
  annotationCount: number
  organismsCount: number
  assembliesCount: number
}

function getChartLayout(width: number, height: number, n: number): ChartLayout {
  const cx = width / 2
  const cy = height / 2
  const outerRadius = Math.min(width, height) / 2 - PADDING
  const bandWidth = n > 0 ? (2 * Math.PI) / n : 0
  const innerRadius = Math.min(INNER_RADIUS, outerRadius * 0.15)
  const padAngle = n > 0
    ? Math.max(MIN_PAD_ANGLE, Math.min(MAX_PAD_ANGLE, bandWidth * 0.08))
    : 0
  return { cx, cy, innerRadius, outerRadius, bandWidth, padAngle, n }
}

function toCanvasAngle(angle: number): number {
  return angle - Math.PI / 2
}

function getBarAngles(pos: number, bandWidth: number, padAngle: number) {
  const bandStart = pos * bandWidth + padAngle / 2
  const bandEnd = (pos + 1) * bandWidth - padAngle / 2
  return { startAngle: toCanvasAngle(bandStart), endAngle: toCanvasAngle(bandEnd) }
}

function getVisibleTotal(
  d: { coding: number; non_coding: number; pseudogene: number },
  t: Toggles
): number {
  return (t.showCoding ? d.coding : 0) + (t.showNonCoding ? d.non_coding : 0) + (t.showPseudogene ? d.pseudogene : 0)
}

function cum(
  d: { coding: number; non_coding: number; pseudogene: number },
  key: "coding" | "non_coding" | "pseudogene",
  t: Toggles
): { start: number; end: number } {
  const c = t.showCoding ? d.coding : 0
  const nc = t.showNonCoding ? d.non_coding : 0
  const p = t.showPseudogene ? d.pseudogene : 0
  if (key === "coding") return { start: 0, end: c }
  if (key === "non_coding") return { start: c, end: c + nc }
  return { start: c + nc, end: c + nc + p }
}

function hitTestBar(layout: ChartLayout, localX: number, localY: number): number | null {
  const { cx, cy, innerRadius: ir, outerRadius, bandWidth, padAngle, n } = layout
  if (n === 0) return null
  const dx = localX - cx
  const dy = localY - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < ir || dist > outerRadius) return null
  const dataAngle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
  const effectiveBand = bandWidth - padAngle
  if (effectiveBand <= 0) return 0
  let index = Math.floor((dataAngle - padAngle / 2) / bandWidth)
  return Math.max(0, Math.min(n - 1, index))
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatAxisValue(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  if (value === 0) return "0"
  if (value > 0 && value < 1) return value.toFixed(1)
  return value.toFixed(0)
}

function appendArcSegment(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  startAngle: number,
  endAngle: number
) {
  ctx.moveTo(cx + Math.cos(startAngle) * r0, cy + Math.sin(startAngle) * r0)
  ctx.lineTo(cx + Math.cos(startAngle) * r1, cy + Math.sin(startAngle) * r1)
  ctx.arc(cx, cy, r1, startAngle, endAngle)
  ctx.lineTo(cx + Math.cos(endAngle) * r0, cy + Math.sin(endAngle) * r0)
  ctx.arc(cx, cy, r0, endAngle, startAngle, true)
  ctx.closePath()
}

function collectLeafIds(root: d3.HierarchyNode<FlatTreeNode> | null): Set<string> {
  const ids = new Set<string>()
  if (!root) return ids
  root.leaves().forEach((n) => { if (n.data?.id) ids.add(n.data.id) })
  return ids
}

interface D3StackedRadialBarProps {
  title?: string
  description?: ReactNode
  rootTaxid?: string | null
  highlightTaxid?: string | null
  onTaxonSelect?: (taxid: string) => void
  controlledRank?: TreeRankOption | null
  controlledShowLabels?: boolean
}

export function D3StackedRadialBar({
  rootTaxid = null,
  highlightTaxid = null,
  onTaxonSelect,
  controlledRank,
  controlledShowLabels,
}: D3StackedRadialBarProps) {
  const { flatNodes, isLoading: loading, error, fetchFlattenedTree } = useFlattenedTreeStore()
  const rankForFilter = controlledRank === "all" || controlledRank == null ? null : controlledRank
  const filteredTree = useFilteredTreeByRootAndRank(rootTaxid, rankForFilter)
  const idsAtSelectedRank = useMemo(() => collectLeafIds(filteredTree), [filteredTree])
  const isDark = useUIStore((s) => s.theme) === "dark"
  const geneColors = useMemo(() => getTreeGeneColors(isDark), [isDark])
  const selectedGeneTypes = useTaxonomyGeneTypesStore((s) => s.selectedGeneTypes)

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawRef = useRef<(() => void) | null>(null)
  const hoveredIndexRef = useRef<number | null>(null)
  const sizeRef = useRef({ width: 0, height: CHART_HEIGHT_FALLBACK })
  const sortedIndicesRef = useRef<number[]>([])
  const prevTogglesRef = useRef<Set<"coding" | "non_coding" | "pseudogene">>(new Set(["coding", "non_coding", "pseudogene"]))
  const transitionRef = useRef(1)

  useEffect(() => { fetchFlattenedTree() }, [fetchFlattenedTree])
  useEffect(() => { hoveredIndexRef.current = hoveredIndex }, [hoveredIndex])

  const data = useMemo((): StackedRadialBarRow[] => {
    const source = flatNodes.filter((n) => n.id !== "root" && idsAtSelectedRank.has(n.id))
    return source
      .map((n) => {
        const coding = n.coding_count ?? 0
        const non_coding = n.non_coding_count ?? 0
        const pseudogene = n.pseudogene_count ?? 0
        return {
          taxid: parseInt(n.id, 10) || 0,
          taxon_name: n.scientific_name ?? "",
          rank: n.rank ?? "",
          coding,
          non_coding,
          pseudogene,
          total: coding + non_coding + pseudogene,
          annotationCount: n.annotations_count ?? 0,
          organismsCount: n.organisms_count ?? 0,
          assembliesCount: n.assemblies_count ?? 0,
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, DISPLAY_LIMIT)
  }, [flatNodes, idsAtSelectedRank])

  useEffect(() => {
    const changed =
      selectedGeneTypes.size !== prevTogglesRef.current.size ||
      [...selectedGeneTypes].some((t) => !prevTogglesRef.current.has(t)) ||
      [...prevTogglesRef.current].some((t) => !selectedGeneTypes.has(t))
    if (changed) transitionRef.current = 0
  }, [selectedGeneTypes])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    sizeRef.current = {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 400) || CHART_HEIGHT_FALLBACK,
    }
    const dpr = window.devicePixelRatio || 1

    const anyShown = selectedGeneTypes.size > 0
    const toggles: Toggles = {
      showCoding: anyShown ? selectedGeneTypes.has("coding") : true,
      showNonCoding: anyShown ? selectedGeneTypes.has("non_coding") : true,
      showPseudogene: anyShown ? selectedGeneTypes.has("pseudogene") : true,
    }
    const prev = prevTogglesRef.current
    const prevAny = prev.size > 0
    const prevToggles: Toggles = {
      showCoding: prevAny ? prev.has("coding") : true,
      showNonCoding: prevAny ? prev.has("non_coding") : true,
      showPseudogene: prevAny ? prev.has("pseudogene") : true,
    }

    const sortedIndices = data
      .map((_, i) => i)
      .sort((a, b) => getVisibleTotal(data[b], toggles) - getVisibleTotal(data[a], toggles))
    sortedIndicesRef.current = sortedIndices

    const hoverColor = isDark ? "#fbbf24" : "#f59e0b"
    const keys: ("coding" | "non_coding" | "pseudogene")[] = ["coding", "non_coding", "pseudogene"]

    const draw = () => {
      const { width, height } = sizeRef.current
      if (width <= 0) return
      const layout = getChartLayout(width, height, data.length)
      const { cx, cy, innerRadius, outerRadius, bandWidth, padAngle, n } = layout
      const sorted = sortedIndicesRef.current
      const transT = Math.min(1, transitionRef.current)

      const maxCurr = Math.max(1, ...data.map((d) => getVisibleTotal(d, toggles)))
      const maxPrev = Math.max(1, ...data.map((d) => getVisibleTotal(d, prevToggles)))
      const maxVal = maxPrev + transT * (maxCurr - maxPrev)
      const y = (value: number) => innerRadius + (value / maxVal) * (outerRadius - innerRadius)

      ctx.save()
      ctx.clearRect(0, 0, width, height)

      for (let tk = 1; tk <= Y_TICKS; tk++) {
        ctx.beginPath()
        ctx.arc(cx, cy, y((maxVal * tk) / Y_TICKS), 0, 2 * Math.PI)
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.1)" : "rgba(100,116,139,0.1)"
        ctx.lineWidth = 1
        ctx.stroke()
      }

      for (const key of keys) {
        ctx.beginPath()
        for (let pos = 0; pos < n; pos++) {
          const d = data[sorted[pos]]
          const prevC = cum(d, key, prevToggles)
          const currC = cum(d, key, toggles)
          const r0 = y(prevC.start + transT * (currC.start - prevC.start))
          const r1 = y(prevC.end + transT * (currC.end - prevC.end))
          if (r1 <= r0) continue
          const { startAngle, endAngle } = getBarAngles(pos, bandWidth, padAngle)
          appendArcSegment(ctx, cx, cy, r0, r1, startAngle, endAngle)
        }
        ctx.fillStyle = geneColors[key]
        ctx.fill()
      }

      const highlightIdx = highlightTaxid != null ? data.findIndex((r) => String(r.taxid) === highlightTaxid) : -1
      const highlightPos = highlightIdx >= 0 ? sorted.indexOf(highlightIdx) : -1
      const hoverPos = hoveredIndexRef.current !== null ? sorted.indexOf(hoveredIndexRef.current) : -1
      const toExpand = new Set<number>()
      if (hoverPos >= 0 && hoverPos < n) toExpand.add(hoverPos)
      if (highlightPos >= 0 && highlightPos < n) toExpand.add(highlightPos)

      const midR = (innerRadius + outerRadius) / 2
      const halfThick = (outerRadius - innerRadius) / 2
      const r0Exp = midR - halfThick * HOVER_EXPAND
      const r1Exp = midR + halfThick * HOVER_EXPAND
      const mapR = (r: number) => r0Exp + ((r - innerRadius) / (outerRadius - innerRadius)) * (r1Exp - r0Exp)

      toExpand.forEach((pos) => {
        const d = data[sorted[pos]]
        const { startAngle, endAngle } = getBarAngles(pos, bandWidth, padAngle)
        for (const key of keys) {
          const prevC = cum(d, key, prevToggles)
          const currC = cum(d, key, toggles)
          const r0 = y(prevC.start + transT * (currC.start - prevC.start))
          const r1 = y(prevC.end + transT * (currC.end - prevC.end))
          if (r1 <= r0) continue
          ctx.beginPath()
          appendArcSegment(ctx, cx, cy, mapR(r0), mapR(r1), startAngle, endAngle)
          ctx.fillStyle = geneColors[key]
          ctx.fill()
        }
        ctx.beginPath()
        appendArcSegment(ctx, cx, cy, r0Exp, r1Exp, startAngle, endAngle)
        ctx.strokeStyle = hoverColor
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      ctx.font = "10px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (let tk = 1; tk <= Y_TICKS; tk++) {
        const r = y((maxVal * tk) / Y_TICKS)
        const labelText = formatAxisValue((maxVal * tk) / Y_TICKS)
        const pillW = ctx.measureText(labelText).width + 8
        const pillH = 14
        const pillY = cy - r - pillH - 2
        ctx.fillStyle = isDark ? "rgba(15,23,42,0.75)" : "rgba(248,250,252,0.75)"
        ctx.fillRect(cx - pillW / 2, pillY, pillW, pillH)
        ctx.fillStyle = isDark ? "rgba(148,163,184,0.9)" : "rgba(100,116,139,0.9)"
        ctx.fillText(labelText, cx, pillY + pillH / 2)
      }

      ctx.beginPath()
      ctx.arc(cx, cy, innerRadius - 1, 0, 2 * Math.PI)
      ctx.fillStyle = isDark ? "rgba(15,23,42,0.55)" : "rgba(248,250,252,0.55)"
      ctx.fill()

      const countFontSize = Math.max(14, Math.min(20, innerRadius * 0.32))
      const subFontSize = Math.max(9, Math.min(12, innerRadius * 0.2))
      ctx.font = `bold ${countFontSize}px system-ui, sans-serif`
      ctx.fillStyle = isDark ? "rgba(226,232,240,0.95)" : "rgba(30,41,59,0.95)"
      ctx.fillText("Top 50", cx, cy - subFontSize * 0.8)
      ctx.font = `${subFontSize}px system-ui, sans-serif`
      ctx.fillStyle = isDark ? "rgba(148,163,184,0.8)" : "rgba(100,116,139,0.8)"
      ctx.fillText("outliers", cx, cy + countFontSize * 0.5)

      if ((controlledShowLabels ?? true) && n > 0) {
        const minLabelR = innerRadius + MIN_LABEL_RADIUS_OFFSET
        const fontSize = 10
        ctx.save()
        ctx.font = `${fontSize}px system-ui, sans-serif`
        for (let pos = 0; pos < n; pos++) {
          const dataIdx = sorted[pos]
          const d = data[dataIdx]
          const currV = getVisibleTotal(d, toggles)
          const prevV = getVisibleTotal(d, prevToggles)
          const interpV = prevV + transT * (currV - prevV)
          const barOuterR = interpV > 0 ? y(interpV) : innerRadius
          const labelRadius = Math.max(barOuterR + LABEL_OFFSET, minLabelR)

          const { startAngle, endAngle } = getBarAngles(pos, bandWidth, padAngle)
          const labelAngle = (startAngle + endAngle) / 2
          const fullName = d.taxon_name || `Taxon ${pos + 1}`
          const maxLen = n <= 15 ? 24 : n <= 30 ? 16 : 12
          const name = fullName.length > maxLen ? fullName.slice(0, maxLen - 1) + "…" : fullName

          const norm = ((labelAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
          const isLeftHalf = norm > Math.PI / 2 && norm < (3 * Math.PI) / 2
          const isHighlighted =
            hoveredIndexRef.current === dataIdx ||
            (highlightTaxid != null && String(d.taxid) === highlightTaxid)

          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(labelAngle)
          ctx.translate(labelRadius, 0)
          if (isLeftHalf) {
            ctx.rotate(Math.PI)
            ctx.textAlign = "end"
          } else {
            ctx.textAlign = "start"
          }
          ctx.textBaseline = "middle"
          ctx.font = isHighlighted ? `bold ${fontSize}px system-ui, sans-serif` : `${fontSize}px system-ui, sans-serif`
          ctx.fillStyle = isHighlighted ? hoverColor : isDark ? "rgba(226,232,240,0.85)" : "rgba(30,41,59,0.85)"
          ctx.fillText(name, 0, 0)
          ctx.restore()
        }
        ctx.restore()
      }
      ctx.restore()
    }

    drawRef.current = draw

    const applySize = () => {
      const { width, height } = sizeRef.current
      if (width <= 0) return
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    applySize()
    draw()

    const ro = new ResizeObserver(() => {
      sizeRef.current = {
        width: container.clientWidth,
        height: Math.max(container.clientHeight, 400) || CHART_HEIGHT_FALLBACK,
      }
      applySize()
      drawRef.current?.()
    })
    ro.observe(container)

    let frameId: number | null = null
    if (transitionRef.current < 1) {
      const start = performance.now()
      const run = () => {
        const t = Math.min(1, (performance.now() - start) / TRANSITION_MS)
        transitionRef.current = t
        drawRef.current?.()
        if (t < 1) frameId = requestAnimationFrame(run)
        else {
          transitionRef.current = 1
          prevTogglesRef.current = new Set(selectedGeneTypes)
        }
      }
      frameId = requestAnimationFrame(run)
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      ro.disconnect()
    }
  }, [data, selectedGeneTypes, geneColors, isDark, highlightTaxid, controlledShowLabels])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !containerRef.current || data.length === 0) return
      const rect = canvasRef.current.getBoundingClientRect()
      const layout = getChartLayout(rect.width, rect.height, data.length)
      const pos = hitTestBar(layout, e.clientX - rect.left, e.clientY - rect.top)
      const dataIdx = pos !== null ? sortedIndicesRef.current[pos] ?? null : null
      const prev = hoveredIndexRef.current
      hoveredIndexRef.current = dataIdx
      setHoveredIndex(dataIdx)
      if (dataIdx !== null && containerRef.current) {
        const cr = containerRef.current.getBoundingClientRect()
        setTooltipPos({ x: e.clientX - cr.left + 12, y: e.clientY - cr.top - 12 })
      } else setTooltipPos(null)
      if (dataIdx !== prev) drawRef.current?.()
    },
    [data.length]
  )

  const handleMouseLeave = useCallback(() => {
    hoveredIndexRef.current = null
    setHoveredIndex(null)
    setTooltipPos(null)
    drawRef.current?.()
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onTaxonSelect || data.length === 0 || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const pos = hitTestBar(getChartLayout(rect.width, rect.height, data.length), e.clientX - rect.left, e.clientY - rect.top)
      if (pos === null) return
      const row = data[sortedIndicesRef.current[pos]]
      if (row) onTaxonSelect(String(row.taxid))
    },
    [onTaxonSelect, data]
  )

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading gene stack data…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">Failed to load gene stack data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={() => fetchFlattenedTree()}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div ref={containerRef} className="relative w-full flex-1 min-h-0 overflow-visible">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No data for this rank.
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-pointer block"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onClick={handleClick}
              role="img"
              aria-label="Radial stacked bar chart of gene counts by taxonomy"
            />
            {hoveredIndex !== null && tooltipPos && data[hoveredIndex] != null && (
              <TaxonomyNodeTooltip
                position={tooltipPos}
                offset={{ x: 0, y: 0 }}
                className="max-w-[min(280px,90vw)]"
                payload={{
                  title: data[hoveredIndex].taxon_name || `Taxon ${hoveredIndex + 1}`,
                  rank: data[hoveredIndex].rank ?? undefined,
                  organismsCount: data[hoveredIndex].organismsCount,
                  assembliesCount: data[hoveredIndex].assembliesCount,
                  annotationsCount: data[hoveredIndex].annotationCount,
                  geneCounts: {
                    coding: data[hoveredIndex].coding,
                    non_coding: data[hoveredIndex].non_coding,
                    pseudogene: data[hoveredIndex].pseudogene,
                  },
                  geneColors,
                  formatNumber: formatCount,
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
