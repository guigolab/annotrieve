import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMPTY_SELECTION,
  reduceSelection,
  selectionSize,
} from "./selection"

describe("reduceSelection", () => {
  it("click replaces a row selection", () => {
    const next = reduceSelection(EMPTY_SELECTION, {
      type: "click-row",
      id: "9606",
      mod: "replace",
      visibleRows: ["40674", "9606", "10090"],
    })
    assert.equal(next.kind, "rows")
    assert.deepEqual(next.rows, ["9606"])
  })

  it("ctrl toggles rows of the same kind", () => {
    let state = reduceSelection(EMPTY_SELECTION, {
      type: "click-row",
      id: "9606",
      mod: "replace",
      visibleRows: ["9606", "10090"],
    })
    state = reduceSelection(state, {
      type: "click-row",
      id: "10090",
      mod: "toggle",
      visibleRows: ["9606", "10090"],
    })
    assert.deepEqual(state.rows.sort(), ["10090", "9606"])
    state = reduceSelection(state, {
      type: "click-row",
      id: "9606",
      mod: "toggle",
      visibleRows: ["9606", "10090"],
    })
    assert.deepEqual(state.rows, ["10090"])
  })

  it("shift expands a row range over visible order", () => {
    const state = reduceSelection(
      { kind: "rows", rows: ["40674"], cols: [], cells: [] },
      {
        type: "click-row",
        id: "10090",
        mod: "replace",
        visibleRows: ["40674", "9606", "10090"],
        shiftAnchor: "40674",
      },
    )
    assert.deepEqual(state.rows, ["40674", "9606", "10090"])
  })

  it("shift expands a cell rectangle", () => {
    const state = reduceSelection(
      {
        kind: "cells",
        rows: [],
        cols: [],
        cells: [{ taxid: "a", gene: "TP53" }],
      },
      {
        type: "click-cell",
        taxid: "c",
        gene: "EGFR",
        mod: "replace",
        visibleRows: ["a", "b", "c"],
        visibleCols: ["TP53", "BRCA1", "EGFR"],
        shiftAnchor: { taxid: "a", gene: "TP53" },
      },
    )
    assert.equal(selectionSize(state), 9)
  })

  it("clicking a different kind replaces (homogeneous)", () => {
    const rows = reduceSelection(EMPTY_SELECTION, {
      type: "click-row",
      id: "9606",
      mod: "replace",
      visibleRows: ["9606"],
    })
    const cols = reduceSelection(rows, {
      type: "click-col",
      name: "TP53",
      mod: "toggle",
      visibleCols: ["TP53"],
    })
    assert.equal(cols.kind, "cols")
    assert.deepEqual(cols.cols, ["TP53"])
    assert.equal(cols.rows.length, 0)
  })

  it("prune drops missing ids", () => {
    const state = {
      kind: "rows" as const,
      rows: ["9606", "10090"],
      cols: [],
      cells: [],
    }
    const next = reduceSelection(state, {
      type: "prune",
      rowIds: new Set(["9606"]),
      colNames: new Set(),
    })
    assert.deepEqual(next.rows, ["9606"])
  })

  it("clear empties selection", () => {
    const next = reduceSelection(
      { kind: "cols", rows: [], cols: ["TP53"], cells: [] },
      { type: "clear" },
    )
    assert.equal(next.kind, null)
  })

  it("set-rows replaces in one action", () => {
    const next = reduceSelection(EMPTY_SELECTION, {
      type: "set-rows",
      ids: ["a", "b", "c"],
    })
    assert.deepEqual(next.rows, ["a", "b", "c"])
  })

  it("toggle-all-rows selects then clears", () => {
    const ids = ["a", "b", "c"]
    const on = reduceSelection(EMPTY_SELECTION, {
      type: "toggle-all-rows",
      ids,
    })
    assert.deepEqual(on.rows, ids)
    const off = reduceSelection(on, { type: "toggle-all-rows", ids })
    assert.equal(off.kind, null)
  })
})
