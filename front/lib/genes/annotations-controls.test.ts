import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cycleAnnotationsSort,
  parseAnnotationsSort,
  parseAnnotationsSortDir,
  primarySortDir,
} from "./annotations-controls"

describe("parseAnnotationsSort", () => {
  it("parses coverage, species, and release", () => {
    assert.equal(parseAnnotationsSort("coverage"), "coverage")
    assert.equal(parseAnnotationsSort("species"), "species")
    assert.equal(parseAnnotationsSort("SPECIES"), "species")
    assert.equal(parseAnnotationsSort("release"), "release")
  })

  it("parses none as null and rejects unknowns as undefined", () => {
    assert.equal(parseAnnotationsSort("none"), null)
    assert.equal(parseAnnotationsSort("source"), undefined)
    assert.equal(parseAnnotationsSort(""), undefined)
    assert.equal(parseAnnotationsSort(null), undefined)
    assert.equal(parseAnnotationsSort("bogus"), undefined)
  })
})

describe("parseAnnotationsSortDir", () => {
  it("parses asc and desc", () => {
    assert.equal(parseAnnotationsSortDir("asc"), "asc")
    assert.equal(parseAnnotationsSortDir("DESC"), "desc")
    assert.equal(parseAnnotationsSortDir("nope"), null)
    assert.equal(parseAnnotationsSortDir(null), null)
  })
})

describe("cycleAnnotationsSort", () => {
  it("activates primary dir on a new column", () => {
    assert.deepEqual(
      cycleAnnotationsSort(
        { sort: "coverage", sortDir: "desc" },
        "species",
      ),
      { sort: "species", sortDir: "asc" },
    )
    assert.equal(primarySortDir("release"), "desc")
    assert.deepEqual(
      cycleAnnotationsSort({ sort: null, sortDir: "desc" }, "release"),
      { sort: "release", sortDir: "desc" },
    )
  })

  it("flips then clears on repeated clicks", () => {
    const first = cycleAnnotationsSort(
      { sort: "coverage", sortDir: "desc" },
      "coverage",
    )
    assert.deepEqual(first, { sort: "coverage", sortDir: "asc" })
    const second = cycleAnnotationsSort(first, "coverage")
    assert.deepEqual(second, { sort: null, sortDir: "desc" })
  })
})
