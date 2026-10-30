/**
 * Row/col multi-select for Annotations (and shared helpers).
 * Overview heatmap is read-only and does not use this model.
 */
export interface DistributionSelection {
  /** Selected taxon / annotation row ids. */
  rows: string[]
  /** Selected gene names (display form). */
  cols: string[]
}

export const EMPTY_SELECTION: DistributionSelection = {
  rows: [],
  cols: [],
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

function geneKey(name: string): string {
  return name.toLowerCase()
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

function finalize(sel: DistributionSelection): DistributionSelection {
  if (selectionIsEmpty(sel)) return EMPTY_SELECTION
  return sel
}

function toggleRow(state: DistributionSelection, id: string): DistributionSelection {
  const has = state.rows.includes(id)
  if (has) {
    return finalize({
      ...state,
      rows: state.rows.filter((r) => r !== id),
    })
  }
  return finalize({
    ...state,
    rows: [...state.rows, id],
  })
}

function toggleCol(
  state: DistributionSelection,
  name: string,
): DistributionSelection {
  const g = geneKey(name)
  const has = state.cols.some((c) => c.toLowerCase() === g)
  if (has) {
    return finalize({
      ...state,
      cols: state.cols.filter((c) => c.toLowerCase() !== g),
    })
  }
  return finalize({
    ...state,
    cols: [...state.cols, normalizeGene(name)],
  })
}

/**
 * Pure reducer for Annotations multi-select.
 * Plain click toggles; Shift expands a range; Esc / clear empties.
 * `mod: "replace"` is treated as toggle for compatibility.
 */
export function reduceSelection(
  state: DistributionSelection,
  action: SelectionAction,
): DistributionSelection {
  switch (action.type) {
    case "clear":
      return EMPTY_SELECTION

    case "click-row": {
      if (
        action.shiftAnchor &&
        action.visibleRows.length &&
        state.rows.includes(action.shiftAnchor)
      ) {
        const range = rangeInclusive(
          action.visibleRows,
          action.shiftAnchor,
          action.id,
        )
        let next = state
        for (const id of range) {
          if (!next.rows.includes(id)) next = toggleRow(next, id)
        }
        return next
      }
      return toggleRow(state, action.id)
    }

    case "click-col": {
      const name = normalizeGene(action.name)
      if (
        action.shiftAnchor &&
        action.visibleCols.length &&
        state.cols.some(
          (c) => c.toLowerCase() === action.shiftAnchor!.toLowerCase(),
        )
      ) {
        const range = rangeInclusive(
          action.visibleCols,
          action.shiftAnchor,
          name,
          (s) => s.toLowerCase(),
        )
        let next = state
        for (const col of range) {
          if (!next.cols.some((c) => c.toLowerCase() === col.toLowerCase())) {
            next = toggleCol(next, col)
          }
        }
        return next
      }
      return toggleCol(state, name)
    }

    case "set-rows": {
      const ids = action.ids.filter(Boolean)
      return finalize({
        ...state,
        rows: ids.length ? [...ids] : [],
      })
    }

    case "toggle-all-rows": {
      const ids = action.ids.filter(Boolean)
      if (!ids.length) return state
      const allOn =
        ids.length > 0 && ids.every((id) => state.rows.includes(id))
      if (allOn) {
        const drop = new Set(ids)
        return finalize({
          ...state,
          rows: state.rows.filter((id) => !drop.has(id)),
        })
      }
      const merged = [...new Set([...state.rows, ...ids])]
      return finalize({
        ...state,
        rows: merged,
      })
    }

    default:
      return state
  }
}

export function selectionIsEmpty(sel: DistributionSelection): boolean {
  return sel.rows.length === 0 && sel.cols.length === 0
}

/** Total selected items for simple badges (rows + cols). */
export function selectionSize(sel: DistributionSelection): number {
  return sel.rows.length + sel.cols.length
}

export function selectionHasOnlyRows(sel: DistributionSelection): boolean {
  return sel.rows.length > 0 && sel.cols.length === 0
}

export function selectionHasOnlyCols(sel: DistributionSelection): boolean {
  return sel.cols.length > 0 && sel.rows.length === 0
}

/** Short label for the floating selection bar. */
export function selectionSummaryLabel(
  sel: DistributionSelection,
  opts?: { rowsAreAnnotations?: boolean },
): string {
  const parts: string[] = []
  if (sel.rows.length) {
    const n = sel.rows.length
    const unit = opts?.rowsAreAnnotations
      ? n === 1
        ? "annotation"
        : "annotations"
      : n === 1
        ? "clade"
        : "clades"
    parts.push(`${n.toLocaleString()} ${unit}`)
  }
  if (sel.cols.length) {
    const n = sel.cols.length
    parts.push(`${n.toLocaleString()} ${n === 1 ? "gene" : "genes"}`)
  }
  if (!parts.length) return "Nothing selected"
  return `${parts.join(" · ")} selected`
}
