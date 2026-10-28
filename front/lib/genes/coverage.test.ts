import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { DecodedHitRow } from "@/lib/genes/hits"
import {
  buildCoverageBins,
  clampCoverageRange,
  coverageChipLabel,
  defaultCoverageRange,
  isDefaultCoverageRange,
  matchedActiveTerms,
  namesMatchedChipLabel,
} from "./coverage"

function row(id: string, matched: number[]): DecodedHitRow {
  return {
    annotationId: id,
    taxid: 9606,
    source: 1,
    matchedTerms: matched,
    releaseDate: null,
    assemblyName: null,
  }
}

describe("matchedActiveTerms", () => {
  it("counts active term indexes on the row", () => {
    const active = new Set([0, 1])
    assert.equal(matchedActiveTerms(row("a", [0, 1, 2]), active), 2)
  })

  it("ignores inactive terms", () => {
    const active = new Set([2])
    assert.equal(matchedActiveTerms(row("a", [0, 1, 2]), active), 1)
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

describe("coverageChipLabel", () => {
  it("formats single and range labels", () => {
    assert.equal(coverageChipLabel({ min: 3, max: 3 }), "Best matches: 3")
    assert.equal(coverageChipLabel({ min: 1, max: 4 }), "Best matches: 1–4")
  })

  it("formats multi-selected segments", () => {
    assert.equal(
      coverageChipLabel({
        min: 1,
        max: 5,
        segments: [
          { min: 1, max: 1 },
          { min: 5, max: 5 },
        ],
      }),
      "Best matches: 1, 5",
    )
  })
})

describe("namesMatchedChipLabel", () => {
  it("shows idle prompt for null/default", () => {
    assert.equal(namesMatchedChipLabel(null, 99), "Best matches")
    assert.equal(namesMatchedChipLabel({ min: 1, max: 99 }, 99), "Best matches")
  })

  it("lists multi-selected bins without of-N", () => {
    assert.equal(
      namesMatchedChipLabel(
        {
          min: 1,
          max: 5,
          segments: [
            { min: 1, max: 1 },
            { min: 3, max: 3 },
            { min: 5, max: 5 },
          ],
        },
        99,
      ),
      "Best matches: 1, 3, 5",
    )
  })
})
