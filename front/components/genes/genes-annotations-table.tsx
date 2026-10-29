"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { Loader2, Pin } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import { useCompareStore } from "@/lib/genes/compare-store"
import { annotationsGeneColumnWidth } from "@/lib/genes/heatmap"
import type { PipelineRow } from "@/lib/genes/keep"
import { formatReleaseDate, sourceColor } from "@/lib/genes/hits"
import {
  isPinned,
  resolveAndTogglePin,
} from "@/lib/genes/pin-gene"
import type { DistributionSelection } from "@/lib/genes/selection"
import {
  useVariableVirtualWindow,
  useVirtualColumns,
} from "@/lib/genes/virtual"
import { cn } from "@/lib/utils"

const ROW_H = 40
const HEADER_H = 40
const CHECK_W = 36
const PIN_W = 40
const SPECIES_W = 148
const ASSEMBLY_W = 120
const RELEASE_W = 88
const COV_W = 56

interface GenesAnnotationsTableProps {
  rows: PipelineRow[]
  geneColumns: ResolvedTerm[]
  termCount: number
  selection: DistributionSelection
  openAnnotationId: string | null
  subjectGene: string | null
  onToggleRow: (
    annotationId: string,
    opts: { toggle: boolean; shift: boolean },
  ) => void
  onToggleCol: (
    geneName: string,
    opts: { toggle: boolean; shift: boolean },
  ) => void
  onToggleSelectAll: () => void
  onOpenRow: (annotationId: string, species: string, source: number) => void
  onOpenGeneCell: (
    annotationId: string,
    species: string,
    source: number,
    geneName: string,
    anchorEl: HTMLElement,
  ) => void
  onNavigateDrawer: (direction: -1 | 1) => void
  onClearSelection: () => void
  /** `${annotationId}\0${geneName}` of the open gene peek, if any. */
  peekKey?: string | null
  onScrollClosePeek?: () => void
  className?: string
}

function modOpts(e: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): { toggle: boolean; shift: boolean } {
  return {
    toggle: e.metaKey || e.ctrlKey,
    shift: e.shiftKey && !(e.metaKey || e.ctrlKey),
  }
}

function GenePinButton({
  annotationId,
  species,
  source,
  geneName,
}: {
  annotationId: string
  species: string
  source: number
  geneName: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pins = useCompareStore((s) => s.pins)
  const pinned = isPinned(pins, annotationId, geneName)

  const onClick = async (e: ReactMouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await resolveAndTogglePin({
      annotationId,
      species,
      source,
      geneName,
    })
    if (result.status === "error") setError(result.message)
    setBusy(false)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-8 w-8",
        pinned ? "text-primary" : "text-muted-foreground",
      )}
      disabled={busy}
      aria-label={
        pinned
          ? `Unpin ${geneName}`
          : `Pin ${geneName} for transcript compare`
      }
      aria-pressed={pinned}
      title={
        error
          ? error
          : pinned
            ? "Unpin"
            : "Pin for transcript compare"
      }
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
      )}
    </Button>
  )
}

