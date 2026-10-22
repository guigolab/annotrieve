"use client"

import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import type { ResolvedTerm } from "@/lib/genes/adapter"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { GenesFilter } from "@/lib/genes/filters"
import {
  cellAlpha,
  cellFraction,
  cellTooltip,
  interpolateCividis,
  type HeatmapLayout,
} from "@/lib/genes/heatmap"
import type { FlatHitTreeRow } from "@/lib/genes/tree"
import {
  crosshairFill,
  selectionFill,
  selectionStroke,
  useIsDark,
} from "@/lib/hooks/use-is-dark"
import { GENES_LEGEND_H } from "@/components/genes/genes-overview-constants"
import { cn } from "@/lib/utils"

interface GenesHeatmapCanvasProps {
  adapter: GenesHitsAdapter
  filter: GenesFilter
  terms: ResolvedTerm[]
  visible: FlatHitTreeRow[]
  visibleIndexes: number[]
  layout: HeatmapLayout
  selectedTaxon: string | null
  selectedName: string | null
  hover: { row: number; col: number } | null
  focus: { row: number; col: number }
  onHover: (pos: { row: number; col: number } | null) => void
  onFocus: (pos: { row: number; col: number }) => void
  onSelectName: (name: string | null) => void
  onSelectCell: (taxonId: string, name: string) => void
  onAnnounce: (msg: string) => void
  columnRef: React.Ref<HTMLDivElement>
  gridScrollRef: React.Ref<HTMLDivElement>
  headerScrollRef: React.Ref<HTMLDivElement>
  scrollLeft: number
  onGridScroll: () => void
  onHeaderScroll: () => void
  summaryId: string
}

