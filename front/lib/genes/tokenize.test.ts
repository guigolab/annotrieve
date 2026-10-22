import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  partitionTokens,
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

  it("caps the UI gene set at 50 by default", () => {
    const names = Array.from({ length: 60 }, (_, i) => `GENE${i}`)
    assert.equal(uniqueNames(names).length, 50)
  })
})
