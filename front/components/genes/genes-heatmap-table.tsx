"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { ChevronRight, Plus } from "lucide-react"

import {
  GenesRankSelect,
  type GenesRankOption,
} from "@/components/genes/genes-rank-select"
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
import { cn } from "@/lib/utils"

const INDENT_PX = 12
const TAXON_COL_W = 260
const ROW_H = 44
const TILE_H = 36
const GAP = 4
/** Floor so in-cell counts stay legible; wider matrices scroll instead of shrinking. */
const MIN_CELL_W = 44
const EMPTY_COUNTS: NodeNameCounts = { n: 0, byName: [] }

export type HeatmapNameKind = "active" | "excluded" | "empty"

export interface HeatmapNameColumn {
  name: string
  id: string
  count: number
  kind: HeatmapNameKind
}

interface GenesHeatmapTableProps {
  columns: HeatmapNameColumn[]
  /** Per-active-column counts; excluded/empty columns are padded as 0. */
  activeColumnCount: number
  rows: FlatHitTreeRow[]
  rowCounts: NodeNameCounts[]
  expanded: Set<string>
  selectedTaxon: string | null
  selectedName: string | null
  onToggleExpand: (id: string) => void
  onSelectTaxon: (id: string | null) => void
  onSelectName: (name: string | null) => void
  onSelectCell: (taxonId: string, name: string) => void
  onIncludeName: (id: string) => void
  remaining: number
  onLoadMore: () => void
  /** Total taxa in the tree (may exceed visible rows before load-more). */
  taxonTotal?: number
  viewRank: string | null
  rankOptions: GenesRankOption[]
  hideAutoRank?: boolean
  rankSelectDisabled?: boolean
  rankSelectDisabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  className?: string
}

interface TooltipState {
  x: number
  y: number
  primary: string
  secondary?: string
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
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

function useHeatmapTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null)

  const hide = useCallback(() => setTip(null), [])

  const showFromTarget = useCallback(
    (target: HTMLElement | null, clientX: number, clientY: number) => {
      if (!target) {
        setTip(null)
        return
      }
      const tipEl = target.closest("[data-tip-primary]") as HTMLElement | null
      if (!tipEl) {
        setTip(null)
        return
      }
      const primary = tipEl.dataset.tipPrimary
      if (!primary) {
        setTip(null)
        return
      }
      setTip({
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
      showFromTarget(e.target as HTMLElement, e.clientX, e.clientY)
    },
    [showFromTarget],
  )

  const onPointerLeave = useCallback(() => {
    hide()
  }, [hide])

  const onFocusCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const el = e.target as HTMLElement
      const rect = el.getBoundingClientRect()
      showFromTarget(el, rect.left + rect.width / 2, rect.top)
    },
    [showFromTarget],
  )

  const onBlurCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const next = e.relatedTarget as HTMLElement | null
      if (next?.closest?.("[data-tip-primary]")) return
      hide()
    },
    [hide],
  )

  const tooltipNode: ReactNode = tip ? (
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
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {tip.secondary}
        </div>
      ) : null}
    </div>
  ) : null

  return {
    tooltipNode,
    onPointerMove,
    onPointerLeave,
    onFocusCapture,
    onBlurCapture,
  }
}

interface ColumnHeaderProps {
  col: HeatmapNameColumn
  cellW: number
  headerH: number
  rotateHeaders: boolean
  selected: boolean
  scrolledY: boolean
  onSelectName: (name: string | null) => void
  onIncludeName: (id: string) => void
}

