import type { HitKey } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"
import { annotationCountsByName } from "@/lib/genes/prefix"
import type { HitTreeNode } from "@/lib/genes/tree"

export type HeatmapColumnOrder = "prevalence" | "typed"

export interface HeatmapColumn {
  name: string
  /** Lowercased id for lookups. */
  id: string
  /** Annotation prevalence in the current filtered scope. */
  prevalence: number
}

export interface NodeNameCounts {
  /** Total annotations under this node (descendant-inclusive). */
  n: number
  /** Per-column annotation counts (same order as columns). */
  byName: number[]
}

const SMALL_N_THRESHOLD = 3

/** Colourblind-safe cividis-like ramp (0 → 1), sRGB 0–255. */
const CIVIDIS: [number, number, number][] = [
  [0, 32, 77],
  [30, 62, 110],
  [70, 90, 120],
  [110, 115, 115],
  [150, 140, 95],
  [190, 170, 70],
  [230, 205, 50],
  [253, 231, 37],
]

export function interpolateCividis(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  const scaled = x * (CIVIDIS.length - 1)
  const i = Math.floor(scaled)
  const f = scaled - i
  const a = CIVIDIS[i] ?? CIVIDIS[0]
  const b = CIVIDIS[Math.min(i + 1, CIVIDIS.length - 1)] ?? a
  const r = Math.round(a[0] + (b[0] - a[0]) * f)
  const g = Math.round(a[1] + (b[1] - a[1]) * f)
  const bl = Math.round(a[2] + (b[2] - a[2]) * f)
  return `rgb(${r},${g},${bl})`
}

export function cellAlpha(n: number): number {
  return n < SMALL_N_THRESHOLD ? 0.35 : 1
}

export function cellFraction(matched: number, n: number): number {
  if (n <= 0) return 0
  return matched / n
}

export function cellTooltip(
  taxonLabel: string,
  geneName: string,
  matched: number,
  n: number,
): string {
  const pct = n > 0 ? Math.round((matched / n) * 100) : 0
  return `${taxonLabel} · ${geneName} · ${matched.toLocaleString()} of ${n.toLocaleString()} annotations (${pct}%)`
}

/**
 * Order gene-name columns by prevalence (desc) or typed order.
 */
export function orderHeatmapColumns(
  names: string[],
  rows: DecodedHitRow[],
  keys: HitKey[],
  order: HeatmapColumnOrder,
): HeatmapColumn[] {
  const counts = annotationCountsByName(rows, keys)
  const cols: HeatmapColumn[] = names.map((name) => ({
    name,
    id: name.toLowerCase(),
    prevalence: counts.get(name.toLowerCase())?.total ?? 0,
  }))
  if (order === "typed") return cols
  return [...cols].sort((a, b) => {
    if (b.prevalence !== a.prevalence) return b.prevalence - a.prevalence
    return a.name.localeCompare(b.name)
  })
}

/**
 * One pass: for each taxid, count annotations and per-name hits among `columns`.
 */
export function tipNameVectors(
  rows: DecodedHitRow[],
  keys: HitKey[],
  columns: HeatmapColumn[],
): Map<number, NodeNameCounts> {
  const colIndex = new Map(columns.map((c, i) => [c.id, i]))
  const out = new Map<number, NodeNameCounts>()
  for (const row of rows) {
    let entry = out.get(row.taxid)
    if (!entry) {
      entry = { n: 0, byName: new Array(columns.length).fill(0) }
      out.set(row.taxid, entry)
    }
    entry.n += 1
    const seen = new Set<number>()
    for (const ki of row.matchedKeyIndexes) {
      const key = keys[ki]
      if (!key) continue
      const idx = colIndex.get(key.name.toLowerCase())
      if (idx == null || seen.has(idx)) continue
      seen.add(idx)
      entry.byName[idx] += 1
    }
  }
  return out
}

/**
 * Fold tip vectors into a node using the same tip set as the tree bar
 * (`lineageByTaxid` / tips under the node). Pass tip taxids for the node.
 */
export function foldNodeCounts(
  tipTaxids: Iterable<number>,
  tipVectors: Map<number, NodeNameCounts>,
  columnCount: number,
): NodeNameCounts {
  const byName = new Array(columnCount).fill(0)
  let n = 0
  for (const taxid of tipTaxids) {
    const tip = tipVectors.get(taxid)
    if (!tip) continue
    n += tip.n
    for (let i = 0; i < columnCount; i++) {
      byName[i] += tip.byName[i] ?? 0
    }
  }
  return { n, byName }
}

