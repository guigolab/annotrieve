"use client"

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from "react"
import { ChevronRight } from "lucide-react"

import {
  cellBackground,
  cellTextIsDark,
  cellTooltip,
  heatmapColumnLayout,
  heatmapHeaderHeight,
  HEATMAP_COUNT_MIN_CELL_W,
  type NodeNameCounts,
} from "@/lib/genes/heatmap"
import type { FlatHitTreeRow } from "@/lib/genes/tree"
import { useVirtualColumns } from "@/lib/genes/virtual"
import type { CountUnit } from "@/lib/genes/view"
import { cn } from "@/lib/utils"

const INDENT_PX = 12
const TAXON_COL_W = 260
const ROW_H = 44
const TILE_H = 36
const GAP = 4
const MIN_CELL_W = 44
const EMPTY_COUNTS: NodeNameCounts = { n: 0, byName: [] }

interface CanvasTheme {
  primary: string
  muted: string
  foreground: string
  bar: string
}

/**
 * Resolve a CSS color (oklch / hsl / space-separated RGB) for canvas fillStyle.
 * Wrapping oklch tokens in `rgb(...)` is invalid and paints black.
 */
function cssColor(raw: string, fallback: string, alpha?: number): string {
  const v = raw.trim() || fallback
  const withAlpha = (solid: string): string => {
    if (alpha == null) return solid
    return `color-mix(in oklab, ${solid} ${Math.round(alpha * 100)}%, transparent)`
  }
  // Legacy shadcn space-separated channels: "37 99 235"
  if (/^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(v)) {
    return alpha != null ? `rgb(${v} / ${alpha})` : `rgb(${v})`
  }
  return withAlpha(v)
}

function readCanvasTheme(el: HTMLElement | null): CanvasTheme {
  const styles = el ? getComputedStyle(el) : null
  const primary =
    styles?.getPropertyValue("--primary").trim() || "oklch(0.58 0.13 215)"
  const muted =
    styles?.getPropertyValue("--muted").trim() || "oklch(0.96 0.01 240)"
  const foreground =
    styles?.getPropertyValue("--foreground").trim() || "oklch(0.2 0.02 240)"
  return {
    primary: cssColor(primary, "oklch(0.58 0.13 215)"),
    muted: cssColor(muted, "oklch(0.96 0.01 240)"),
    foreground: cssColor(foreground, "oklch(0.2 0.02 240)", 0.9),
    bar: cssColor(primary, "oklch(0.58 0.13 215)", 0.85),
  }
}

export interface HeatmapNameColumn {
  name: string
  id: string
  count: number
}

interface GenesHeatmapTableProps {
  columns: HeatmapNameColumn[]
  activeColumnCount: number
  rows: FlatHitTreeRow[]
  rowCounts: NodeNameCounts[]
  expanded: Set<string>
  unit: CountUnit
  /** Absolute horizontal bars when a single gene column is active. */
  singleGeneBars?: boolean
  onToggleExpand: (id: string) => void
  remaining: number
  onLoadMore: () => void
  className?: string
}

interface TooltipState {
  x: number
  y: number
  primary: string
  secondary?: string
}

export interface HeatmapTooltipHandle {
  show: (state: TooltipState) => void
  move: (x: number, y: number) => void
  hide: () => void
}

function useScrollShadows(ref: RefObject<HTMLElement | null>) {
  const [scrolledX, setScrolledX] = useState(false)
  const [scrolledY, setScrolledY] = useState(false)
  const [canScrollX, setCanScrollX] = useState(false)
  const rafRef = useRef(0)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setScrolledX(el.scrollLeft > 1)
    setScrolledY(el.scrollTop > 1)
    setCanScrollX(el.scrollWidth - el.clientWidth > 2)
  }, [ref])

  const onScroll = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      update()
    })
  }, [update])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [ref, update])

  return { scrolledX, scrolledY, canScrollX, onScroll, refresh: update }
}

