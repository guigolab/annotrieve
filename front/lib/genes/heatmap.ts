import type { FlatTreeNode } from "@/lib/api/taxons"
import type { HitTerm } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"
import { speciesForTaxid } from "@/lib/genes/species"
import type { HitTreeNode } from "@/lib/genes/tree"
import type { CountUnit } from "@/lib/genes/view"

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

/**
 * Same blue ramp as comparison-stats heatmap (`getHeatmapColor`):
 * light sky `rgb(219,234,254)` → deep blue `rgb(30,64,175)`.
 */
const HEAT_BLUE_LO: [number, number, number] = [219, 234, 254]
const HEAT_BLUE_HI: [number, number, number] = [30, 64, 175]

/** Floor for the perceptual scale so k=1 is visibly above empty. */
export const CELL_COLOR_FLOOR = 0.18

export function interpolateHeatmapBlue(t: number): string {
  const x = Math.max(0, Math.min(1, t))
  const r = Math.round(HEAT_BLUE_LO[0] + x * (HEAT_BLUE_HI[0] - HEAT_BLUE_LO[0]))
  const g = Math.round(HEAT_BLUE_LO[1] + x * (HEAT_BLUE_HI[1] - HEAT_BLUE_LO[1]))
  const b = Math.round(HEAT_BLUE_LO[2] + x * (HEAT_BLUE_HI[2] - HEAT_BLUE_LO[2]))
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Perceptual colour position for a non-zero cell.
 * Uses a square-root scale with a visible floor so tiny fractions stay distinct from 0.
 * Returns null when the cell should render as empty (k === 0 or n <= 0).
 */
export function cellColorT(matched: number, n: number): number | null {
  if (n <= 0 || matched <= 0) return null
  const frac = Math.min(1, matched / n)
  return CELL_COLOR_FLOOR + (1 - CELL_COLOR_FLOOR) * Math.sqrt(frac)
}

export function cellBackground(matched: number, n: number): string | undefined {
  const t = cellColorT(matched, n)
  return t == null ? undefined : interpolateHeatmapBlue(t)
}

/** Prefer light text on deep blue, dark text on light sky (matches comparison heatmap). */
export function cellTextIsDark(matched: number, n: number): boolean {
  const t = cellColorT(matched, n)
  if (t == null) return true
  return t <= 0.5
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
  unit: CountUnit = "annotations",
): string {
  const pct = n > 0 ? Math.round((matched / n) * 100) : 0
  const unitLabel = unit === "species" ? "species" : "annotations"
  return `${taxonLabel} · ${geneName} · ${matched.toLocaleString()} of ${n.toLocaleString()} ${unitLabel} (${pct}%)`
}

/** Per-tip species contribution for species-mode heatmap counts. */
export interface SpeciesTipVector {
  speciesId: number
  /** 0/1 presence per column for this species. */
  byName: number[]
}

/**
 * Build tip→species vectors: each tip taxid maps to its species id and a
 * 0/1 gene-presence vector (any annotation of that species with gene i).
 */
export function tipSpeciesVectors(
  rows: DecodedHitRow[],
  terms: HitTerm[],
  columns: HeatmapColumn[],
  taxonIndex: Map<string, FlatTreeNode>,
): Map<number, SpeciesTipVector> {
  const colIndex = new Map(columns.map((c, i) => [c.id, i]))
  const bySpecies = new Map<number, number[]>()
  const tipToSpecies = new Map<number, number>()

  for (const row of rows) {
    const species = speciesForTaxid(row.taxid, taxonIndex)
    tipToSpecies.set(row.taxid, species.id)
    let byName = bySpecies.get(species.id)
    if (!byName) {
      byName = new Array(columns.length).fill(0)
      bySpecies.set(species.id, byName)
    }
    const seen = new Set<number>()
    for (const ti of row.matchedTerms) {
      const term = terms[ti]
      if (!term) continue
      const idx = colIndex.get(term.name.toLowerCase())
      if (idx == null || seen.has(idx)) continue
      seen.add(idx)
      byName[idx] = 1
    }
  }

  const out = new Map<number, SpeciesTipVector>()
  for (const [taxid, speciesId] of tipToSpecies) {
    const byName = bySpecies.get(speciesId) ?? new Array(columns.length).fill(0)
    out.set(taxid, { speciesId, byName })
  }
  return out
}

/**
 * Fold tip species vectors under a node, de-duplicating species among tips.
 * `n` = distinct species; `byName[i]` = species with gene i.
 */
export function foldNodeSpeciesCounts(
  tipTaxids: Iterable<number>,
  tipVectors: Map<number, SpeciesTipVector>,
  columnCount: number,
): NodeNameCounts {
  const byName = new Array(columnCount).fill(0)
  const seenSpecies = new Set<number>()
  for (const taxid of tipTaxids) {
    const tip = tipVectors.get(taxid)
    if (!tip) continue
    if (seenSpecies.has(tip.speciesId)) continue
    seenSpecies.add(tip.speciesId)
    for (let i = 0; i < columnCount; i++) {
      if (tip.byName[i]) byName[i] += 1
    }
  }
  return { n: seenSpecies.size, byName }
}

/**
 * Order gene-name columns by prevalence (desc) or typed order.
 */
export function orderHeatmapColumns(
  names: string[],
  rows: DecodedHitRow[],
  terms: HitTerm[],
  order: HeatmapColumnOrder,
): HeatmapColumn[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const seen = new Set<string>()
    for (const ti of row.matchedTerms) {
      const term = terms[ti]
      if (!term) continue
      const id = term.name.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }
  const cols: HeatmapColumn[] = names.map((name) => ({
    name,
    id: name.toLowerCase(),
    prevalence: counts.get(name.toLowerCase()) ?? 0,
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
  terms: HitTerm[],
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
    for (const ti of row.matchedTerms) {
      const term = terms[ti]
      if (!term) continue
      const idx = colIndex.get(term.name.toLowerCase())
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
 * Invert organism → path into nodeId → tip taxids (one pass).
 * Speeds up repeated nodeCount / heatmap matrix builds.
 */
export function buildTipsByNode(
  lineageByTaxid: Map<number, Set<string>>,
): Map<string, number[]> {
  const tipsByNode = new Map<string, number[]>()
  for (const [taxid, path] of lineageByTaxid) {
    for (const nodeId of path) {
      let list = tipsByNode.get(nodeId)
      if (!list) {
        list = []
        tipsByNode.set(nodeId, list)
      }
      list.push(taxid)
    }
  }
  return tipsByNode
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

/** Rotate column headers when there are more than this many columns. */
export const HEATMAP_ROTATE_HEADER_AT = 6

/** Show in-cell counts when the column is at least this wide. */
export const HEATMAP_COUNT_MIN_CELL_W = 28

export interface HeatmapColumnLayout {
  /** Pixel width for each gene-name column. */
  cellW: number
  /** Prefer vertical (rotated) column headers. */
  rotateHeaders: boolean
}

/**
 * Fixed column widths for the table heatmap (no container measure).
 * Wider cells for few columns; denser packing as the set grows.
 * Floor ≈ 28px so horizontal scroll handles large N instead of hiding columns.
 */
export function heatmapColumnLayout(colCount: number): HeatmapColumnLayout {
  const n = Math.max(0, colCount)
  if (n <= 8) return { cellW: 64, rotateHeaders: n > HEATMAP_ROTATE_HEADER_AT }
  if (n <= 20) return { cellW: 40, rotateHeaders: true }
  return { cellW: 28, rotateHeaders: true }
}

/**
 * Wider gene columns for the Annotations matrix (always-horizontal headers).
 * Horizontal scroll + virtual columns handle large N; floor is 72px.
 */
export function annotationsGeneColumnWidth(colCount: number): number {
  const n = Math.max(0, colCount)
  if (n <= 12) return 96
  if (n <= 24) return 80
  return 72
}

/**
 * Rotated header strip height.
 * Compact and independent of the longest name — labels use max-h-full and
 * truncate instead of growing a void above shorter columns.
 */
export function heatmapHeaderHeight(
  rotateHeaders: boolean,
  _names: readonly string[] = [],
  cellW = 44,
): number {
  if (!rotateHeaders) return 40
  // ~10–11 char mono labels fill this; longer names ellipsize.
  return Math.min(72, Math.max(56, Math.round(cellW * 1.35)))
}

/** Recursively list node ids in a HitTreeNode subtree (self + descendants). */
export function collectSubtreeIds(node: HitTreeNode): string[] {
  const ids = [node.id]
  for (const child of node.children) {
    ids.push(...collectSubtreeIds(child))
  }
  return ids
}
