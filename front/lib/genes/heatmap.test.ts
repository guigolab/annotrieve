import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { HitKey } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"
import {
  cellFraction,
  filterVaryingColumns,
  foldNodeCounts,
  computeHeatmapLayout,
  HEATMAP_MIN_CELL_W,
  HEATMAP_MIN_ROW_H,
  orderHeatmapColumns,
  tipNameVectors,
  type HeatmapColumn,
  type NodeNameCounts,
} from "./heatmap"

function row(
  id: string,
  taxid: number,
  matched: number[],
): DecodedHitRow {
  return {
    annotationId: id,
    taxid,
    source: 1,
    nMatched: matched.length,
    matchedKeyIndexes: matched,
  }
}

const keys: HitKey[] = [
  { term: 0, name: "TP53", ns: "symbol" },
  { term: 1, name: "BRCA1", ns: "symbol" },
  { term: 2, name: "EGFR", ns: "symbol" },
]

describe("orderHeatmapColumns", () => {
  it("orders by prevalence descending by default", () => {
    const rows = [
      row("a", 1, [0]),
      row("b", 1, [0]),
      row("c", 2, [1]),
      row("d", 2, [0, 1]),
    ]
    const cols = orderHeatmapColumns(
      ["EGFR", "TP53", "BRCA1"],
      rows,
      keys,
      "prevalence",
    )
    assert.deepEqual(
      cols.map((c) => c.name),
      ["TP53", "BRCA1", "EGFR"],
    )
  })

  it("keeps typed order when requested", () => {
    const cols = orderHeatmapColumns(
      ["EGFR", "TP53", "BRCA1"],
      [],
      keys,
      "typed",
    )
    assert.deepEqual(
      cols.map((c) => c.name),
      ["EGFR", "TP53", "BRCA1"],
    )
  })
})

describe("tipNameVectors + foldNodeCounts", () => {
  it("aggregates per-name counts under a node", () => {
    const rows = [
      row("a", 10, [0]),
      row("b", 10, [0, 1]),
      row("c", 20, [1]),
    ]
    const columns: HeatmapColumn[] = [
      { name: "TP53", id: "tp53", prevalence: 2 },
      { name: "BRCA1", id: "brca1", prevalence: 2 },
    ]
    const tips = tipNameVectors(rows, keys, columns)
    const folded = foldNodeCounts([10, 20], tips, columns.length)
    assert.equal(folded.n, 3)
    assert.deepEqual(folded.byName, [2, 2])
  })
})

describe("filterVaryingColumns", () => {
  const columns: HeatmapColumn[] = [
    { name: "A", id: "a", prevalence: 1 },
    { name: "B", id: "b", prevalence: 1 },
    { name: "C", id: "c", prevalence: 1 },
  ]

  it("hides columns that are all 0% or all 100%", () => {
    const rows: NodeNameCounts[] = [
      { n: 10, byName: [10, 0, 5] },
      { n: 4, byName: [4, 0, 0] },
    ]
    const kept = filterVaryingColumns(columns, rows)
    assert.deepEqual(
      kept.map((c) => c.name),
      ["C"],
    )
  })

  it("keeps columns with a mix of 0% and 100%", () => {
    const rows: NodeNameCounts[] = [
      { n: 10, byName: [10] },
      { n: 4, byName: [0] },
    ]
    const kept = filterVaryingColumns(
      [{ name: "A", id: "a", prevalence: 1 }],
      rows,
    )
    assert.equal(kept.length, 1)
  })
})

describe("computeHeatmapLayout", () => {
  it("fills the column for one gene and one row", () => {
    const layout = computeHeatmapLayout({
      columnWidth: 400,
      columnHeight: 300,
      cols: 1,
      rows: 1,
      legendH: 32,
    })
    assert.equal(layout.cellW, 400)
    assert.ok(layout.rowH > HEATMAP_MIN_ROW_H)
    assert.equal(layout.contentW, 400)
    assert.equal(layout.contentH, layout.rowH)
    // header + grid + legend ≈ column
    assert.ok(layout.headerH + layout.availableHeight + 32 <= 300)
  })

  it("splits width evenly across many columns", () => {
    const layout = computeHeatmapLayout({
      columnWidth: 500,
      columnHeight: 400,
      cols: 10,
      rows: 5,
      legendH: 32,
    })
    assert.equal(layout.cellW, 50)
    assert.equal(layout.contentW, 500)
  })

  it("uses min cell width and scrolls when columns are dense", () => {
    const layout = computeHeatmapLayout({
      columnWidth: 200,
      columnHeight: 400,
      cols: 50,
      rows: 5,
      legendH: 32,
    })
    assert.equal(layout.cellW, HEATMAP_MIN_CELL_W)
    assert.ok(layout.contentW > 200)
  })

  it("uses min row height when taxa overflow", () => {
    const layout = computeHeatmapLayout({
      columnWidth: 400,
      columnHeight: 200,
      cols: 2,
      rows: 100,
      legendH: 32,
    })
    assert.equal(layout.rowH, HEATMAP_MIN_ROW_H)
    assert.ok(layout.contentH > layout.availableHeight)
  })
})

describe("cellFraction", () => {
  it("returns 0 for empty nodes", () => {
    assert.equal(cellFraction(0, 0), 0)
    assert.equal(cellFraction(3, 10), 0.3)
  })
})