/** Owns tip state so pointer moves do not re-render the heatmap hosts. */
const HeatmapFloatingTooltip = forwardRef<HeatmapTooltipHandle>(
  function HeatmapFloatingTooltip(_props, ref) {
    const [tip, setTip] = useState<TooltipState | null>(null)

    useImperativeHandle(
      ref,
      () => ({
        show: (state) => setTip(state),
        move: (x, y) =>
          setTip((prev) => (prev ? { ...prev, x, y } : null)),
        hide: () => setTip(null),
      }),
      [],
    )

    if (!tip) return null

    return (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
        style={{
          left: tip.x + 12,
          top: tip.y + 12,
        }}
      >
        <div className="font-medium leading-snug">{tip.primary}</div>
        {tip.secondary ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {tip.secondary}
          </div>
        ) : null}
      </div>
    )
  },
)

interface ColumnHeaderProps {
  col: HeatmapNameColumn
  cellW: number
  headerH: number
  rotateHeaders: boolean
  scrolledY: boolean
  unit: CountUnit
}

const ColumnHeader = memo(function ColumnHeader({
  col,
  cellW,
  headerH,
  rotateHeaders,
  scrolledY,
  unit,
}: ColumnHeaderProps) {
  const unitLabel = unit === "species" ? "species" : "annotations"
  const tipPrimary = `${col.name} · ${col.count.toLocaleString()} ${unitLabel}`

  return (
    <div
      role="columnheader"
      data-heatmap-col={col.id}
      data-tip-primary={tipPrimary}
      tabIndex={0}
      aria-label={`${col.name}, ${col.count.toLocaleString()} ${unitLabel}`}
      className={cn(
        "shrink-0 bg-card/95 p-0 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        "shadow-[0_1px_0_0_var(--border)]",
        scrolledY && "shadow-[0_4px_8px_-4px_rgba(0,0,0,0.12)]",
      )}
      style={{
        width: cellW,
        minWidth: cellW,
        height: headerH,
      }}
    >
      <div className="relative flex h-full w-full items-end justify-center px-0.5 pb-1.5 text-foreground">
        <span
          className={cn(
            "max-h-full overflow-hidden text-ellipsis font-mono text-[11px] font-semibold uppercase leading-none tracking-wide",
            rotateHeaders
              ? "[writing-mode:vertical-rl] rotate-180"
              : "max-w-full truncate",
          )}
        >
          {col.name}
        </span>
      </div>
    </div>
  )
})

interface TaxonCellProps {
  nodeId: string
  label: string
  rank: string | null
  depth: number
  n: number
  unit: CountUnit
  hasKids: boolean
  open: boolean
  scrolledX: boolean
  onToggleExpand: (id: string) => void
}

const TaxonCell = memo(function TaxonCell({
  nodeId,
  label,
  rank,
  depth,
  n,
  unit,
  hasKids,
  open,
  scrolledX,
  onToggleExpand,
}: TaxonCellProps) {
  const tipPrimary = rank
    ? `${label} · ${rank} · taxid ${nodeId}`
    : `${label} · taxid ${nodeId}`
  const unitLabel = unit === "species" ? "species" : "annotations"

  return (
    <div
      role="rowheader"
      data-heatmap-taxon={nodeId}
      data-tip-primary={tipPrimary}
      className={cn(
        "border-r border-border bg-card text-left font-normal",
        "group-hover/row:bg-muted/50",
        scrolledX && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.08)]",
      )}
      style={{
        width: TAXON_COL_W,
        minWidth: TAXON_COL_W,
        height: ROW_H,
      }}
    >
      <div
        className="relative flex h-full min-w-0 items-center gap-1.5 pr-2"
        style={{ paddingLeft: depth * INDENT_PX + 8 }}
      >
        {hasKids ? (
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={open}
            aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
            onClick={() => onToggleExpand(nodeId)}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1 text-left" tabIndex={0}>
          <span className="block truncate text-sm font-medium leading-tight">
            {label}
          </span>
          {rank ? (
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {rank}
            </span>
          ) : null}
        </div>
        <span
          className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground"
          aria-label={`${n.toLocaleString()} ${unitLabel}`}
        >
          {n.toLocaleString()}
        </span>
      </div>
    </div>
  )
})