export function GenesHeatmapCanvas({
  adapter,
  filter,
  terms,
  visible,
  visibleIndexes,
  layout,
  selectedTaxon,
  selectedName,
  hover,
  focus,
  onHover,
  onFocus,
  onSelectName,
  onSelectCell,
  onAnnounce,
  columnRef,
  gridScrollRef,
  headerScrollRef,
  scrollLeft,
  onGridScroll,
  onHeaderScroll,
  summaryId,
}: GenesHeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dark = useIsDark()
  const { cellW, rowH, headerH, contentW, contentH } = layout
  const gridContentW = Math.max(contentW, 1)

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !terms.length) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const height = Math.max(contentH, 1)
    const width = gridContentW
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const selectedCol = selectedName
      ? terms.findIndex((t) => t.id === selectedName.toLowerCase())
      : -1

    const gap = Math.max(1, Math.min(2, Math.floor(Math.min(cellW, rowH) / 12)))

    for (const index of visibleIndexes) {
      const item = visible[index]
      if (!item) continue
      const counts = adapter.nodeCounts(filter, item.node.id)
      const y = index * rowH
      const selectedRow = selectedTaxon === item.node.id
      if (selectedRow) {
        ctx.fillStyle = selectionFill(dark)
        ctx.fillRect(0, y, width, rowH)
      }
      for (let c = 0; c < terms.length; c++) {
        const matched = counts.byName[c] ?? 0
        const frac = cellFraction(matched, counts.n)
        ctx.globalAlpha = cellAlpha(counts.n)
        ctx.fillStyle = interpolateCividis(frac)
        ctx.fillRect(
          c * cellW + gap,
          y + gap,
          cellW - gap * 2,
          rowH - gap * 2,
        )
      }
      ctx.globalAlpha = 1
    }

    const cross = hover ?? focus
    if (cross && terms.length) {
      ctx.fillStyle = crosshairFill(dark)
      ctx.fillRect(0, cross.row * rowH, width, rowH)
      ctx.fillRect(cross.col * cellW, 0, cellW, height)
    }

    if (selectedTaxon != null && selectedCol >= 0) {
      const rowIdx = visible.findIndex((r) => r.node.id === selectedTaxon)
      if (rowIdx >= 0) {
        ctx.strokeStyle = selectionStroke()
        ctx.lineWidth = Math.max(1.5, Math.min(3, cellW / 20))
        ctx.strokeRect(
          selectedCol * cellW + gap,
          rowIdx * rowH + gap,
          cellW - gap * 2,
          rowH - gap * 2,
        )
      }
    }
  }, [
    adapter,
    terms,
    visible,
    visibleIndexes,
    filter,
    gridContentW,
    contentH,
    cellW,
    rowH,
    hover,
    focus,
    selectedTaxon,
    selectedName,
    dark,
  ])

  useEffect(() => {
    paint()
  }, [paint])

  const cellAt = (row: number, col: number) => {
    const item = visible[row]
    const term = terms[col]
    if (!item || !term) return null
    const counts = adapter.nodeCounts(filter, item.node.id)
    const matched = counts.byName[col] ?? 0
    return {
      item,
      term,
      matched,
      n: counts.n,
      label: item.node.label,
    }
  }

  const pointerToCell = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const row = Math.floor(y / rowH)
    const col = Math.floor(x / cellW)
    if (row < 0 || row >= visible.length) return null
    if (col < 0 || col >= terms.length) return null
    return { row, col }
  }

  const announce = (row: number, col: number) => {
    const cell = cellAt(row, col)
    if (!cell) return
    onAnnounce(cellTooltip(cell.label, cell.term.name, cell.matched, cell.n))
  }

  const onCanvasMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pos = pointerToCell(e)
    onHover(pos)
    if (pos) announce(pos.row, pos.col)
  }

  const onCanvasClick = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const pos = pointerToCell(e)
    if (!pos) return
    onFocus(pos)
    const cell = cellAt(pos.row, pos.col)
    if (!cell) return
    onSelectCell(cell.item.node.id, cell.term.name)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!terms.length || !visible.length) return
    let { row, col } = focus
    if (e.key === "ArrowDown") {
      e.preventDefault()
      row = Math.min(visible.length - 1, row + 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      row = Math.max(0, row - 1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      col = Math.min(terms.length - 1, col + 1)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      col = Math.max(0, col - 1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cell = cellAt(row, col)
      if (cell) onSelectCell(cell.item.node.id, cell.term.name)
      return
    } else {
      return
    }
    onFocus({ row, col })
    onHover({ row, col })
    announce(row, col)
  }

  const tip = hover ? cellAt(hover.row, hover.col) : null
  const showScrollHint = scrollLeft > 0

  const labelFontSize = Math.max(
    9,
    Math.min(12, Math.floor(cellW * 0.45)),
  )

  return (
    <div
      ref={columnRef}
      className="flex min-w-0 flex-1 flex-col overflow-hidden px-1"
    >
      <div
        ref={headerScrollRef}
        className="shrink-0 overflow-x-auto overflow-y-hidden px-1"
        style={{ height: headerH }}
        onScroll={onHeaderScroll}
      >
        <div className="relative h-full" style={{ width: gridContentW }}>
          {terms.map((term, i) => {
            const selected = selectedName?.toLowerCase() === term.id
            return (
              <button
                key={term.id}
                type="button"
                title={term.name}
                aria-label={`Select name ${term.name}`}
                aria-pressed={selected}
                className={cn(
                  "absolute top-0 bottom-0 z-10 flex items-end justify-center px-0.5 pb-1.5",
                  selected
                    ? "font-bold text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                style={{
                  left: i * cellW,
                  width: cellW,
                }}
                onClick={() => onSelectName(term.name)}
              >
                <span
                  className="max-h-full overflow-hidden text-ellipsis font-mono leading-none"
                  style={{
                    fontSize: labelFontSize,
                    writingMode: "vertical-rl",
                    textOrientation: "mixed",
                  }}
                >
                  {term.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={gridScrollRef}
        className="flex-1 min-h-0 overflow-auto border-t border-border/40 px-1"
        onScroll={onGridScroll}
        tabIndex={0}
        role="grid"
        aria-label="Gene coverage overview"
        aria-describedby={summaryId}
        onKeyDown={onKeyDown}
        onMouseLeave={() => onHover(null)}
      >
        <canvas
          ref={canvasRef}
          className="block cursor-crosshair"
          onPointerMove={onCanvasMove}
          onClick={onCanvasClick}
          title={
            tip
              ? cellTooltip(tip.label, tip.term.name, tip.matched, tip.n)
              : undefined
          }
        />
      </div>

      <div
        className="shrink-0 border-t border-border/60 bg-muted/20 px-3 py-1.5 flex flex-wrap items-center gap-2"
        style={{ height: GENES_LEGEND_H }}
      >
        <div
          className="flex items-center gap-1.5"
          aria-hidden
          title="Fraction of annotations under a taxon that match the gene"
        >
          <span className="text-[10px] text-muted-foreground">0%</span>
          <div className="flex h-1.5 w-20 rounded overflow-hidden">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="flex-1 h-full"
                style={{ backgroundColor: interpolateCividis(i / 7) }}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">100%</span>
        </div>
        {tip && (
          <p className="text-[10px] text-muted-foreground truncate flex-1 min-w-0">
            {cellTooltip(tip.label, tip.term.name, tip.matched, tip.n)}
          </p>
        )}
        {showScrollHint && (
          <span className="text-[10px] text-muted-foreground">scrolled →</span>
        )}
      </div>
    </div>
  )
}