const ColumnHeader = memo(function ColumnHeader({
  col,
  cellW,
  headerH,
  rotateHeaders,
  selected,
  scrolledY,
  onSelectName,
  onIncludeName,
}: ColumnHeaderProps) {
  const tipPrimary =
    col.kind === "empty"
      ? `${col.name} · no hits`
      : col.kind === "excluded"
        ? `${col.name} · excluded from view · click to include`
        : `${col.name} · ${col.count.toLocaleString()} annotations`

  const label = (
    <span
      className={cn(
        "max-w-full font-mono text-[11px] font-semibold uppercase tracking-wide",
        rotateHeaders
          ? "[writing-mode:vertical-rl] rotate-180 truncate"
          : "truncate",
      )}
    >
      {col.name}
    </span>
  )

  return (
    <th
      scope="col"
      data-heatmap-col={col.id}
      data-tip-primary={tipPrimary}
      className={cn(
        "sticky top-0 z-20 bg-card/95 p-0 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        "shadow-[0_1px_0_0_var(--border)]",
        scrolledY && "shadow-[0_4px_8px_-4px_rgba(0,0,0,0.12)]",
        selected && col.kind === "active" && "bg-primary/10",
        col.kind === "empty" && "opacity-70",
        col.kind === "excluded" && "opacity-80",
      )}
      style={{
        width: cellW,
        minWidth: cellW,
        height: headerH,
        maxHeight: "7rem",
      }}
    >
      {col.kind === "empty" ? (
        <span
          className="flex h-full w-full flex-col items-center justify-end gap-0.5 px-1 pb-1.5 pt-2 text-muted-foreground"
          aria-label={`${col.name}, no hits`}
        >
          {label}
          <span className="text-[9px] font-normal normal-case tracking-normal opacity-70">
            —
          </span>
        </span>
      ) : (
        <button
          type="button"
          className={cn(
            "relative flex h-full w-full flex-col items-center justify-end gap-0.5 px-1 pb-1.5 pt-2",
            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected && col.kind === "active"
              ? "text-primary"
              : col.kind === "excluded"
                ? "text-muted-foreground"
                : "text-foreground",
          )}
          aria-pressed={col.kind === "active" ? selected : undefined}
          aria-label={
            col.kind === "excluded"
              ? `Include ${col.name}`
              : `Filter by ${col.name}, ${col.count.toLocaleString()} annotations`
          }
          onClick={() => {
            if (col.kind === "excluded") {
              onIncludeName(col.id)
              return
            }
            onSelectName(col.name)
          }}
        >
          {col.kind === "excluded" ? (
            <span className="mb-0.5 inline-flex items-center gap-0.5 rounded border border-dashed border-border px-1 py-0.5 text-[10px] text-muted-foreground">
              <Plus className="h-2.5 w-2.5" aria-hidden />
              {label}
            </span>
          ) : (
            label
          )}
          {selected && col.kind === "active" ? (
            <span
              className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
              aria-hidden
            />
          ) : null}
        </button>
      )}
    </th>
  )
})

interface TaxonCellProps {
  nodeId: string
  label: string
  rank: string | null
  depth: number
  n: number
  hasKids: boolean
  open: boolean
  selected: boolean
  scrolledX: boolean
  onToggleExpand: (id: string) => void
  onSelectTaxon: (id: string | null) => void
}

const TaxonCell = memo(function TaxonCell({
  nodeId,
  label,
  rank,
  depth,
  n,
  hasKids,
  open,
  selected,
  scrolledX,
  onToggleExpand,
  onSelectTaxon,
}: TaxonCellProps) {
  const tipPrimary = rank
    ? `${label} · ${rank}`
    : label

  return (
    <th
      scope="row"
      data-heatmap-taxon={nodeId}
      data-tip-primary={tipPrimary}
      className={cn(
        "sticky left-0 z-10 bg-card p-0 text-left font-normal",
        "group-hover/row:bg-muted/50",
        selected && "bg-primary/10 group-hover/row:bg-primary/15",
        scrolledX && "shadow-[4px_0_8px_-4px_rgba(0,0,0,0.12)]",
      )}
      style={{
        width: TAXON_COL_W,
        minWidth: TAXON_COL_W,
        height: ROW_H,
      }}
    >
      <div
        className={cn(
          "relative flex h-full min-w-0 items-center gap-1.5 pr-2",
          selected &&
            "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
        )}
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
        <button
          type="button"
          className={cn(
            "min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected && "text-foreground",
          )}
          aria-pressed={selected}
          onClick={() => onSelectTaxon(nodeId)}
        >
          <span className="block truncate text-sm font-semibold leading-tight">
            {label}
          </span>
          <span className="block truncate font-mono text-[11px] leading-tight text-muted-foreground">
            {nodeId}
          </span>
        </button>
        <span
          className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
          aria-label={`${n.toLocaleString()} annotations`}
        >
          {n.toLocaleString()}
        </span>
      </div>
    </th>
  )
})

interface HeatCellProps {
  nodeId: string
  taxonLabel: string
  col: HeatmapNameColumn
  k: number
  n: number
  cellW: number
  showCounts: boolean
  rowSelected: boolean
  colSelected: boolean
  cellSelected: boolean
}

