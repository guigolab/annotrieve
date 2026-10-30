import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { HitTerm } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"
import type { FlatTreeNode } from "@/lib/api/taxons"

import { heatmapPngExportScale } from "./heatmap-export"
import {
  buildTipsByNode,
  CELL_COLOR_FLOOR,
  cellColorT,
  cellFraction,
  filterVaryingColumns,
  foldNodeCounts,
  foldNodeSpeciesCounts,
  heatmapColumnLayout,
  heatmapHeaderHeight,
  HEATMAP_ROTATE_HEADER_AT,
  orderHeatmapColumns,
  tipNameVectors,
  tipSpeciesVectors,
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
    matchedTerms: matched,
    releaseDate: null,
    assemblyName: null,
  }
}

const terms: HitTerm[] = [
  { input: "TP53", name: "tp53", namespaces: ["symbol"], n_hits: 1 },
  { input: "BRCA1", name: "brca1", namespaces: ["symbol"], n_hits: 1 },
  { input: "EGFR", name: "egfr", namespaces: ["symbol"], n_hits: 1 },
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
      terms,
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
      terms,
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
    const tips = tipNameVectors(rows, terms, columns)
    const folded = foldNodeCounts([10, 20], tips, columns.length)
    assert.equal(folded.n, 3)
    assert.deepEqual(folded.byName, [2, 2])
  })
})

describe("tipSpeciesVectors + foldNodeSpeciesCounts", () => {
  it("de-duplicates species under a parent", () => {
    const node = (
      id: string,
      parentId: string,
      name: string,
      rank: string,
    ): FlatTreeNode =>
      ({
        id,
        parentId,
        scientific_name: name,
        rank,
        annotations_count: 0,
        assemblies_count: 0,
        organisms_count: 0,
        coding_count: 0,
        non_coding_count: 0,
        pseudogene_count: 0,
        mrna_count: 0,
        lncrna_count: 0,
        trna_count: 0,
        mirna_count: 0,
        busco_single_copy_mean: 0,
        busco_duplicated_mean: 0,
        busco_fragmented_mean: 0,
        busco_missing_mean: 0,
      }) as FlatTreeNode

    // Two strain tips of the same species, one tip of another.
    const index = new Map<string, FlatTreeNode>([
      ["100", node("100", "1", "Species A", "species")],
      ["101", node("101", "100", "Strain A1", "no rank")],
      ["102", node("102", "100", "Strain A2", "no rank")],
      ["200", node("200", "1", "Species B", "species")],
    ])
    const rows = [
      row("a", 101, [0]),
      row("b", 101, [0]),
      row("c", 102, [1]),
      row("d", 200, [0, 1]),
    ]
    const columns: HeatmapColumn[] = [
      { name: "TP53", id: "tp53", prevalence: 1 },
      { name: "BRCA1", id: "brca1", prevalence: 1 },
    ]
    const tips = tipSpeciesVectors(rows, terms, columns, index)
    const folded = foldNodeSpeciesCounts(
      [101, 102, 200],
      tips,
      columns.length,
    )
    // Species A (from 101+102) + Species B → n=2
    assert.equal(folded.n, 2)
    // Both species have TP53; both have BRCA1
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

describe("heatmapColumnLayout", () => {
  it("uses wide cells for few columns", () => {
    const layout = heatmapColumnLayout(3)
    assert.equal(layout.cellW, 64)
    assert.equal(layout.rotateHeaders, false)
  })

  it("rotates headers past the threshold", () => {
    const layout = heatmapColumnLayout(HEATMAP_ROTATE_HEADER_AT + 1)
    assert.equal(layout.cellW, 64)
    assert.equal(layout.rotateHeaders, true)
  })

  it("narrows cells as columns grow", () => {
    assert.equal(heatmapColumnLayout(15).cellW, 40)
    assert.equal(heatmapColumnLayout(40).cellW, 28)
  })
})

describe("heatmapPngExportScale", () => {
  it("keeps the requested scale for modest canvases", () => {
    assert.equal(heatmapPngExportScale(800, 600, 2), 2)
  })

  it("drops to scale 1 when the base area already exceeds the pixel cap", () => {
    assert.equal(heatmapPngExportScale(8000, 8000, 2), 1)
  })
})

describe("cellFraction", () => {
  it("returns 0 for empty nodes", () => {
    assert.equal(cellFraction(0, 0), 0)
    assert.equal(cellFraction(3, 10), 0.3)
  })
})

describe("cellColorT", () => {
  it("returns null for zero matches", () => {
    assert.equal(cellColorT(0, 1000), null)
    assert.equal(cellColorT(0, 0), null)
    assert.equal(cellColorT(3, 0), null)
  })

  it("keeps k=1 visibly above the floor even for huge n", () => {
    const t = cellColorT(1, 10_000)
    assert.ok(t != null)
    assert.ok(t! >= CELL_COLOR_FLOOR)
    assert.ok(t! > CELL_COLOR_FLOOR - 1e-9)
    // Still near the floor, not collapsed to the empty end of the ramp.
    assert.ok(t! < CELL_COLOR_FLOOR + 0.05)
  })

  it("is monotonic in matched count", () => {
    const n = 100
    let prev = cellColorT(1, n)!
    for (let k = 2; k <= n; k++) {
      const next = cellColorT(k, n)!
      assert.ok(next >= prev, `expected t(${k}) >= t(${k - 1})`)
      prev = next
    }
    assert.equal(cellColorT(n, n), 1)
  })
})

describe("heatmapHeaderHeight", () => {
  it("uses a short height for horizontal headers", () => {
    assert.equal(heatmapHeaderHeight(false, ["TP53", "BRCA1"]), 40)
  })

  it("keeps a compact rotated strip from cell width", () => {
    const narrow = heatmapHeaderHeight(true, ["SELENOK"], 28)
    const mid = heatmapHeaderHeight(true, ["SELENOK"], 44)
    const wide = heatmapHeaderHeight(true, ["SELENOK"], 64)
    assert.ok(narrow >= 56)
    assert.ok(narrow <= 72)
    assert.ok(mid <= 72)
    assert.ok(wide <= 72)
    assert.ok(wide >= narrow)
    // Longest name must not inflate the strip.
    assert.equal(
      heatmapHeaderHeight(true, ["A"], 44),
      heatmapHeaderHeight(true, ["A".repeat(40)], 44),
    )
  })
})

describe("buildTipsByNode", () => {
  it("inverts lineage paths into node → tip taxids", () => {
    const lineage = new Map<number, Set<string>>([
      [9606, new Set(["40674", "9443", "9606"])],
      [10090, new Set(["40674", "10090"])],
    ])
    const tips = buildTipsByNode(lineage)
    assert.deepEqual(tips.get("40674")?.sort(), [9606, 10090].sort())
    assert.deepEqual(tips.get("9443"), [9606])
    assert.deepEqual(tips.get("9606"), [9606])
    assert.deepEqual(tips.get("10090"), [10090])
  })
})
