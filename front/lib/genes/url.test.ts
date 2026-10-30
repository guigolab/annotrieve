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
      sources: new Set([1, 2, 3]),
      coverage: { min: 2, max: 2 },
      termCount: 2,
      ann: null,
      gene: null,
    })
    assert.equal(qs, "names=A%2CB&lo=2&hi=2")
  })

  it("writes lo/hi, t, g, exclude via listFilters", () => {
    const qs = buildGenesQueryString({
      names: [],
      exclude: ["EGFR"],
      listFilters: {
        includeTaxids: ["9606"],
        includeNames: ["TP53"],
        nameMatch: "any",
        includeCells: [],
        includeAnnotationIds: [],
      },
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
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      viewRank: "order",
    })
    assert.equal(qs, "names=TP53&rank=order")
  })

  it("after a view-filter reset omits t, g, sources, lo/hi and rank", () => {
    // State shape matching store.resetViewFilters() output (viewRank null).
    const qs = buildGenesQueryString({
      names: ["TP53", "EGFR"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 2,
      ann: null,
      gene: null,
      viewRank: null,
    })
    assert.equal(qs, "names=TP53%2CEGFR")
  })

  it("omits view when distribution (default)", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      view: "distribution",
    })
    assert.equal(qs, "names=TP53")
  })

  it("writes non-default view", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      view: "annotations",
    })
    assert.equal(qs, "names=TP53&view=annotations")
  })

  it("omits default unit and writes species", () => {
    const omitted = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      unit: "annotations",
    })
    assert.equal(omitted, "names=TP53")
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      unit: "species",
    })
    assert.equal(qs, "names=TP53&unit=species")
  })

  it("round-trips listFilters via t/g/gm/c", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      listFilters: {
        includeTaxids: ["9606", "10090"],
        includeNames: ["TP53", "BRCA1"],
        nameMatch: "all",
        includeCells: [{ taxid: "9606", gene: "TP53" }],
        includeAnnotationIds: [],
      },
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 2,
      ann: null,
      gene: null,
    })
    const parsed = parseGenesSearchParams(new URLSearchParams(qs))
    assert.equal(parsed.t, "9606,10090")
    assert.equal(parsed.g, "TP53,BRCA1")
    assert.equal(parsed.gm, "all")
    assert.equal(parsed.c, "9606:TP53")
  })

  it("omits rank when viewRank is null (auto / effective kingdom)", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      viewRank: null,
    })
    assert.equal(qs.includes("rank="), false)
  })

  it("writes keep/group/sort/q when non-default", () => {
    const qs = buildGenesQueryString({
      names: ["TP53"],
      exclude: [],
      sources: new Set([1, 2, 3]),
      coverage: null,
      termCount: 1,
      ann: null,
      gene: null,
      keep: "best",
      group: "order",
      sort: "species",
      search: "homo",
    })
    assert.equal(
      qs,
      "names=TP53&keep=best&group=order&sort=species&q=homo",
    )
  })

  it("writes sort=none and non-primary dir", () => {
    assert.equal(
      buildGenesQueryString({
        names: ["TP53"],
        exclude: [],
        sources: new Set([1, 2, 3]),
        coverage: null,
        termCount: 1,
        ann: null,
        gene: null,
        sort: null,
      }),
      "names=TP53&sort=none",
    )
    assert.equal(
      buildGenesQueryString({
        names: ["TP53"],
        exclude: [],
        sources: new Set([1, 2, 3]),
        coverage: null,
        termCount: 1,
        ann: null,
        gene: null,
        sort: "coverage",
        sortDir: "asc",
      }),
      "names=TP53&sort=coverage&dir=asc",
    )
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

  it("reads view and rejects invalid values", () => {
    assert.equal(
      parseGenesSearchParams(new URLSearchParams("view=compare")).view,
      "compare",
    )
    assert.equal(
      parseGenesSearchParams(new URLSearchParams("view=heatmap")).view,
      null,
    )
    assert.equal(
      parseGenesSearchParams(new URLSearchParams("names=TP53")).view,
      null,
    )
  })

  it("reads sort=none and dir", () => {
    const none = parseGenesSearchParams(new URLSearchParams("sort=none"))
    assert.equal(none.sort, null)
    const withDir = parseGenesSearchParams(
      new URLSearchParams("sort=coverage&dir=asc"),
    )
    assert.equal(withDir.sort, "coverage")
    assert.equal(withDir.sortDir, "asc")
    const absent = parseGenesSearchParams(new URLSearchParams("names=TP53"))
    assert.equal(absent.sort, undefined)
  })
})