const HeatCell = memo(function HeatCell({
  nodeId,
  taxonLabel,
  col,
  k,
  n,
  cellW,
  showCounts,
  rowSelected,
  colSelected,
  cellSelected,
}: HeatCellProps) {
  const isActive = col.kind === "active"
  const hasValue = isActive && n > 0 && k > 0
  const isZero = isActive && n > 0 && k <= 0
  const bg = hasValue ? cellBackground(k, n) : undefined
  const darkText = hasValue && cellTextIsDark(k, n)
  const pct = n > 0 ? Math.round((k / n) * 100) : 0

  const tipPrimary =
    col.kind === "empty"
      ? `${col.name} · no hits`
      : col.kind === "excluded"
        ? `${col.name} · excluded from view`
        : `${taxonLabel} / ${col.name}: ${k.toLocaleString()} annotations`

  const tipSecondary =
    isActive && n > 0
      ? `${k.toLocaleString()} of ${n.toLocaleString()} (${pct}%)`
      : undefined

  // Keep cellTooltip in the a11y string for a single full description.
  const ariaLabel = isActive
    ? cellTooltip(taxonLabel, col.name, k, n)
    : undefined

  const tileClass = cn(
    "mx-auto flex items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
    "transition-[transform,box-shadow] duration-150 motion-reduce:transition-none",
    hasValue &&
      "cursor-pointer hover:z-10 hover:scale-[1.04] hover:shadow-sm hover:ring-2 hover:ring-primary/50 motion-reduce:hover:scale-100",
    isZero &&
      "cursor-not-allowed bg-muted/40 text-muted-foreground/50 opacity-60",
    col.kind === "excluded" && "opacity-40",
    col.kind === "empty" && "bg-muted/20",
    hasValue &&
      (rowSelected || colSelected) &&
      !cellSelected &&
      "ring-1 ring-primary/25",
    cellSelected && "ring-2 ring-primary",
  )

  const tileStyle: CSSProperties = {
    width: Math.max(cellW - GAP * 2, 20),
    height: TILE_H,
    backgroundColor: bg,
  }

  return (
    <td
      data-node={hasValue ? nodeId : undefined}
      data-term={hasValue ? col.name : undefined}
      data-kind={col.kind}
      data-tip-primary={tipPrimary}
      data-tip-secondary={tipSecondary}
      className={cn(
        "p-0 text-center align-middle",
        hasValue && (rowSelected || colSelected) && "bg-primary/5",
      )}
      style={{ width: cellW, minWidth: cellW, height: ROW_H }}
    >
      {hasValue ? (
        <button
          type="button"
          tabIndex={0}
          className={cn(
            tileClass,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            darkText ? "text-foreground/90" : "text-white/95",
          )}
          style={tileStyle}
          aria-label={ariaLabel}
          aria-pressed={cellSelected}
          aria-current={cellSelected ? "true" : undefined}
        >
          {showCounts ? k.toLocaleString() : null}
        </button>
      ) : isZero ? (
        <span
          className={tileClass}
          style={tileStyle}
          aria-label={ariaLabel}
          aria-disabled="true"
          title="No annotations for this name in this clade"
        >
          {showCounts ? "0" : null}
        </span>
      ) : col.kind !== "active" ? (
        <span className={tileClass} style={tileStyle} aria-hidden />
      ) : null}
    </td>
  )
})

