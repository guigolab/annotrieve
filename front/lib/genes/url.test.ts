import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildGenesQueryString,
  parseGenesSearchParams,
  resolveCoverageFromUrl,
} from "./url"

describe("resolveCoverageFromUrl", () => {
  it("uses lo/hi when present", () => {
    assert.deepEqual(
      resolveCoverageFromUrl({ lo: 2, hi: 4 }, 10),
      { min: 2, max: 4 },
    )
  })

  it("defaults to [1, N]", () => {
    assert.deepEqual(
      resolveCoverageFromUrl({ lo: null, hi: null }, 7),
      { min: 1, max: 7 },
    )
  })
})

describe("buildGenesQueryString", () => {
  it("omits default coverage and full sources", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      t: null,
      g: null,
      sources: new Set([1, 2, 3]),
      coverage: { min: 1, max: 3 },
      termCount: 3,
      ann: null,
      gene: null,
    })
    assert.equal(qs, "names=TP53")
  })

  it("writes lo/hi for non-default coverage including all", () => {
    const qs = buildGenesQueryString({
      names: ["A", "B"],
      exclude: [],
      t: null,
      g: null,
      sources: new Set([1, 2, 3]),
      coverage: { min: 2, max: 2 },
      termCount: 2,
      ann: null,
      gene: null,
    })
    assert.equal(qs, "names=A%2CB&lo=2&hi=2")
  })

  it("writes lo/hi, t, g, exclude", () => {
    const qs = buildGenesQueryString({
      names: [],
      exclude: ["EGFR"],
      t: "9606",
      g: "TP53",
      sources: new Set([1]),
      coverage: { min: 2, max: 5 },
      termCount: 8,
      ann: "ann-1",
      gene: 10,
    })
    assert.equal(
      qs,
      "exclude=EGFR&t=9606&g=TP53&sources=1&lo=2&hi=5&ann=ann-1&gene=10",
    )
  })

  it("writes include/exclude taxids", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      t: null,
      g: null,
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      includeTaxids: [9606, 10090],
      excludeTaxids: [7227],
    })
    assert.equal(qs, "names=TP53&itax=9606%2C10090&etax=7227")
  })

  it("writes view rank", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      t: null,
      g: null,
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      viewRank: "order",
    })
    assert.equal(qs, "names=TP53&rank=order")
  })
})

describe("parseGenesSearchParams", () => {
  it("reads names and strips wildcards", () => {
    const usp = new URLSearchParams(
      "names=TP53,BRCA1,foo*&exclude=EGFR&t=9606&g=TP53",
    )
    const parsed = parseGenesSearchParams(usp)
    assert.deepEqual(parsed.names, ["TP53", "BRCA1"])
    assert.equal(parsed.t, "9606")
    assert.equal(parsed.g, "TP53")
    assert.deepEqual(parsed.exclude, ["EGFR"])
  })

  it("reads itax/etax taxids", () => {
    const usp = new URLSearchParams("names=TP53&itax=9606,10090&etax=7227")
    const parsed = parseGenesSearchParams(usp)
    assert.deepEqual(parsed.includeTaxids, [9606, 10090])
    assert.deepEqual(parsed.excludeTaxids, [7227])
  })

  it("reads and validates rank", () => {
    const ok = parseGenesSearchParams(new URLSearchParams("rank=family"))
    assert.equal(ok.viewRank, "family")
    const bad = parseGenesSearchParams(new URLSearchParams("rank=species"))
    assert.equal(bad.viewRank, null)
  })

  it("ignores legacy match/cov/include/exclude_tax params", () => {
    const usp = new URLSearchParams(
      "names=TP53&match=all&cov=2-4&include=9606&exclude_tax=7227&lo=1&hi=3",
    )
    const parsed = parseGenesSearchParams(usp)
    assert.deepEqual(parsed.names, ["TP53"])
    assert.equal(parsed.lo, 1)
    assert.equal(parsed.hi, 3)
    assert.deepEqual(parsed.includeTaxids, [])
    assert.deepEqual(parsed.excludeTaxids, [])
  })
})