interface HitCell {
  row: number
  col: number
  nodeId: string
  gene: string
  taxonLabel: string
  k: number
  n: number
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

interface GenesHeatmapCanvasProps {
  columns: HeatmapNameColumn[]
  activeColumnCount: number
  rows: FlatHitTreeRow[]
  rowCounts: NodeNameCounts[]
  cellW: number
  stride: number
  colStart: number
  colEnd: number
  offsetX: number
  showCounts: boolean
  singleGeneBars: boolean
  maxK: number
  unit: CountUnit
  tipRef: RefObject<HeatmapTooltipHandle | null>
}

const GenesHeatmapCanvas = memo(function GenesHeatmapCanvas({
  columns,
  activeColumnCount,
  rows,
  rowCounts,
  cellW,
  stride,
  colStart,
  colEnd,
  offsetX,
  showCounts,
  singleGeneBars,
  maxK,
  unit,
  tipRef,
}: GenesHeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoverRef = useRef<{ row: number; col: number } | null>(null)
  const themeRef = useRef<CanvasTheme>(readCanvasTheme(null))

  const visibleCount = Math.max(0, colEnd - colStart)
  const canvasCssW = Math.max(1, visibleCount * stride)
  const canvasCssH = Math.max(1, rows.length * ROW_H)
  const tileW = Math.max(cellW - GAP * 2, 20)

  const refreshTheme = useCallback(() => {
    themeRef.current = readCanvasTheme(canvasRef.current)
  }, [])

  const hitAt = useCallback(
    (localX: number, localY: number): HitCell | null => {
      if (localX < 0 || localY < 0) return null
      const col = colStart + Math.floor(localX / stride)
      const row = Math.floor(localY / ROW_H)
      if (col < colStart || col >= colEnd || row < 0 || row >= rows.length) {
        return null
      }
      const item = rows[row]
      const colDef = columns[col]
      if (!item || !colDef) return null
      const counts = rowCounts[row] ?? EMPTY_COUNTS
      const n = counts.n
      const activeIdx = col < activeColumnCount ? col : -1
      if (activeIdx < 0) return null
      const k = counts.byName[activeIdx] ?? 0
      return {
        row,
        col,
        nodeId: item.node.id,
        gene: colDef.name,
        taxonLabel: item.node.label,
        k,
        n,
      }
    },
    [
      activeColumnCount,
      colEnd,
      colStart,
      columns,
      rowCounts,
      rows,
      stride,
    ],
  )

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvasCssW
    const h = canvasCssH
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const hover = hoverRef.current
    const theme = themeRef.current
    if (showCounts) {
      ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif"
    }
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (let ri = 0; ri < rows.length; ri++) {
      const counts = rowCounts[ri] ?? EMPTY_COUNTS
      const n = counts.n
      const y0 = ri * ROW_H
      const tileY = y0 + (ROW_H - TILE_H) / 2

      for (let ci = colStart; ci < colEnd; ci++) {
        const col = columns[ci]
        if (!col) continue
        const activeIdx = ci < activeColumnCount ? ci : -1
        const k = activeIdx >= 0 ? (counts.byName[activeIdx] ?? 0) : 0
        const hasValue = k > 0
        const localCol = ci - colStart
        const cellX = localCol * stride
        const tileX = cellX + (cellW - tileW) / 2

        if (hasValue) {
          if (singleGeneBars) {
            const barFrac = maxK > 0 ? Math.min(1, k / maxK) : 0
            const barW = Math.max(barFrac * tileW, tileW * 0.04)
            ctx.fillStyle = theme.bar
            roundRect(ctx, tileX, tileY + 4, barW, TILE_H - 8, 6)
            ctx.fill()
            if (showCounts) {
              ctx.fillStyle = theme.foreground
              ctx.fillText(
                k.toLocaleString(),
                tileX + tileW / 2,
                tileY + TILE_H / 2,
              )
            }
          } else {
            const bg = cellBackground(k, n) ?? theme.muted
            ctx.fillStyle = bg
            roundRect(ctx, tileX, tileY, tileW, TILE_H, 6)
            ctx.fill()
            if (showCounts) {
              ctx.fillStyle = cellTextIsDark(k, n)
                ? theme.foreground
                : "rgba(255, 255, 255, 0.95)"
              ctx.fillText(
                k.toLocaleString(),
                tileX + tileW / 2,
                tileY + TILE_H / 2,
              )
            }
          }
        }

        if (hover && hover.row === ri && hover.col === ci && hasValue) {
          ctx.strokeStyle = theme.primary
          ctx.lineWidth = 2
          if (singleGeneBars) {
            roundRect(ctx, tileX, tileY + 4, tileW, TILE_H - 8, 6)
          } else {
            roundRect(ctx, tileX, tileY, tileW, TILE_H, 6)
          }
          ctx.stroke()
        }
      }
    }
  }, [
    activeColumnCount,
    canvasCssH,
    canvasCssW,
    cellW,
    colEnd,
    colStart,
    columns,
    maxK,
    rowCounts,
    rows,
    showCounts,
    singleGeneBars,
    stride,
    tileW,
  ])

