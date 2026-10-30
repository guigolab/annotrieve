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
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pin } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import type {
  AnnotationsSort,
  AnnotationsSortDir,
} from "@/lib/genes/annotations-controls"
import {
  MAX_PINS,
  useCompareStore,
  type PinMode,
} from "@/lib/genes/compare-store"
import { annotationsGeneColumnWidth } from "@/lib/genes/heatmap"
import type { PipelineRow } from "@/lib/genes/keep"
import { formatReleaseDate, sourceColor, sourceLabel } from "@/lib/genes/hits"
import { pinKey, resolveAndPinMany } from "@/lib/genes/pin-gene"
import type { DistributionSelection } from "@/lib/genes/selection"
import {
  useVariableVirtualWindow,
  useVirtualColumns,
} from "@/lib/genes/virtual"
import { cn } from "@/lib/utils"

const ROW_H = 44
const HEADER_H = 40
const CHECK_W = 32
const PIN_W = 32
const SPECIES_W = 136
const ASSEMBLY_W = 84
const RELEASE_W = 88
const COV_W = 72

interface GenesAnnotationsTableProps {
  rows: PipelineRow[]
  geneColumns: ResolvedTerm[]
  termCount: number
  selection: DistributionSelection
  openAnnotationId: string | null
  subjectGene: string | null
  pinMode: PinMode
  pinnedKeys: Set<string>
  pinCountByAnnotation: Map<string, number>
  pendingPinKeys: Set<string>
  sort: AnnotationsSort | null
  sortDir: AnnotationsSortDir
  onSortColumnClick: (key: AnnotationsSort) => void
  onPinGeneCell: (
    annotationId: string,
    species: string,
    source: number,
    geneName: string,
  ) => void
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
  /** Extra scroll padding (px) so the last row clears the footer stack. */
  bottomInset?: number
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
  pinned,
  busy,
  geneName,
  onToggle,
}: {
  pinned: boolean
  busy: boolean
  geneName: string
  onToggle: () => void
}) {
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
      title={pinned ? "Unpin" : "Pin for transcript compare"}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (!busy) onToggle()
      }}
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
  pinMode,
  pinnedKeys,
  pinCountByAnnotation,
  pendingPinKeys,
  sort,
  sortDir,
  onSortColumnClick,
  onPinGeneCell,
  onToggleRow,
  onToggleCol,
  onToggleSelectAll,
  onOpenRow,
  onOpenGeneCell,
  onNavigateDrawer,
  onClearSelection,
  peekKey = null,
  onScrollClosePeek,
  bottomInset = 0,
  className,
}: GenesAnnotationsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shiftKeyRef = useRef(false)
  const [headerPinBusy, setHeaderPinBusy] = useState(false)
  const pinsLength = useCompareStore((s) => s.pins.length)
  const setPins = useCompareStore((s) => s.setPins)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onScrollClosePeek) return
    const onScroll = () => onScrollClosePeek()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [onScrollClosePeek])

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      shiftKeyRef.current = e.shiftKey
    }
    const onKey = (e: KeyboardEvent) => {
      shiftKeyRef.current = e.shiftKey
    }
    window.addEventListener("pointerdown", onPointer, true)
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("pointerdown", onPointer, true)
      window.removeEventListener("keydown", onKey, true)
    }
  }, [])
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

  const selectedRows = useMemo(
    () => new Set(selection.rows),
    [selection.rows],
  )

  const selectedCols = useMemo(
    () => new Set(selection.cols.map((n) => n.toLowerCase())),
    [selection.cols],
  )

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

  const subjectPinTargets = useMemo(() => {
    if (!subjectGene) return []
    return annotationRows
      .filter((r) => r.kind === "annotation")
      .map((r) => {
        if (r.kind !== "annotation") return null
        return {
          annotationId: r.item.row.annotationId,
          species: r.item.speciesLabel,
          source: r.item.row.source,
          geneNames: [subjectGene],
        }
      })
      .filter((t): t is NonNullable<typeof t> => t != null)
  }, [annotationRows, subjectGene])

  const allSubjectPinned =
    Boolean(subjectGene) &&
    subjectPinTargets.length > 0 &&
    subjectPinTargets.every((t) =>
      pinnedKeys.has(pinKey(t.annotationId, subjectGene!)),
    )

  const onHeaderPinAll = useCallback(async () => {
    if (!subjectGene || headerPinBusy || !subjectPinTargets.length) return
    setHeaderPinBusy(true)
    try {
      if (allSubjectPinned) {
        const annIds = new Set(
          subjectPinTargets.map((t) => t.annotationId),
        )
        const needle = subjectGene.trim().toLowerCase()
        const { pins } = useCompareStore.getState()
        setPins(
          pins.filter((p) => {
            if (!annIds.has(p.annotationId)) return true
            if (p.geneName.trim().toLowerCase() === needle) return false
            return !p.queryNames.some((n) => n === needle)
          }),
        )
        return
      }
      const room = Math.max(0, MAX_PINS - pinsLength)
      const targets = subjectPinTargets
        .filter((t) => !pinnedKeys.has(pinKey(t.annotationId, subjectGene)))
        .slice(0, room)
      if (!targets.length) {
        toast.error(`Pin limit reached (${MAX_PINS})`)
        return
      }
      const result = await resolveAndPinMany(targets)
      if (result.truncated) {
        toast.message(`Pinned ${result.pinned}; pin limit is ${MAX_PINS}`)
      }
    } finally {
      setHeaderPinBusy(false)
    }
  }, [
    subjectGene,
    headerPinBusy,
    subjectPinTargets,
    allSubjectPinned,
    setPins,
    pinsLength,
    pinnedKeys,
  ])

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
      if (
        e.key === "Escape" &&
        (selection.rows.length || selection.cols.length)
      ) {
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
    selection,
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
            height: win.totalHeight + HEADER_H + Math.max(0, bottomInset),
            width: labelW + colWin.totalWidth,
            minWidth: "100%",
          }}
        >
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card text-xs font-medium text-muted-foreground"
            style={{ height: HEADER_H }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 border-r border-border bg-card"
              style={{ width: labelW }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: CHECK_W }}
              >
                <Checkbox
                  checked={
                    allSelected ? true : someSelected ? "indeterminate" : false
                  }
                  onCheckedChange={() => onToggleSelectAll()}
                  aria-label="Select all filtered annotations"
                />
              </div>
              {showPin && subjectGene ? (
                <div
                  className="flex items-center justify-center"
                  style={{ width: PIN_W }}
                >
                  <GenePinButton
                    pinned={allSubjectPinned}
                    busy={headerPinBusy}
                    geneName={subjectGene}
                    onToggle={() => {
                      void onHeaderPinAll()
                    }}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 overflow-hidden px-2 text-left hover:text-foreground"
                style={{ width: SPECIES_W }}
                aria-sort={
                  sort === "species"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => onSortColumnClick("species")}
              >
                <span className="truncate">Organisms</span>
                {sort === "species" ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                )}
              </button>
              <div className="flex items-center px-2" style={{ width: ASSEMBLY_W }}>
                Assembly
              </div>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 overflow-hidden px-2 text-left hover:text-foreground"
                style={{ width: RELEASE_W }}
                aria-sort={
                  sort === "release"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => onSortColumnClick("release")}
              >
                <span className="truncate">Release</span>
                {sort === "release" ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                )}
              </button>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 overflow-hidden px-2 text-left hover:text-foreground"
                style={{ width: COV_W }}
                aria-sort={
                  sort === "coverage"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                onClick={() => onSortColumnClick("coverage")}
              >
                <span className="truncate">Genes</span>
                {sort === "coverage" ? (
                  sortDir === "asc" ? (
                    <ArrowUp className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  ) : (
                    <ArrowDown className="h-3 w-3 shrink-0 text-foreground" aria-hidden />
                  )
                ) : (
                  <ArrowUpDown className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                )}
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
                const selected = selectedCols.has(col.id)
                return (
                  <button
                    key={col.id}
                    type="button"
                    title={col.name}
                    className={cn(
                      "flex shrink-0 items-center justify-center px-0.5 text-xs font-medium",
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
            const rowPinCount = pinCountByAnnotation.get(ann.annotationId) ?? 0
            const rowPinned = rowPinCount > 0

            return (
              <div
                key={ann.annotationId}
                role="row"
                tabIndex={0}
                data-ann-id={ann.annotationId}
                aria-selected={selected}
                className={cn(
                  "absolute left-0 flex w-full border-b border-border/50 text-xs outline-none hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring",
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
                {rowPinned ? (
                  <span
                    className="absolute bottom-0 left-0 top-0 z-10 w-0.5 bg-primary"
                    aria-hidden
                  />
                ) : null}
                <div
                  className="sticky left-0 z-[5] flex shrink-0 border-r border-border/50 bg-card"
                  style={{ width: labelW }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: CHECK_W }}
                  >
                    <Checkbox
                      checked={selected}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={() => {
                        onToggleRow(ann.annotationId, {
                          toggle: true,
                          shift: shiftKeyRef.current,
                        })
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
                        pinned={pinnedKeys.has(
                          pinKey(ann.annotationId, subjectGene),
                        )}
                        busy={pendingPinKeys.has(
                          pinKey(ann.annotationId, subjectGene),
                        )}
                        geneName={subjectGene}
                        onToggle={() =>
                          onPinGeneCell(
                            ann.annotationId,
                            item.speciesLabel,
                            ann.source,
                            subjectGene,
                          )
                        }
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
                        title={sourceLabel(ann.source)}
                        aria-label={sourceLabel(ann.source)}
                      />
                      <span className="truncate">{item.speciesLabel}</span>
                      {rowPinned ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 tabular-nums text-[10px] font-medium not-italic text-primary"
                          title={`${rowPinCount} pinned`}
                        >
                          <Pin className="h-2.5 w-2.5 fill-current" aria-hidden />
                          {rowPinCount}
                        </span>
                      ) : null}
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
                          <span
                            className="block h-px w-3 rounded-full bg-muted-foreground/30"
                            aria-hidden
                          />
                        </div>
                      )
                    }
                    const cellKey = pinKey(ann.annotationId, col.name)
                    const cellPinned = pinnedKeys.has(cellKey)
                    const cellPending = pendingPinKeys.has(cellKey)
                    const cellPeeked =
                      peekKey ===
                      `${ann.annotationId}\0${col.name.toLowerCase()}`
                    const pinLabel = cellPinned
                      ? `Unpin ${col.name} in ${item.speciesLabel}`
                      : `Pin ${col.name} in ${item.speciesLabel}`
                    return (
                      <button
                        key={col.id}
                        type="button"
                        className={cn(
                          "group flex shrink-0 items-center justify-center rounded-sm",
                          "hover:bg-primary/10",
                          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                          colSel && "bg-primary/5",
                          cellPeeked && "bg-primary/15 ring-1 ring-primary/40",
                          cellPinned && "bg-primary/10",
                        )}
                        style={{ width: geneColW }}
                        aria-label={
                          pinMode === "pin"
                            ? pinLabel
                            : `View ${col.name} details in ${item.speciesLabel}`
                        }
                        aria-pressed={
                          pinMode === "pin" ? cellPinned : undefined
                        }
                        aria-expanded={
                          pinMode === "inspect" ? cellPeeked : undefined
                        }
                        title={
                          pinMode === "pin"
                            ? pinLabel
                            : `${col.name} — view gene details`
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          if (pinMode === "pin") {
                            onPinGeneCell(
                              ann.annotationId,
                              item.speciesLabel,
                              ann.source,
                              col.name,
                            )
                            return
                          }
                          onOpenGeneCell(
                            ann.annotationId,
                            item.speciesLabel,
                            ann.source,
                            col.name,
                            e.currentTarget,
                          )
                        }}
                      >
                        {cellPending ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin text-primary"
                            aria-hidden
                          />
                        ) : cellPinned ? (
                          <Pin
                            className="h-3.5 w-3.5 fill-current text-primary"
                            aria-hidden
                          />
                        ) : pinMode === "pin" ? (
                          <>
                            <span
                              className="block h-2.5 w-2.5 rounded-full bg-primary group-hover:hidden"
                              aria-hidden
                            />
                            <Pin
                              className="hidden h-3.5 w-3.5 text-primary group-hover:block"
                              aria-hidden
                            />
                          </>
                        ) : (
                          <span
                            className="block h-2.5 w-2.5 rounded-full bg-primary"
                            aria-hidden
                          />
                        )}
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
