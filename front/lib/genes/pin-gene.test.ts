import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"

import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import {
  mockJsonResponse,
  uninstallFetchMock,
  withFetchHandler,
} from "@/lib/test/mock-fetch"
import { useCompareStore } from "@/lib/genes/compare-store"
import {
  findPinByGeneName,
  pinInputFromGene,
  pinnedKeys,
  resolveAndTogglePin,
  resolveGenesForNames,
} from "@/lib/genes/pin-gene"

function gene(
  partial: Partial<AnnotationGeneRow> & Pick<AnnotationGeneRow, "local_id">,
): AnnotationGeneRow {
  return {
    feature_type: "gene",
    seqid: "chr1",
    start: 1,
    end: 100,
    strand: "+",
    biotype: null,
    primary_name: "TP53",
    ...partial,
  }
}

afterEach(() => {
  uninstallFetchMock()
})

describe("pinInputFromGene / pinnedKeys", () => {
  it("includes alias matches, primary name, and fallback in queryNames", () => {
    const input = pinInputFromGene(
      "ann-1",
      "Homo sapiens",
      1,
      gene({
        local_id: 7,
        primary_name: "TP53",
        matches: [
          { input: "P53", name: "TP53", ns: "symbol" },
          { input: "tp53", name: "TP53", ns: "symbol" },
        ],
      }),
      "P53",
    )
    assert.ok(input)
    assert.deepEqual(input!.queryNames, ["p53", "tp53"])
  })

  it("pinnedKeys lights up alias and primary columns", () => {
    const input = pinInputFromGene(
      "ann-1",
      "Homo sapiens",
      1,
      gene({
        local_id: 7,
        primary_name: "TP53",
        matches: [{ input: "P53", name: "TP53", ns: "symbol" }],
      }),
      "P53",
    )
    assert.ok(input)
    useCompareStore.setState({ pins: [], pinMode: "inspect" })
    useCompareStore.getState().pinGene(input!)
    const keys = pinnedKeys(useCompareStore.getState().pins)
    assert.equal(keys.has("ann-1\0tp53"), true)
    assert.equal(keys.has("ann-1\0p53"), true)
  })
})

describe("findPinByGeneName", () => {
  beforeEach(() => {
    useCompareStore.setState({
      pins: [],
      pinMode: "inspect",
    })
    useCompareStore.getState().pinGene({
      annotationId: "ann-1",
      localId: 7,
      species: "Homo sapiens",
      source: 1,
      geneName: "TP53",
      queryNames: ["p53", "tp53"],
      seqid: "chr1",
      geneStart: 1,
      geneEnd: 100,
      strand: "+",
      sourceGeneId: null,
    })
  })

  it("matches queryNames and trims the needle", () => {
    const pins = useCompareStore.getState().pins
    assert.ok(findPinByGeneName(pins, "ann-1", "  P53  "))
    assert.ok(findPinByGeneName(pins, "ann-1", "TP53"))
    assert.equal(findPinByGeneName(pins, "ann-1", "BRCA1"), undefined)
  })
})

describe("resolveGenesForNames", () => {
  it("groups by matches.input, marks ambiguous and missing", async () => {
    withFetchHandler(() =>
      mockJsonResponse({
        total: 3,
        limit: 20,
        offset: 0,
        results: [
          gene({
            local_id: 1,
            primary_name: "TP53",
            matches: [{ input: "p53", name: "TP53", ns: "symbol" }],
          }),
          gene({
            local_id: 2,
            primary_name: "TP53",
            seqid: "chr17",
            matches: [{ input: "p53", name: "TP53", ns: "symbol" }],
          }),
          gene({
            local_id: 3,
            primary_name: "BRCA1",
            matches: [{ input: "brca1", name: "BRCA1", ns: "symbol" }],
          }),
        ],
      }),
    )

    const resolved = await resolveGenesForNames("ann-1", [
      " P53 ",
      "BRCA1",
      "MISSING",
    ])
    assert.equal(resolved.byName.has("p53"), true)
    assert.equal(resolved.byName.get("p53")!.local_id, 1)
    assert.equal(resolved.byName.has("brca1"), true)
    assert.deepEqual(resolved.ambiguousNames, ["p53"])
    assert.deepEqual(resolved.missingNames, ["missing"])
  })
})

describe("resolveAndTogglePin", () => {
  beforeEach(() => {
    useCompareStore.setState({
      pins: [],
      pinMode: "inspect",
    })
  })

  it("unpins via unpinMatching without a network call when already pinned", async () => {
    useCompareStore.getState().pinGene({
      annotationId: "ann-1",
      localId: 7,
      species: "Homo sapiens",
      source: 1,
      geneName: "TP53",
      queryNames: ["p53", "tp53"],
      seqid: "chr1",
      geneStart: 1,
      geneEnd: 100,
      strand: "+",
      sourceGeneId: null,
    })
    let fetched = false
    withFetchHandler(() => {
      fetched = true
      return mockJsonResponse({ total: 0, limit: 1, offset: 0, results: [] })
    })

    const result = await resolveAndTogglePin({
      annotationId: "ann-1",
      species: "Homo sapiens",
      source: 1,
      geneName: "  P53  ",
    })
    assert.equal(result.status, "unpinned")
    if (result.status === "unpinned") assert.equal(result.removed, 1)
    assert.equal(useCompareStore.getState().pins.length, 0)
    assert.equal(fetched, false)
  })

  it("pins the first locus and reports ambiguous", async () => {
    withFetchHandler(() =>
      mockJsonResponse({
        total: 2,
        limit: 10,
        offset: 0,
        results: [
          gene({
            local_id: 1,
            primary_name: "TP53",
            matches: [{ input: "p53", name: "TP53", ns: "symbol" }],
          }),
          gene({
            local_id: 2,
            primary_name: "TP53",
            seqid: "chr17",
            matches: [{ input: "p53", name: "TP53", ns: "symbol" }],
          }),
        ],
      }),
    )

    const result = await resolveAndTogglePin({
      annotationId: "ann-1",
      species: "Homo sapiens",
      source: 1,
      geneName: "P53",
    })
    assert.equal(result.status, "pinned")
    if (result.status === "pinned") assert.equal(result.ambiguous, 1)
    assert.equal(useCompareStore.getState().pins.length, 1)
    assert.equal(useCompareStore.getState().pins[0]!.localId, 1)
  })
})
