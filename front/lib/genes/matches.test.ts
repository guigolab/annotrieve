import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { groupMatches } from "./matches"

describe("groupMatches", () => {
  it("returns empty for missing matches", () => {
    assert.deepEqual(groupMatches(undefined), {
      chips: [],
      distinctInputs: [],
      multiKey: false,
    })
    assert.deepEqual(groupMatches([]), {
      chips: [],
      distinctInputs: [],
      multiKey: false,
    })
  })

  it("handles one term and one name", () => {
    const grouped = groupMatches([
      { input: "TP53", name: "TP53", ns: "symbol" },
    ])
    assert.equal(grouped.multiKey, false)
    assert.deepEqual(grouped.distinctInputs, ["TP53"])
    assert.equal(grouped.chips.length, 1)
    assert.equal(grouped.chips[0].showMapping, false)
  })

  it("keeps several aliases under one term without multi-key", () => {
    const grouped = groupMatches([
      { input: "TP53", name: "TP53", ns: "symbol" },
      { input: "TP53", name: "P53", ns: "alias" },
      { input: "TP53", name: "TRP53", ns: "alias" },
    ])
    assert.equal(grouped.multiKey, false)
    assert.deepEqual(grouped.distinctInputs, ["TP53"])
    assert.equal(grouped.chips.length, 3)
    assert.equal(grouped.chips[1].showMapping, true)
  })

  it("flags multi-key when two terms hit one gene", () => {
    const grouped = groupMatches([
      { input: "tp53", name: "TP53", ns: "symbol" },
      { input: "p53", name: "P53", ns: "alias" },
    ])
    assert.equal(grouped.multiKey, true)
    assert.deepEqual(grouped.distinctInputs, ["tp53", "p53"])
    assert.equal(grouped.chips.length, 2)
  })

  it("maps prefix inputs to the matched name", () => {
    const grouped = groupMatches([
      { input: "tp5*", name: "TP53", ns: "symbol" },
    ])
    assert.equal(grouped.chips[0].showMapping, true)
    assert.equal(grouped.chips[0].input, "tp5*")
    assert.equal(grouped.chips[0].name, "TP53")
    assert.equal(grouped.multiKey, false)
  })

  it("dedupes identical chips", () => {
    const grouped = groupMatches([
      { input: "TP53", name: "TP53", ns: "symbol" },
      { input: "TP53", name: "TP53", ns: "symbol" },
    ])
    assert.equal(grouped.chips.length, 1)
  })
})
