/** Homogeneous distribution selection kinds. */
export type SelectionKind = "rows" | "cols" | "cells"

export interface SelectionCell {
  taxid: string
  gene: string
}

export interface DistributionSelection {
  kind: SelectionKind | null
  /** Selected taxon node ids (row headers). */
  rows: string[]
  /** Selected gene names (display form). */
  cols: string[]
  /** Selected cells as taxid×gene pairs. */
  cells: SelectionCell[]
}

export const EMPTY_SELECTION: DistributionSelection = {
  kind: null,
  rows: [],
  cols: [],
  cells: [],
}

export type SelectionAction =
  | { type: "clear" }
  | {
      type: "click-row"
      id: string
      mod: "replace" | "toggle"
      /** Visible row ids in display order (for shift range). */
      visibleRows: string[]
      shiftAnchor?: string | null
    }
  | {
      type: "click-col"
      name: string
      mod: "replace" | "toggle"
      visibleCols: string[]
      shiftAnchor?: string | null
    }
  | {
      type: "click-cell"
      taxid: string
      gene: string
      mod: "replace" | "toggle"
      /** Visible row×col order for shift rectangle. */
      visibleRows: string[]
      visibleCols: string[]
      shiftAnchor?: SelectionCell | null
    }
  | { type: "prune"; rowIds: Set<string>; colNames: Set<string> }
  /** Replace row selection with the given ids (one store update). */
  | { type: "set-rows"; ids: string[] }
  /**
   * If every id is already selected as rows, clear; otherwise select all ids.
   * Used for select-all / group-select without O(n) toggles.
   */
  | { type: "toggle-all-rows"; ids: string[] }

function normalizeGene(name: string): string {
  return name.trim()
}

function cellKey(c: SelectionCell): string {
  return `${c.taxid}\0${c.gene.toLowerCase()}`
}

function rangeInclusive(
  order: string[],
  a: string,
  b: string,
  keyFn: (s: string) => string = (s) => s,
): string[] {
  const ka = keyFn(a)
  const kb = keyFn(b)
  const ia = order.findIndex((x) => keyFn(x) === ka)
  const ib = order.findIndex((x) => keyFn(x) === kb)
  if (ia < 0 || ib < 0) return [a]
  const lo = Math.min(ia, ib)
  const hi = Math.max(ia, ib)
  return order.slice(lo, hi + 1)
}

function rectangleCells(
  visibleRows: string[],
  visibleCols: string[],
  a: SelectionCell,
  b: SelectionCell,
): SelectionCell[] {
  const rows = rangeInclusive(visibleRows, a.taxid, b.taxid)
  const cols = rangeInclusive(
    visibleCols,
    a.gene,
    b.gene,
    (s) => s.toLowerCase(),
  )
  const out: SelectionCell[] = []
  for (const taxid of rows) {
    for (const gene of cols) {
      out.push({ taxid, gene })
    }
  }
  return out
}

function withKind(
  kind: SelectionKind,
  patch: Partial<DistributionSelection>,
): DistributionSelection {
  return {
    kind,
    rows: patch.rows ?? [],
    cols: patch.cols ?? [],
    cells: patch.cells ?? [],
  }
}

/**
 * Pure reducer for heatmap multi-select.
 * Click replaces; Ctrl/Cmd toggles; Shift expands a range/rectangle over
 * the visible row×column order; Esc / clear empties.
 */
export function reduceSelection(
  state: DistributionSelection,
  action: SelectionAction,
): DistributionSelection {
  switch (action.type) {
    case "clear":
      return EMPTY_SELECTION

    case "prune": {
      if (!state.kind) return state
      if (state.kind === "rows") {
        const rows = state.rows.filter((id) => action.rowIds.has(id))
        return rows.length ? withKind("rows", { rows }) : EMPTY_SELECTION
      }
      if (state.kind === "cols") {
        const lower = new Set(
          [...action.colNames].map((n) => n.toLowerCase()),
        )
        const cols = state.cols.filter((n) =>
          lower.has(n.toLowerCase()),
        )
        return cols.length ? withKind("cols", { cols }) : EMPTY_SELECTION
      }
      const cells = state.cells.filter(
        (c) =>
          action.rowIds.has(c.taxid) &&
          action.colNames.has(c.gene.toLowerCase()),
      )
      return cells.length ? withKind("cells", { cells }) : EMPTY_SELECTION
    }

    case "click-row": {
      if (action.mod === "toggle" && state.kind === "rows") {
        const has = state.rows.includes(action.id)
        const rows = has
          ? state.rows.filter((id) => id !== action.id)
          : [...state.rows, action.id]
        return rows.length ? withKind("rows", { rows }) : EMPTY_SELECTION
      }
      if (
        action.shiftAnchor &&
        state.kind === "rows" &&
        action.visibleRows.length
      ) {
        const rows = rangeInclusive(
          action.visibleRows,
          action.shiftAnchor,
          action.id,
        )
        return withKind("rows", { rows })
      }
      return withKind("rows", { rows: [action.id] })
    }

    case "click-col": {
      const name = normalizeGene(action.name)
      if (action.mod === "toggle" && state.kind === "cols") {
        const has = state.cols.some(
          (c) => c.toLowerCase() === name.toLowerCase(),
        )
        const cols = has
          ? state.cols.filter(
              (c) => c.toLowerCase() !== name.toLowerCase(),
            )
          : [...state.cols, name]
        return cols.length ? withKind("cols", { cols }) : EMPTY_SELECTION
      }
      if (
        action.shiftAnchor &&
        state.kind === "cols" &&
        action.visibleCols.length
      ) {
        const cols = rangeInclusive(
          action.visibleCols,
          action.shiftAnchor,
          name,
          (s) => s.toLowerCase(),
        )
        return withKind("cols", { cols })
      }
      return withKind("cols", { cols: [name] })
    }

    case "click-cell": {
      const cell: SelectionCell = {
        taxid: action.taxid,
        gene: normalizeGene(action.gene),
      }
      if (action.mod === "toggle" && state.kind === "cells") {
        const key = cellKey(cell)
        const has = state.cells.some((c) => cellKey(c) === key)
        const cells = has
          ? state.cells.filter((c) => cellKey(c) !== key)
          : [...state.cells, cell]
        return cells.length ? withKind("cells", { cells }) : EMPTY_SELECTION
      }
      if (
        action.shiftAnchor &&
        state.kind === "cells" &&
        action.visibleRows.length &&
        action.visibleCols.length
      ) {
        const cells = rectangleCells(
          action.visibleRows,
          action.visibleCols,
          action.shiftAnchor,
          cell,
        )
        return withKind("cells", { cells })
      }
      return withKind("cells", { cells: [cell] })
    }

    case "set-rows": {
      const ids = action.ids.filter(Boolean)
      return ids.length ? withKind("rows", { rows: [...ids] }) : EMPTY_SELECTION
    }

    case "toggle-all-rows": {
      const ids = action.ids.filter(Boolean)
      if (!ids.length) return EMPTY_SELECTION
      const allOn =
        state.kind === "rows" &&
        ids.length > 0 &&
        ids.every((id) => state.rows.includes(id))
      if (allOn) return EMPTY_SELECTION
      return withKind("rows", { rows: [...ids] })
    }

    default:
      return state
  }
}

export function selectionIsEmpty(sel: DistributionSelection): boolean {
  return sel.kind == null
}

export function selectionSize(sel: DistributionSelection): number {
  if (sel.kind === "rows") return sel.rows.length
  if (sel.kind === "cols") return sel.cols.length
  if (sel.kind === "cells") return sel.cells.length
  return 0
}
