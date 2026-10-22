import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { AnnotationGeneRow } from "@/lib/api/xrefs-types"
import { sortGenesByMatches } from "./sort"

function gene(
  localId: number,
  name: string,
  matches: AnnotationGeneRow["matches"],
): AnnotationGeneRow {
  return {
    local_id: localId,
    source_gene_id: `g${localId}`,
    feature_type: "gene",
    seqid: "chr1",
    start: 1,
    end: 100,
    strand: "+",
    biotype: null,
    primary_name: name,
    prose: null,
    prose_kind: null,
    matches,
  }
}

describe("sortGenesByMatches", () => {
  it("orders by distinct inputs descending", () => {
    const rows = [
      gene(1, "A", [{ input: "tp53", name: "TP53", ns: "symbol" }]),
      gene(2, "B", [
        { input: "tp53", name: "TP53", ns: "symbol" },
        { input: "p53", name: "TP53", ns: "alias" },
      ]),
      gene(3, "C", []),
    ]
    const sorted = sortGenesByMatches(rows)
    assert.deepEqual(
      sorted.map((g) => g.local_id),
      [2, 1, 3],
    )
  })

  it("breaks ties by primary_name then local_id", () => {
    const rows = [
      gene(3, "Zed", [{ input: "x", name: "X", ns: "symbol" }]),
      gene(1, "Amy", [{ input: "x", name: "X", ns: "symbol" }]),
      gene(2, "Amy", [{ input: "x", name: "X", ns: "symbol" }]),
    ]
    const sorted = sortGenesByMatches(rows)
    assert.deepEqual(
      sorted.map((g) => g.local_id),
      [1, 2, 3],
    )
  })
})