  useLayoutEffect(() => {
    refreshTheme()
    paint()
  }, [paint, refreshTheme])

  useLayoutEffect(() => {
    refreshTheme()
    const root = document.documentElement
    const mo = new MutationObserver(() => {
      refreshTheme()
      paint()
    })
    mo.observe(root, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    })
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onScheme = () => {
      refreshTheme()
      paint()
    }
    mq.addEventListener("change", onScheme)
    return () => {
      mo.disconnect()
      mq.removeEventListener("change", onScheme)
    }
  }, [refreshTheme, paint])

  const showTipForHit = useCallback(
    (hit: HitCell, clientX: number, clientY: number) => {
      const unitLabel = unit === "species" ? "species" : "annotations"
      const pct = hit.n > 0 ? Math.round((hit.k / hit.n) * 100) : 0
      tipRef.current?.show({
        x: clientX,
        y: clientY,
        primary: `${hit.taxonLabel} / ${hit.gene}: ${hit.k.toLocaleString()} ${unitLabel}`,
        secondary:
          hit.n > 0
            ? `${hit.k.toLocaleString()} of ${hit.n.toLocaleString()} (${pct}%)`
            : undefined,
      })
    },
    [tipRef, unit],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const hit = hitAt(localX, localY)
      const nextHover = hit ? { row: hit.row, col: hit.col } : null
      const prev = hoverRef.current
      if (prev?.row !== nextHover?.row || prev?.col !== nextHover?.col) {
        hoverRef.current = nextHover
        paint()
      }
      if (hit && hit.k > 0) {
        showTipForHit(hit, e.clientX, e.clientY)
        canvas.style.cursor = "pointer"
      } else {
        tipRef.current?.hide()
        canvas.style.cursor = "default"
      }
    },
    [hitAt, paint, showTipForHit, tipRef],
  )

  const onPointerLeave = useCallback(() => {
    hoverRef.current = null
    tipRef.current?.hide()
    paint()
    if (canvasRef.current) canvasRef.current.style.cursor = "default"
  }, [paint, tipRef])

  // Screen-reader summary for the matrix.
  const ariaLabel = useMemo(() => {
    const parts: string[] = []
    for (let ri = 0; ri < Math.min(rows.length, 3); ri++) {
      const item = rows[ri]!
      for (let ci = colStart; ci < Math.min(colEnd, colStart + 3); ci++) {
        const col = columns[ci]
        if (!col) continue
        const counts = rowCounts[ri] ?? EMPTY_COUNTS
        const activeIdx = ci < activeColumnCount ? ci : -1
        const k = activeIdx >= 0 ? (counts.byName[activeIdx] ?? 0) : 0
        if (counts.n > 0 && k > 0) {
          parts.push(cellTooltip(item.node.label, col.name, k, counts.n, unit))
        }
      }
    }
    return parts.length
      ? `Gene matrix. Examples: ${parts.slice(0, 3).join("; ")}`
      : "Gene distribution matrix"
  }, [
    activeColumnCount,
    colEnd,
    colStart,
    columns,
    rowCounts,
    rows,
    unit,
  ])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel}
      width={canvasCssW}
      height={canvasCssH}
      className="block"
      style={{
        width: canvasCssW,
        height: canvasCssH,
        marginLeft: offsetX,
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    />
  )
})