export function GenesHeatmapTable({
  columns,
  activeColumnCount,
  rows,
  rowCounts,
  expanded,
  selectedTaxon,
  selectedName,
  onToggleExpand,
  onSelectTaxon,
  onSelectName,
  onSelectCell,
  onIncludeName,
  remaining,
  onLoadMore,
  viewRank,
  rankOptions,
  hideAutoRank,
  rankSelectDisabled,
  rankSelectDisabledReason,
  onViewRankChange,
  className,
}: GenesHeatmapTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { scrolledX, scrolledY, canScrollX, onScroll } =
    useScrollShadows(scrollRef)
  const {
    tooltipNode,
    onPointerMove,
    onPointerLeave,
    onFocusCapture,
    onBlurCapture,
  } = useHeatmapTooltip()

  const layout = useMemo(
    () => heatmapColumnLayout(columns.length),
    [columns.length],
  )
  const cellW = Math.max(layout.cellW, MIN_CELL_W)
  const rotateHeaders = layout.rotateHeaders || columns.length > 6
  // Floor leaves room for title + rank select in the sticky corner cell.
  const headerH = useMemo(
    () =>
      Math.max(
        88,
        Math.min(
          112,
          heatmapHeaderHeight(
            rotateHeaders,
            columns.map((c) => c.name),
          ),
        ),
      ),
    [rotateHeaders, columns],
  )
  const showCellCounts = cellW >= HEATMAP_COUNT_MIN_CELL_W
  const tableWidth =
    TAXON_COL_W + columns.length * cellW + GAP * (columns.length + 1)
  const selectedNameId = selectedName?.toLowerCase() ?? null

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const behavior = prefersReducedMotion() ? "auto" : "smooth"
    if (selectedTaxon) {
      const row = root.querySelector(
        `[data-heatmap-taxon="${CSS.escape(selectedTaxon)}"]`,
      )
      row?.scrollIntoView({ block: "nearest", inline: "nearest", behavior })
    }
    if (selectedNameId) {
      const col = root.querySelector(
        `[data-heatmap-col="${CSS.escape(selectedNameId)}"]`,
      )
      col?.scrollIntoView({ block: "nearest", inline: "nearest", behavior })
    }
  }, [selectedTaxon, selectedNameId])

  const onBodyClick = useCallback(
    (e: MouseEvent<HTMLTableSectionElement>) => {
      const target = e.target as HTMLElement | null
      const cell = target?.closest("[data-node][data-term]") as HTMLElement | null
      if (!cell) return
      const nodeId = cell.dataset.node
      const termName = cell.dataset.term
      const kind = cell.dataset.kind
      if (!nodeId || !termName || kind !== "active") return
      onSelectCell(nodeId, termName)
    },
    [onSelectCell],
  )

  return (
    <div
      className={cn(
        "group/heatmap flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
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
          onScroll={onScroll}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          onFocusCapture={onFocusCapture}
          onBlurCapture={onBlurCapture}
        >
          <table
            className="border-separate text-xs"
            style={{
              tableLayout: "fixed",
              width: tableWidth,
              borderSpacing: GAP,
            }}
          >
            <caption className="sr-only">
              Heatmap of {activeColumnCount} gene names across {rows.length}{" "}
              taxa
              {remaining > 0
                ? ` (showing ${rows.length}; ${remaining} more available)`
                : ""}
              . Click a taxon label to filter by clade; click a gene name to
              filter by name; click a cell to filter by both.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={cn(
                    "sticky left-0 top-0 z-30 bg-card/95 px-2.5 py-2 text-left align-bottom font-normal backdrop-blur",
                    "shadow-[0_1px_0_0_var(--border),1px_0_0_0_var(--border)]",
                    scrolledY &&
                      "shadow-[0_4px_8px_-4px_rgba(0,0,0,0.12),1px_0_0_0_var(--border)]",
                    scrolledX &&
                      "shadow-[0_1px_0_0_var(--border),4px_0_8px_-4px_rgba(0,0,0,0.12)]",
                    scrolledX &&
                      scrolledY &&
                      "shadow-[0_4px_8px_-4px_rgba(0,0,0,0.12),4px_0_8px_-4px_rgba(0,0,0,0.12)]",
                  )}
                  style={{
                    width: TAXON_COL_W,
                    minWidth: TAXON_COL_W,
                    height: headerH,
                  }}
                >
                  <div className="flex h-full min-w-0 flex-col justify-end gap-2">
                    <GenesRankSelect
                      viewRank={viewRank}
                      options={rankOptions}
                      hideAuto={hideAutoRank}
                      disabled={rankSelectDisabled}
                      disabledReason={rankSelectDisabledReason}
                      onViewRankChange={onViewRankChange}
                      className="w-full min-w-0"
                      triggerClassName="h-7 rounded-md border-border bg-background px-2 text-xs font-normal shadow-none"
                    />
                  </div>
                </th>
                {columns.map((col) => (
                  <ColumnHeader
                    key={`${col.kind}-${col.id}`}
                    col={col}
                    cellW={cellW}
                    headerH={headerH}
                    rotateHeaders={rotateHeaders}
                    selected={selectedNameId === col.id}
                    scrolledY={scrolledY}
                    onSelectName={onSelectName}
                    onIncludeName={onIncludeName}
                  />
                ))}
              </tr>
            </thead>
            <tbody onClick={onBodyClick}>
              {rows.map((item, index) => {
                const { node, depth } = item
                const counts = rowCounts[index] ?? EMPTY_COUNTS
                const n = counts.n
                const hasKids = node.children.length > 0
                const open = expanded.has(node.id)
                const rowSelected = selectedTaxon === node.id
                return (
                  <tr
                    key={`${node.id}-${depth}`}
                    className="group/row"
                    style={{ height: ROW_H }}
                  >
                    <TaxonCell
                      nodeId={node.id}
                      label={node.label}
                      rank={node.rank}
                      depth={depth}
                      n={n}
                      hasKids={hasKids}
                      open={open}
                      selected={rowSelected}
                      scrolledX={scrolledX}
                      onToggleExpand={onToggleExpand}
                      onSelectTaxon={onSelectTaxon}
                    />
                    {columns.map((col, ci) => {
                      const activeIdx = ci < activeColumnCount ? ci : -1
                      const k =
                        activeIdx >= 0 ? (counts.byName[activeIdx] ?? 0) : 0
                      const colSelected =
                        col.kind === "active" && selectedNameId === col.id
                      const cellSelected =
                        rowSelected &&
                        colSelected &&
                        col.kind === "active"
                      return (
                        <HeatCell
                          key={`${col.kind}-${col.id}`}
                          nodeId={node.id}
                          taxonLabel={node.label}
                          col={col}
                          k={k}
                          n={n}
                          cellW={cellW}
                          showCounts={showCellCounts}
                          rowSelected={rowSelected}
                          colSelected={colSelected}
                          cellSelected={cellSelected}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
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

      {tooltipNode}
    </div>
  )
}
