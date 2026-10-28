import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  exactNamesBeforePrefixSheet,
  mergeGeneNames,
  partitionTokens,
  prefixTokensOnly,
  pruneExcludedToNames,
  tokenizeGeneQuery,
  uniqueNames,
} from "./tokenize"

describe("tokenizeGeneQuery", () => {
  it("splits on commas, semicolons, and whitespace", () => {
    assert.deepEqual(tokenizeGeneQuery("TP53, BRCA1; EGFR\nGAPDH"), [
      "TP53",
      "BRCA1",
      "EGFR",
      "GAPDH",
    ])
  })
})

describe("partitionTokens", () => {
  it("separates prefixes from exact names", () => {
    assert.deepEqual(partitionTokens(["TP53", "seleno*", "BRCA1"]), {
      exact: ["TP53", "BRCA1"],
      prefixes: ["seleno*"],
    })
  })
})

describe("uniqueNames", () => {
  it("dedupes case-insensitively and skips prefixes", () => {
    assert.deepEqual(uniqueNames(["TP53", "tp53", "seleno*", "BRCA1"]), [
      "TP53",
      "BRCA1",
    ])
  })

  it("caps the UI gene set at 200 by default", () => {
    const names = Array.from({ length: 210 }, (_, i) => `GENE${i}`)
    assert.equal(uniqueNames(names).length, 200)
  })
})

describe("exactNamesBeforePrefixSheet", () => {
  it("returns exact names to commit when a prefix is present", () => {
    assert.deepEqual(exactNamesBeforePrefixSheet("TP53,seleno*,BRCA1"), [
      "TP53",
      "BRCA1",
    ])
  })

  it("returns null when there is no prefix", () => {
    assert.equal(exactNamesBeforePrefixSheet("TP53,BRCA1"), null)
  })

  it("returns empty exact list for prefix-only queries", () => {
    assert.deepEqual(exactNamesBeforePrefixSheet("seleno*"), [])
  })
})

describe("mergeGeneNames", () => {
  it("appends and dedupes case-insensitively", () => {
    assert.deepEqual(mergeGeneNames(["TP53", "BRCA1"], ["tp53", "EGFR"]), [
      "TP53",
      "BRCA1",
      "EGFR",
    ])
  })

  it("respects the cap", () => {
    const existing = Array.from({ length: 198 }, (_, i) => `GENE${i}`)
    const next = mergeGeneNames(existing, ["NEW1", "NEW2", "NEW3"], 200)
    assert.equal(next.length, 200)
    assert.ok(next.includes("NEW1"))
    assert.ok(next.includes("NEW2"))
    assert.equal(next.includes("NEW3"), false)
  })
})

describe("pruneExcludedToNames", () => {
  it("drops exclusions for removed names", () => {
    const pruned = pruneExcludedToNames(
      new Set(["tp53", "brca1", "egfr"]),
      ["TP53", "EGFR"],
    )
    assert.deepEqual([...pruned].sort(), ["egfr", "tp53"])
  })

  it("returns the same set when nothing changes", () => {
    const excluded = new Set(["tp53"])
    assert.equal(pruneExcludedToNames(excluded, ["TP53"]), excluded)
  })
})

describe("prefixTokensOnly", () => {
  it("keeps only prefix tokens", () => {
    assert.equal(prefixTokensOnly("TP53, seleno*, BRCA1, hox*"), "seleno*, hox*")
  })
})
