import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { HitKey } from "@/lib/api/xrefs-types"
import type { DecodedHitRow } from "@/lib/genes/hits"
import {
  buildCoverageBins,
  clampCoverageRange,
  coverageChipLabel,
  defaultCoverageRange,
  filterRowsByCoverage,
  isDefaultCoverageRange,
  matchedSelectedTerms,
} from "./coverage"

function row(
  id: string,
  matched: number[],
  nMatched?: number,
): DecodedHitRow {
  return {
    annotationId: id,
    taxid: 9606,
    source: 1,
    nMatched: nMatched ?? matched.length,
    matchedKeyIndexes: matched,
  }
}

const keys: HitKey[] = [
  { term: 0, name: "TP53", ns: "symbol" },
  { term: 0, name: "P53", ns: "alias" },
  { term: 1, name: "BRCA1", ns: "symbol" },
  { term: 2, name: "EGFR", ns: "symbol" },
]

describe("matchedSelectedTerms", () => {
  it("counts distinct terms among selected names", () => {
    const selected = new Set(["tp53", "brca1"])
    // TP53 + P53 share term 0; BRCA1 is term 1 → 2
    assert.equal(matchedSelectedTerms(row("a", [0, 1, 2]), keys, selected), 2)
  })

  it("ignores deselected names", () => {
    const selected = new Set(["egfr"])
    assert.equal(matchedSelectedTerms(row("a", [0, 1, 3]), keys, selected), 1)
  })
})

describe("buildCoverageBins", () => {
  it("uses one bin per k when N <= 40", () => {
    const bins = buildCoverageBins([1, 1, 3, 3, 3], 3)
    assert.equal(bins.length, 4)
    assert.deepEqual(
      bins.map((b) => ({ minK: b.minK, maxK: b.maxK, count: b.count })),
      [
        { minK: 0, maxK: 0, count: 0 },
        { minK: 1, maxK: 1, count: 2 },
        { minK: 2, maxK: 2, count: 0 },
        { minK: 3, maxK: 3, count: 3 },
      ],
    )
  })

  it("merges into ~20 bins when N > 40", () => {
    const counts = Array.from({ length: 50 }, (_, i) => i % 51)
    const bins = buildCoverageBins(counts, 50)
    assert.ok(bins.length <= 21)
    assert.ok(bins.length >= 19)
    assert.equal(bins[0]?.minK, 0)
    assert.equal(bins[bins.length - 1]?.maxK, 50)
    const total = bins.reduce((s, b) => s + b.count, 0)
    assert.equal(total, counts.length)
  })
})

describe("defaultCoverageRange", () => {
  it("is [1, N] for N > 0", () => {
    assert.deepEqual(defaultCoverageRange(5), { min: 1, max: 5 })
  })

  it("treats [N, N] as non-default (all)", () => {
    assert.equal(isDefaultCoverageRange({ min: 5, max: 5 }, 5), false)
  })

  it("treats [1, N] as default", () => {
    assert.equal(isDefaultCoverageRange({ min: 1, max: 5 }, 5), true)
  })
})

describe("clampCoverageRange", () => {
  it("swaps inverted bounds and clamps to N", () => {
    assert.deepEqual(clampCoverageRange({ min: 9, max: 2 }, 5), {
      min: 2,
      max: 5,
    })
  })
})

describe("filterRowsByCoverage", () => {
  it("keeps rows whose selected-term count is in range", () => {
    const selected = new Set(["tp53", "brca1", "egfr"])
    const rows = [
      row("a", [0]), // 1 term
      row("b", [0, 2]), // 2 terms
      row("c", [0, 2, 3]), // 3 terms
    ]
    const filtered = filterRowsByCoverage(rows, keys, selected, {
      min: 2,
      max: 3,
    })
    assert.deepEqual(
      filtered.map((r) => r.annotationId),
      ["b", "c"],
    )
  })
})

describe("coverageChipLabel", () => {
  it("formats single and range", () => {
    assert.equal(coverageChipLabel({ min: 3, max: 3 }), "matched 3")
    assert.equal(coverageChipLabel({ min: 36, max: 44 }), "matched 36-44")
  })
})
