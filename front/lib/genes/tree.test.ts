import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { FlatTreeNode } from "@/lib/api/taxons"
import type { DecodedHitRow } from "@/lib/genes/hits"

import {
  GENES_VIEW_RANKS,
  HIT_TREE_MAX_DEPTH,
  allowedGenesViewRanks,
  buildHitTree,
  hitRankStats,
  truncateHitTreeDepth,
  type HitTreeNode,
} from "./tree"

function node(
  id: string,
  count: number,
  children: HitTreeNode[] = [],
): HitTreeNode {
  return {
    id,
    label: id,
    rank: null,
    children,
    count,
    sources: [],
  }
}

function maxChildDepth(roots: HitTreeNode[]): number {
  let max = 0
  const walk = (n: HitTreeNode, depth: number) => {
    if (n.children.length) {
      max = Math.max(max, depth + 1)
      for (const c of n.children) walk(c, depth + 1)
    }
  }
  for (const r of roots) walk(r, 0)
  return max
}

function mkTaxon(
  id: string,
  parentId: string | null,
  name: string,
  rank: string,
): FlatTreeNode {
  return {
    id,
    parentId,
    scientific_name: name,
    rank,
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
  }
}

function lineageIndex(): Map<string, FlatTreeNode> {
  const map = new Map<string, FlatTreeNode>()
  map.set("2759", mkTaxon("2759", "131567", "Eukaryota", "domain"))
  map.set("33208", mkTaxon("33208", "2759", "Metazoa", "kingdom"))
  map.set("7711", mkTaxon("7711", "33208", "Chordata", "phylum"))
  map.set("40674", mkTaxon("40674", "7711", "Mammalia", "class"))
  map.set("9443", mkTaxon("9443", "40674", "Primates", "order"))
  map.set("9604", mkTaxon("9604", "9443", "Hominidae", "family"))
  map.set("9605", mkTaxon("9605", "9604", "Homo", "genus"))
  map.set("9606", mkTaxon("9606", "9605", "Homo sapiens", "species"))
  map.set("10090", mkTaxon("10090", "10088", "Mus musculus", "species"))
  map.set("10088", mkTaxon("10088", "10027", "Mus", "genus"))
  map.set("10027", mkTaxon("10027", "314147", "Muridae", "family"))
  map.set("314147", mkTaxon("314147", "40674", "Rodentia", "order"))
  return map
}

function row(taxid: number, annotationId: string): DecodedHitRow {
  return {
    annotationId,
    taxid,
    source: 1,
    matchedTerms: [0],
    releaseDate: null,
    assemblyName: null,
  }
}

describe("truncateHitTreeDepth", () => {
  it("clears children at max depth and keeps rolled-up counts", () => {
    // root(0) → d1(1) → d2(2) → d3(3) → d4(4) → d5 (trimmed)
    const deep = node("root", 10, [
      node("d1", 10, [
        node("d2", 10, [
          node("d3", 10, [
            node("d4", 10, [node("d5", 5, [node("d6", 1)])]),
          ]),
        ]),
      ]),
    ])
    const truncated = truncateHitTreeDepth([deep], HIT_TREE_MAX_DEPTH)
    assert.equal(maxChildDepth(truncated), HIT_TREE_MAX_DEPTH)
    let atCap = truncated[0]!
    for (let i = 0; i < HIT_TREE_MAX_DEPTH; i++) {
      atCap = atCap.children[0]!
    }
    assert.equal(atCap.id, "d4")
    assert.equal(atCap.children.length, 0)
    assert.equal(atCap.count, 10)
  })

  it("leaves shallow trees unchanged in structure", () => {
    const shallow = node("root", 3, [node("child", 3)])
    const truncated = truncateHitTreeDepth([shallow], HIT_TREE_MAX_DEPTH)
    assert.equal(truncated[0]!.children[0]!.id, "child")
    assert.equal(truncated[0]!.children[0]!.children.length, 0)
  })
})

describe("allowedGenesViewRanks", () => {
  const index = lineageIndex()

  it("returns kingdom…genus with no includes", () => {
    const { ranks, mixed, floor } = allowedGenesViewRanks([], index)
    assert.deepEqual([...ranks], [...GENES_VIEW_RANKS])
    assert.equal(mixed, false)
    assert.equal(floor, null)
  })

  it("returns ranks strictly below a shared include rank", () => {
    const { ranks, mixed, floor } = allowedGenesViewRanks([40674], index)
    assert.equal(floor, "class")
    assert.equal(mixed, false)
    assert.deepEqual([...ranks], ["order", "family", "genus"])
  })

  it("marks mixed when include taxids span different ranks", () => {
    const { ranks, mixed } = allowedGenesViewRanks([40674, 9443], index)
    assert.equal(mixed, true)
    assert.equal(ranks.length, 0)
  })
})

describe("buildHitTree viewRank", () => {
  const index = lineageIndex()
  const rows = [row(9606, "a"), row(10090, "b")]

  it("re-roots at the selected rank and still depth-caps", () => {
    const tree = buildHitTree(rows, index, [], "order")
    const rootIds = tree.roots.map((r) => r.id).sort()
    assert.deepEqual(rootIds, ["314147", "9443"])
    assert.ok(tree.roots.every((r) => r.rank === "order"))
    assert.ok(maxChildDepth(tree.roots) <= HIT_TREE_MAX_DEPTH)
  })

  it("keeps auto roots when viewRank is null", () => {
    const tree = buildHitTree(rows, index, [])
    assert.ok(tree.roots.some((r) => r.id === "33208"))
  })
})

describe("hitRankStats", () => {
  it("counts taxa, annotations, and organisms per rank", () => {
    const index = lineageIndex()
    const rows = [row(9606, "a"), row(9606, "a2"), row(10090, "b")]
    const stats = hitRankStats(rows, index, [])
    const order = stats.find((s) => s.rank === "order")
    assert.ok(order)
    assert.equal(order!.taxonCount, 2)
    assert.equal(order!.organismCount, 2)
    assert.equal(order!.annotationCount, 3)
    const genus = stats.find((s) => s.rank === "genus")
    assert.ok(genus)
    assert.equal(genus!.taxonCount, 2)
    assert.equal(genus!.organismCount, 2)
    assert.equal(genus!.annotationCount, 3)
  })
})