export function GenesAnnotationsTable({
  rows,
  geneColumns,
  termCount,
  selection,
  openAnnotationId,
  subjectGene,
  onToggleRow,
  onToggleCol,
  onToggleSelectAll,
  onOpenRow,
  onOpenGeneCell,
  onNavigateDrawer,
  onClearSelection,
  peekKey = null,
  onScrollClosePeek,
  className,
}: GenesAnnotationsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScrollClosePeek) return
    const onScroll = () => onScrollClosePeek()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [onScrollClosePeek])
  const showPin = Boolean(subjectGene)
  const geneColW = annotationsGeneColumnWidth(geneColumns.length)
  const labelW =
    CHECK_W +
    (showPin ? PIN_W : 0) +
    SPECIES_W +
    ASSEMBLY_W +
    RELEASE_W +
    COV_W

  const getHeight = useCallback(() => ROW_H, [])

  const annotationRows = useMemo(
    () => rows.filter((r) => r.kind === "annotation"),
    [rows],
  )

  const win = useVariableVirtualWindow(
    scrollRef,
    annotationRows.length,
    getHeight,
    8,
  )
  const colWin = useVirtualColumns(
    scrollRef,
    geneColumns.length,
    geneColW,
    labelW,
    4,
  )

  const selectedRows = useMemo(() => {
    if (selection.kind !== "rows") return new Set<string>()
    return new Set(selection.rows)
  }, [selection])

  const selectedCols = useMemo(() => {
    if (selection.kind !== "cols") return new Set<string>()
    return new Set(selection.cols.map((n) => n.toLowerCase()))
  }, [selection])

  const annotationIds = useMemo(
    () =>
      annotationRows.map((r) =>
        r.kind === "annotation" ? r.item.row.annotationId : "",
      ),
    [annotationRows],
  )

  const allSelected =
    annotationIds.length > 0 &&
    annotationIds.every((id) => selectedRows.has(id))
  const someSelected =
    !allSelected && annotationIds.some((id) => selectedRows.has(id))

  const onHeaderClick = useCallback(
    (e: ReactMouseEvent, name: string) => {
      e.preventDefault()
      onToggleCol(name, modOpts(e))
    },
    [onToggleCol],
  )

  // Arrows while drawer open; Esc closes drawer (drawer owns Esc) or clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (openAnnotationId) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          onNavigateDrawer(1)
        } else if (e.key === "ArrowUp") {
          e.preventDefault()
          onNavigateDrawer(-1)
        }
        // Esc handled by GenesAnnotationDrawer
        return
      }
      if (e.key === "Escape" && selection.kind) {
        e.preventDefault()
        onClearSelection()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    openAnnotationId,
    onNavigateDrawer,
    onClearSelection,
    selection.kind,
  ])

  const onRowKeyDown = useCallback(
    (
      e: ReactKeyboardEvent,
      annotationId: string,
      species: string,
      source: number,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault()
        onOpenRow(annotationId, species, source)
      }
    },
    [onOpenRow],
  )

  if (!annotationRows.length) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        No annotations match
      </div>
    )
  }

  return (
    <div
      className={cn("relative min-h-0 flex-1", className)}
      role="grid"
      aria-multiselectable="true"
      aria-label="Annotations"
    >
      <div
        ref={scrollRef}
        className="h-full overflow-auto overscroll-contain [scrollbar-width:thin]"
      >
        <div
          className="relative"
          style={{
            height: win.totalHeight + HEADER_H,
            width: labelW + colWin.totalWidth,
            minWidth: "100%",
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card/95 text-[10px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur"
            style={{ height: HEADER_H }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 border-r border-border bg-card/95"
              style={{ width: labelW }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: CHECK_W }}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Select all filtered annotations"
                />
              </div>
              {showPin ? (
                <div
                  className="flex items-center justify-center"
                  style={{ width: PIN_W }}
                  aria-hidden
                />
              ) : null}
              <div className="flex items-center px-2" style={{ width: SPECIES_W }}>
                Organisms
              </div>
              <div className="flex items-center px-2" style={{ width: ASSEMBLY_W }}>
                Assembly
              </div>
              <div className="flex items-center px-2" style={{ width: RELEASE_W }}>
                Release
              </div>
              <div className="flex items-center px-2" style={{ width: COV_W }}>
                Cov
              </div>
            </div>
            <div
              className="relative flex"
              style={{
                width: colWin.totalWidth,
                paddingLeft: colWin.offsetX,
              }}
            >
              {colWin.visibleIndexes.map((ci) => {
                const col = geneColumns[ci]!
                const selected = selectedCols.has(col.id)
                return (
                  <button
                    key={col.id}
                    type="button"
                    title={col.name}
                    className={cn(
                      "flex shrink-0 items-center justify-center px-0.5 font-mono text-[11px] font-semibold normal-case tracking-normal",
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                    style={{ width: geneColW }}
                    onClick={(e) => onHeaderClick(e, col.name)}
                  >
                    <span className="block w-full truncate text-center">
                      {col.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ height: win.offsetY }} />

          {win.visibleIndexes.map((index) => {
            const row = annotationRows[index]!
            if (row.kind !== "annotation") return null
            const top = win.offsetForIndex(index)
            const { item } = row
            const ann = item.row
            const selected = selectedRows.has(ann.annotationId)
            const matchedSet = new Set(ann.matchedTerms)
            const isOpen = openAnnotationId === ann.annotationId

            return (
              <div
                key={ann.annotationId}
                role="row"
                tabIndex={0}
                data-ann-id={ann.annotationId}
                aria-selected={selected}
                className={cn(
                  "absolute left-0 flex w-full border-b border-border/40 text-xs outline-none hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring",
                  selected && "bg-primary/5",
                  isOpen && "bg-primary/10",
                )}
                style={{ top: top + HEADER_H, height: ROW_H }}
                onKeyDown={(e) =>
                  onRowKeyDown(
                    e,
                    ann.annotationId,
                    item.speciesLabel,
                    ann.source,
                  )
                }
              >
                <div
                  className="sticky left-0 z-[5] flex shrink-0 border-r border-border/40 bg-card"
                  style={{ width: labelW }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: CHECK_W }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleRow(ann.annotationId, {
                          toggle: true,
                          shift: e.shiftKey,
                        })
                      }}
                      onChange={() => {
                        /* selection updated in onClick */
                      }}
                      aria-label={`Select ${item.speciesLabel}`}
                    />
                  </div>
                  {showPin && subjectGene ? (
                    <div
                      className="flex items-center justify-center"
                      style={{ width: PIN_W }}
                    >
                      <GenePinButton
                        annotationId={ann.annotationId}
                        species={item.speciesLabel}
                        source={ann.source}
                        geneName={subjectGene}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center text-left"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("input,button"))
                        return
                      onOpenRow(
                        ann.annotationId,
                        item.speciesLabel,
                        ann.source,
                      )
                    }}
                  >
                    <span
                      className="flex min-w-0 items-center gap-1.5 truncate px-2 italic"
                      style={{ width: SPECIES_W }}
                      title={item.speciesLabel}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: sourceColor(ann.source) }}
                        aria-hidden
                      />
                      <span className="truncate">{item.speciesLabel}</span>
                    </span>
                    <span
                      className="truncate px-2 text-muted-foreground"
                      style={{ width: ASSEMBLY_W }}
                      title={ann.assemblyName ?? ann.annotationId}
                    >
                      {ann.assemblyName ?? ann.annotationId}
                    </span>
                    <span
                      className="truncate px-2 tabular-nums text-muted-foreground"
                      style={{ width: RELEASE_W }}
                    >
                      {formatReleaseDate(ann.releaseDate) ?? "—"}
                    </span>
                    <span
                      className="px-2 tabular-nums text-muted-foreground"
                      style={{ width: COV_W }}
                    >
                      {item.k}/{termCount}
                    </span>
                  </button>
                </div>
                <div
                  className="relative flex"
                  style={{
                    width: colWin.totalWidth,
                    paddingLeft: colWin.offsetX,
                  }}
                >
                  {colWin.visibleIndexes.map((ci) => {
                    const col = geneColumns[ci]!
                    const present = matchedSet.has(col.termIndex)
                    const colSel = selectedCols.has(col.id)
                    if (!present) {
                      return (
                        <div
                          key={col.id}
                          className={cn(
                            "flex shrink-0 items-center justify-center",
                            colSel && "bg-primary/5",
                          )}
                          style={{ width: geneColW }}
                          aria-label={`${col.name} absent`}
                        >
                          <span className="text-sm text-muted-foreground/40">
                            ○
                          </span>
                        </div>
                      )
                    }
                    const cellPeeked =
                      peekKey ===
                      `${ann.annotationId}\0${col.name.toLowerCase()}`
                    return (
                      <button
                        key={col.id}
                        type="button"
                        className={cn(
                          "flex shrink-0 items-center justify-center rounded-sm",
                          "text-sm text-primary hover:bg-primary/10",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          colSel && "bg-primary/5",
                          cellPeeked && "bg-primary/15 ring-1 ring-primary/40",
                        )}
                        style={{ width: geneColW }}
                        aria-label={`View ${col.name} details in ${item.speciesLabel}`}
                        aria-expanded={cellPeeked}
                        title={`${col.name} — view gene details`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenGeneCell(
                            ann.annotationId,
                            item.speciesLabel,
                            ann.source,
                            col.name,
                            e.currentTarget,
                          )
                        }}
                      >
                        ●
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