export function GenesHeatmapTable({
  columns,
  activeColumnCount,
  rows,
  rowCounts,
  expanded,
  unit,
  singleGeneBars = false,
  onToggleExpand,
  remaining,
  onLoadMore,
  className,
}: GenesHeatmapTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HeatmapTooltipHandle | null>(null)
  const { scrolledX, scrolledY, canScrollX, onScroll } =
    useScrollShadows(scrollRef)

  const layout = useMemo(
    () => heatmapColumnLayout(columns.length),
    [columns.length],
  )
  const cellW = Math.max(layout.cellW, MIN_CELL_W)
  const stride = cellW + GAP
  const rotateHeaders = layout.rotateHeaders || columns.length > 6
  const headerH = useMemo(
    () =>
      heatmapHeaderHeight(
        rotateHeaders,
        columns.map((c) => c.name),
        cellW,
      ),
    [rotateHeaders, columns, cellW],
  )
  const showCellCounts = cellW >= HEATMAP_COUNT_MIN_CELL_W
  const geneAreaW = columns.length * stride
  const tableWidth = TAXON_COL_W + geneAreaW

  const colWin = useVirtualColumns(
    scrollRef,
    columns.length,
    stride,
    TAXON_COL_W,
    4,
  )

  const maxK = useMemo(() => {
    if (!singleGeneBars) return 0
    let m = 0
    for (const row of rowCounts) {
      m = Math.max(m, row.byName[0] ?? 0)
    }
    return m
  }, [singleGeneBars, rowCounts])

  const showDomTip = useCallback(
    (target: HTMLElement | null, clientX: number, clientY: number) => {
      if (!target) {
        tipRef.current?.hide()
        return
      }
      // Canvas owns its tip path.
      if (target.closest("canvas")) return
      const tipEl = target.closest("[data-tip-primary]") as HTMLElement | null
      if (!tipEl) {
        tipRef.current?.hide()
        return
      }
      const primary = tipEl.dataset.tipPrimary
      if (!primary) {
        tipRef.current?.hide()
        return
      }
      tipRef.current?.show({
        x: clientX,
        y: clientY,
        primary,
        secondary: tipEl.dataset.tipSecondary || undefined,
      })
    },
    [],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return
      const target = e.target as HTMLElement
      if (target.closest("canvas")) return
      showDomTip(target, e.clientX, e.clientY)
    },
    [showDomTip],
  )

  const onPointerLeave = useCallback(() => {
    tipRef.current?.hide()
  }, [])

  const onFocusCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const el = e.target as HTMLElement
      if (el.closest("canvas")) return
      const rect = el.getBoundingClientRect()
      showDomTip(el, rect.left + rect.width / 2, rect.top)
    },
    [showDomTip],
  )

  const onBlurCapture = useCallback((e: FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest?.("[data-tip-primary]")) return
    tipRef.current?.hide()
  }, [])

  const handleScroll = useCallback(() => {
    onScroll()
  }, [onScroll])

  return (
    <div
      className={cn(
        "group/heatmap flex h-full min-h-0 flex-col overflow-hidden",
        className,
      )}
      role="grid"
      aria-label="Gene distribution heatmap"
      data-scrolled-x={scrolledX ? "true" : undefined}
      data-scrolled-y={scrolledY ? "true" : undefined}
      style={
        {
          "--cell-w": `${cellW}px`,
          "--row-h": `${ROW_H}px`,
          "--taxon-w": `${TAXON_COL_W}px`,
        } as CSSProperties
      }
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="h-full min-h-0 overflow-auto overscroll-contain scroll-smooth [scrollbar-width:thin]"
          onScroll={handleScroll}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
        >
          <div
            className="relative text-xs"
            style={{ width: tableWidth, minWidth: tableWidth }}
          >
            <div className="sr-only">
              Heatmap of {activeColumnCount} gene names across {rows.length}{" "}
              taxa
              {remaining > 0
                ? ` (showing ${rows.length}; ${remaining} more available)`
                : ""}
              . Hover cells for counts.
            </div>

            {/* Sticky header */}
            <div
              className="sticky top-0 z-20 flex border-b border-border bg-card"
              style={{ height: headerH, width: tableWidth }}
            >
              <div
                className={cn(
                  "sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-card px-2.5 py-2",
                )}
                style={{
                  width: TAXON_COL_W,
                  minWidth: TAXON_COL_W,
                  height: headerH,
                }}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  Taxon
                </span>
              </div>
              <div
                className="relative flex shrink-0"
                style={{ width: geneAreaW, height: headerH }}
              >
                <div
                  className="absolute top-0 flex"
                  style={{ left: colWin.offsetX }}
                >
                  {colWin.visibleIndexes.map((ci) => {
                    const col = columns[ci]
                    if (!col) return null
                    return (
                      <div
                        key={col.id}
                        className="shrink-0"
                        style={{ width: stride }}
                      >
                        <ColumnHeader
                          col={col}
                          cellW={cellW}
                          headerH={headerH}
                          rotateHeaders={rotateHeaders}
                          scrolledY={scrolledY}
                          unit={unit}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Body: sticky taxon column + canvas gene tiles */}
            <div className="flex" style={{ width: tableWidth }}>
              <div
                className="sticky left-0 z-10 shrink-0 bg-card"
                style={{ width: TAXON_COL_W }}
              >
                {rows.map((item, index) => {
                  const { node, depth } = item
                  const counts = rowCounts[index] ?? EMPTY_COUNTS
                  const n = counts.n
                  const hasKids = node.children.length > 0
                  const open = expanded.has(node.id)
                  return (
                    <div
                      key={`${node.id}-${depth}`}
                      role="row"
                      className="group/row"
                      style={{ height: ROW_H }}
                    >
                      <TaxonCell
                        nodeId={node.id}
                        label={node.label}
                        rank={node.rank}
                        depth={depth}
                        n={n}
                        unit={unit}
                        hasKids={hasKids}
                        open={open}
                        scrolledX={scrolledX}
                        onToggleExpand={onToggleExpand}
                      />
                    </div>
                  )
                })}
              </div>
              <div
                className="relative shrink-0"
                style={{ width: geneAreaW, height: rows.length * ROW_H }}
              >
                {columns.length > 0 && rows.length > 0 ? (
                  <GenesHeatmapCanvas
                    columns={columns}
                    activeColumnCount={activeColumnCount}
                    rows={rows}
                    rowCounts={rowCounts}
                    cellW={cellW}
                    stride={stride}
                    colStart={colWin.start}
                    colEnd={colWin.end}
                    offsetX={colWin.offsetX}
                    showCounts={showCellCounts}
                    singleGeneBars={singleGeneBars}
                    maxK={maxK}
                    unit={unit}
                    tipRef={tipRef}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {canScrollX ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
            aria-hidden
          />
        ) : null}
      </div>

      {remaining > 0 ? (
        <div className="shrink-0 border-t border-border px-3 py-2">
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onLoadMore}
          >
            Load more
            <span className="rounded-full bg-muted px-1.5 py-0.5 tabular-nums text-muted-foreground">
              {remaining.toLocaleString()}
            </span>
          </button>
        </div>
      ) : null}

      <HeatmapFloatingTooltip ref={tipRef} />
    </div>
  )
}
