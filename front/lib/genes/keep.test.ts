import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { FlatTreeNode } from "@/lib/api/taxons"
import type { DecodedHitRow } from "@/lib/genes/hits"

import {
  applyKeep,
  AUTO_GROUP_MIN_ROWS,
  buildGroupedRows,
  pickAutoGroupRank,
  type ScoredAnnotation,
} from "./keep"

function row(
  id: string,
  taxid: number,
  source: number,
  releaseDate: string | null,
): DecodedHitRow {
  return {
    annotationId: id,
    taxid,
    source,
    matchedTerms: [],
    releaseDate,
    assemblyName: null,
  }
}

function scored(
  id: string,
  taxid: number,
  source: number,
  k: number,
  speciesId: number,
  releaseDate: string | null = null,
): ScoredAnnotation {
  return {
    row: row(id, taxid, source, releaseDate),
    k,
    speciesId,
    speciesLabel: `sp-${speciesId}`,
  }
}

describe("applyKeep", () => {
  it("best keeps highest k per species; ties prefer newest then id", () => {
    const rows = [
      scored("a", 1, 1, 2, 100, "2020-01-01"),
      scored("b", 2, 1, 3, 100, "2019-01-01"),
      scored("c", 3, 2, 3, 100, "2021-01-01"),
      scored("d", 4, 1, 1, 200, null),
    ]
    const kept = applyKeep(rows, "best")
    assert.equal(kept.length, 2)
    const bySp = new Map(kept.map((r) => [r.speciesId, r]))
    assert.equal(bySp.get(100)!.row.annotationId, "c")
    assert.equal(bySp.get(200)!.row.annotationId, "d")
  })

  it("latest keeps one per species × source", () => {
    const rows = [
      scored("a", 1, 1, 1, 100, "2020-01-01"),
      scored("b", 1, 1, 1, 100, "2022-01-01"),
      scored("c", 1, 2, 1, 100, "2021-01-01"),
    ]
    const kept = applyKeep(rows, "latest")
    assert.equal(kept.length, 2)
    const ids = kept.map((r) => r.row.annotationId).sort()
    assert.deepEqual(ids, ["b", "c"])
  })

  it("all is identity", () => {
    const rows = [scored("a", 1, 1, 1, 1), scored("b", 2, 1, 1, 2)]
    assert.equal(applyKeep(rows, "all").length, 2)
  })
})

describe("pickAutoGroupRank", () => {
  it("returns null below AUTO_GROUP_MIN_ROWS", () => {
    const rows = Array.from({ length: AUTO_GROUP_MIN_ROWS - 1 }, (_, i) =>
      scored(`a${i}`, i + 1, 1, 1, i + 1),
    )
    assert.equal(pickAutoGroupRank(rows, new Map()), null)
  })
})

describe("buildGroupedRows", () => {
  it("emits no headers when group is none", () => {
    const rows = [scored("a", 1, 1, 2, 1), scored("b", 2, 1, 1, 2)]
    const out = buildGroupedRows(rows, "none", "coverage", new Map())
    assert.equal(out.every((r) => r.kind === "annotation"), true)
    assert.equal(out[0]!.kind === "annotation" && out[0].item.k, 2)
  })

  it("inserts group headers for an explicit rank", () => {
    const index = new Map<string, FlatTreeNode>([
      [
        "10",
        {
          id: "10",
          parentId: null,
          scientific_name: "Primates",
          rank: "order",
          annotations_count: 0,
          assemblies_count: 0,
          organisms_count: 0,
          coding_count: 0,
          non_coding_count: 0,
          pseudogene_count: 0,
          mrna_count: 0,
          lncrna_count: 0,
          trna_count: 0,
          mirna_count: 0,
          busco_single_copy_mean: 0,
          busco_duplicated_mean: 0,
          busco_fragmented_mean: 0,
          busco_missing_mean: 0,
        },
      ],
      [
        "9606",
        {
          id: "9606",
          parentId: "10",
          scientific_name: "Homo sapiens",
          rank: "species",
          annotations_count: 0,
          assemblies_count: 0,
          organisms_count: 0,
          coding_count: 0,
          non_coding_count: 0,
          pseudogene_count: 0,
          mrna_count: 0,
          lncrna_count: 0,
          trna_count: 0,
          mirna_count: 0,
          busco_single_copy_mean: 0,
          busco_duplicated_mean: 0,
          busco_fragmented_mean: 0,
          busco_missing_mean: 0,
        },
      ],
    ])
    const rows = [scored("a", 9606, 1, 1, 9606)]
    const out = buildGroupedRows(rows, "order", "coverage", index)
    assert.equal(out[0]!.kind, "group")
    assert.equal(out[0]!.kind === "group" && out[0].label, "Primates")
    assert.equal(out[1]!.kind, "annotation")
  })
})
