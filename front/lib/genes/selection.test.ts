import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  EMPTY_SELECTION,
  reduceSelection,
  selectionIsEmpty,
} from "./selection"

describe("reduceSelection", () => {
  it("click toggles a row without wiping other dimensions", () => {
    let state = reduceSelection(EMPTY_SELECTION, {
      type: "click-col",
      name: "TP53",
      mod: "toggle",
      visibleCols: ["TP53"],
    })
    state = reduceSelection(state, {
      type: "click-row",
      id: "9606",
      mod: "replace",
      visibleRows: ["9606", "10090"],
    })
    assert.deepEqual(state.rows, ["9606"])
    assert.deepEqual(state.cols, ["TP53"])
  })

  it("toggles rows on and off", () => {
    let state = reduceSelection(EMPTY_SELECTION, {
      type: "click-row",
      id: "9606",
      mod: "toggle",
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
    let state = reduceSelection(EMPTY_SELECTION, {
      type: "click-row",
      id: "40674",
      mod: "toggle",
      visibleRows: ["40674", "9606", "10090"],
    })
    state = reduceSelection(state, {
      type: "click-row",
      id: "10090",
      mod: "toggle",
      visibleRows: ["40674", "9606", "10090"],
      shiftAnchor: "40674",
    })
    assert.deepEqual(state.rows, ["40674", "9606", "10090"])
  })

  it("clear empties selection", () => {
    const next = reduceSelection(
      {
        rows: [],
        cols: ["TP53"],
      },
      { type: "clear" },
    )
    assert.equal(selectionIsEmpty(next), true)
  })

  it("set-rows replaces rows in one action", () => {
    const next = reduceSelection(EMPTY_SELECTION, {
      type: "set-rows",
      ids: ["a", "b", "c"],
    })
    assert.deepEqual(next.rows, ["a", "b", "c"])
  })

  it("toggle-all-rows selects then clears those rows", () => {
    const ids = ["a", "b", "c"]
    const on = reduceSelection(EMPTY_SELECTION, {
      type: "toggle-all-rows",
      ids,
    })
    assert.deepEqual(on.rows, ids)
    const off = reduceSelection(on, { type: "toggle-all-rows", ids })
    assert.equal(selectionIsEmpty(off), true)
  })
})
