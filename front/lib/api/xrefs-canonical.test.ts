import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { canonicalNameCsv, canonicalTaxidCsv } from "./xrefs"

describe("canonicalNameCsv", () => {
  it("lowercases, dedupes, and sorts for stable cache keys", () => {
    assert.equal(canonicalNameCsv(["TP53", "egfr", "Egfr", " brca1 "]), "brca1,egfr,tp53")
  })

  it("is stable under permutation", () => {
    assert.equal(
      canonicalNameCsv(["b", "a", "c"]),
      canonicalNameCsv(["c", "b", "a"]),
    )
  })
})

describe("canonicalTaxidCsv", () => {
  it("dedupes and sorts taxids", () => {
    assert.equal(canonicalTaxidCsv([9606, 10090, 9606]), "9606,10090")
  })

  it("returns undefined for empty", () => {
    assert.equal(canonicalTaxidCsv([]), undefined)
    assert.equal(canonicalTaxidCsv(null), undefined)
  })
})
