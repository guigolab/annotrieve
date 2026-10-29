import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DEFAULT_VIEW,
  parseView,
  resolveViewFromUrl,
} from "./view"

describe("parseView", () => {
  it("accepts the three allow-listed values", () => {
    assert.equal(parseView("distribution"), "distribution")
    assert.equal(parseView("annotations"), "annotations")
    assert.equal(parseView("compare"), "compare")
  })

  it("is case-insensitive and trims", () => {
    assert.equal(parseView(" Annotations "), "annotations")
  })

  it("returns null for missing or invalid values", () => {
    assert.equal(parseView(null), null)
    assert.equal(parseView(undefined), null)
    assert.equal(parseView(""), null)
    assert.equal(parseView("heatmap"), null)
  })
})

describe("resolveViewFromUrl", () => {
  it("prefers an explicit valid view", () => {
    assert.equal(
      resolveViewFromUrl({ view: "compare", ann: "ann-1" }),
      "compare",
    )
  })

  it("falls back to annotations when ann is present and view is missing", () => {
    assert.equal(
      resolveViewFromUrl({ view: null, ann: "ann-1" }),
      "annotations",
    )
  })

  it("defaults to distribution", () => {
    assert.equal(
      resolveViewFromUrl({ view: null, ann: null }),
      DEFAULT_VIEW,
    )
  })
})