/**
 * Collect tip taxids under a tree node by walking its children and matching
 * against `lineageByTaxid` (organism → path node ids).
 */
export function tipTaxidsForNode(
  nodeId: string,
  lineageByTaxid: Map<number, Set<string>>,
): number[] {
  const tips: number[] = []
  for (const [taxid, path] of lineageByTaxid) {
    if (path.has(nodeId)) tips.push(taxid)
  }
  return tips
}

/**
 * Drop columns where every visible row is exactly 0% or exactly 100%.
 * Rows with n === 0 are ignored for the vary check.
 */
export function filterVaryingColumns(
  columns: HeatmapColumn[],
  rowCounts: NodeNameCounts[],
): HeatmapColumn[] {
  if (!rowCounts.length) return columns
  return columns.filter((_, colIdx) => {
    let sawZero = false
    let sawOne = false
    let sawPartial = false
    let any = false
    for (const row of rowCounts) {
      if (row.n <= 0) continue
      any = true
      const frac = (row.byName[colIdx] ?? 0) / row.n
      if (frac <= 0) sawZero = true
      else if (frac >= 1) sawOne = true
      else {
        sawPartial = true
        break
      }
    }
    if (!any) return false
    if (sawPartial) return true
    // Constant 0% or constant 100% across all rows → hide
    if (sawZero && !sawOne) return false
    if (sawOne && !sawZero) return false
    // Mix of 0% and 100% rows → varies
    return sawZero && sawOne
  })
}

/** Minimum cell width before horizontal scroll is allowed. */
export const HEATMAP_MIN_CELL_W = 8
/** Minimum row height when taxa overflow the viewport. */
export const HEATMAP_MIN_ROW_H = 28
/** Room for taxonomy title + rank select. */
const HEADER_H_MIN = 72
const HEADER_H_MAX = 140
/** Default legend strip height (must match UI). */
export const HEATMAP_DEFAULT_LEGEND_H = 32

export interface HeatmapLayoutInput {
  /** Full heatmap column width (grid area). */
  columnWidth: number
  /** Full heatmap column height (header + grid + legend). */
  columnHeight: number
  cols: number
  rows: number
  legendH?: number
}

export interface HeatmapLayout {
  cellW: number
  rowH: number
  headerH: number
  contentW: number
  contentH: number
  /** Grid viewport height after header + legend. */
  availableHeight: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Size heatmap cells to fill the overview column.
 * - Columns always fill width (one gene → one wide column), unless that
 *   would shrink below MIN_CELL_W (then scroll horizontally).
 * - Rows fill height when they fit; otherwise use MIN_ROW_H and scroll.
 */
export function computeHeatmapLayout(input: HeatmapLayoutInput): HeatmapLayout {
  const cols = Math.max(1, input.cols)
  const rows = Math.max(1, input.rows)
  const colW = Math.max(0, Math.floor(input.columnWidth))
  const colH = Math.max(0, Math.floor(input.columnHeight))
  const legendH = input.legendH ?? HEATMAP_DEFAULT_LEGEND_H

  const fitW = Math.floor(colW / cols)
  const cellW = Math.max(HEATMAP_MIN_CELL_W, fitW || HEATMAP_MIN_CELL_W)
  const headerH = clamp(Math.round(cellW * 2.5), HEADER_H_MIN, HEADER_H_MAX)
  const availableHeight = Math.max(0, colH - headerH - legendH)

  const minTotalH = rows * HEATMAP_MIN_ROW_H
  const rowH =
    availableHeight > 0 && minTotalH <= availableHeight
      ? Math.max(HEATMAP_MIN_ROW_H, Math.floor(availableHeight / rows))
      : HEATMAP_MIN_ROW_H

  return {
    cellW,
    rowH,
    headerH,
    contentW: cellW * cols,
    contentH: rowH * rows,
    availableHeight,
  }
}

/** Recursively list node ids in a HitTreeNode subtree (self + descendants). */
export function collectSubtreeIds(node: HitTreeNode): string[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child))
  }
  return ids
}
