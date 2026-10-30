import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  exactNamesBeforePrefixSheet,
  mergeGeneNames,
  partitionTokens,
  prefixTokensOnly,
  tokenizeGeneQuery,
} from "./tokenize"
import { MAX_NAMES_GET } from "./prefix"
import {
  initialPrefixSheet,
  namesToCommitFromSheet,
  sheetReducer,
} from "./prefix-sheet"

describe("sheetReducer", () => {
  it("opens with the seed and an empty pending selection", () => {
    const dirty = sheetReducer(initialPrefixSheet, {
      type: "add",
      names: ["STALE"],
    })
    const dropped = sheetReducer(dirty, { type: "drop", names: ["STALE"] })
    const opened = sheetReducer(dropped, {
      type: "open",
      seed: "seleno",
      exact: ["TP53"],
    })
    assert.equal(opened.open, true)
    assert.equal(opened.seed, "seleno")
    assert.deepEqual(opened.names, [])
    assert.equal(opened.removed.size, 0)
  })

  it("closes without clearing the draft names", () => {
    let opened = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "seleno",
    })
    opened = sheetReducer(opened, { type: "add", names: ["TP53"] })
    const closed = sheetReducer(opened, { type: "close" })
    assert.equal(closed.open, false)
    assert.deepEqual(closed.names, ["TP53"])
    assert.equal(closed.seed, "seleno")
  })

  it("adds names, dedupes case-insensitively, and un-removes them", () => {
    let state = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "seleno",
    })
    state = sheetReducer(state, { type: "drop", names: ["SELENOP"] })
    assert.ok(state.removed.has("selenop"))
    state = sheetReducer(state, {
      type: "add",
      names: ["SELENOP", "selenop", "SELENOS"],
    })
    assert.deepEqual(state.names, ["SELENOP", "SELENOS"])
    assert.equal(state.removed.has("selenop"), false)
  })

  it("drops names into the removed set", () => {
    let state = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "seleno",
    })
    state = sheetReducer(state, {
      type: "add",
      names: ["SELENOP", "SELENOS"],
    })
    state = sheetReducer(state, { type: "drop", names: ["selenop"] })
    assert.deepEqual(state.names, ["SELENOS"])
    assert.ok(state.removed.has("selenop"))
  })

  it("respects MAX_NAMES_GET on add", () => {
    const existing = Array.from({ length: MAX_NAMES_GET }, (_, i) => `G${i}`)
    let state = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "x",
    })
    state = sheetReducer(state, { type: "add", names: existing })
    state = sheetReducer(state, { type: "add", names: ["OVERFLOW"] })
    assert.equal(state.names.length, MAX_NAMES_GET)
    assert.equal(state.names.includes("OVERFLOW"), false)
  })

  it("keeps first-prefix picks when adding a second prefix in one session", () => {
    let state = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "seleno",
    })
    state = sheetReducer(state, {
      type: "add",
      names: ["SELENOP", "SELENOK"],
    })
    state = sheetReducer(state, {
      type: "add",
      names: ["BRCA1", "BRCA2"],
    })
    assert.deepEqual(state.names.sort(), [
      "BRCA1",
      "BRCA2",
      "SELENOK",
      "SELENOP",
    ])
  })
})

describe("namesToCommitFromSheet", () => {
  it("filters out removed names before uniqueNames", () => {
    assert.deepEqual(
      namesToCommitFromSheet(
        ["SELENOP", "SELENOS", "SELENOT"],
        new Set(["selenos"]),
      ),
      ["SELENOP", "SELENOT"],
    )
  })
})

describe("prefix add acceptance path (pure)", () => {
  it("seleno* → open → add results → apply yields those names", () => {
    const queryText = "seleno*"
    const beforePrefix = exactNamesBeforePrefixSheet(queryText)
    assert.ok(beforePrefix)
    assert.deepEqual(beforePrefix, [])

    const { prefixes } = partitionTokens(tokenizeGeneQuery(queryText))
    assert.deepEqual(prefixes, ["seleno*"])
    assert.equal(prefixTokensOnly(queryText), "seleno*")

    let sheet = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: prefixes[0]!.replace(/\*+$/, "").trim(),
    })
    assert.equal(sheet.open, true)
    assert.deepEqual(sheet.names, [])

    sheet = sheetReducer(sheet, {
      type: "add",
      names: ["SELENOP", "SELENOS", "SELENOT"],
    })
    const committed = namesToCommitFromSheet(sheet.names, sheet.removed)
    assert.deepEqual(committed, ["SELENOP", "SELENOS", "SELENOT"])

    sheet = sheetReducer(sheet, { type: "close" })
    assert.equal(sheet.open, false)
  })

  it("second open merges new prefix into the existing gene set", () => {
    const prior = ["SELENOP", "SELENOK"]
    let sheet = sheetReducer(initialPrefixSheet, {
      type: "open",
      seed: "brca",
    })
    assert.deepEqual(sheet.names, [])
    sheet = sheetReducer(sheet, {
      type: "add",
      names: ["BRCA1", "BRCA2"],
    })
    const pending = namesToCommitFromSheet(sheet.names, sheet.removed)
    const merged = mergeGeneNames(prior, pending, MAX_NAMES_GET)
    assert.deepEqual(merged.sort(), ["BRCA1", "BRCA2", "SELENOK", "SELENOP"])
  })
})
