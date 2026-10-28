import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { HitsResponse } from "@/lib/api/xrefs-types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import { createClientHitsAdapter } from "./adapter"
import { makeFilter } from "./filters"

function hits(): HitsResponse {
  return {
    terms: [
      {
        input: "TP53",
        name: "tp53",
        namespaces: ["symbol"],
        n_hits: 2,
      },
      {
        input: "BRCA1",
        name: "brca1",
        namespaces: ["symbol"],
        n_hits: 1,
      },
      {
        input: "EGFR",
        name: "egfr",
        namespaces: ["symbol"],
        n_hits: 1,
      },
    ],
    sources: {
      "1": { label: "Ensembl" },
      "3": { label: "RefSeq" },
    },
    include_taxids: [],
    exclude_taxids: [],
    total: 3,
    fields: [
      "annotation_id",
      "taxid",
      "source",
      "matched",
      "release_date",
      "assembly_name",
    ],
    rows: [
      ["ann-a", 9606, 1, [0, 1], "2024-01-02T00:00:00", "GRCh38.p14"],
      ["ann-b", 9606, 3, [0], null, null],
      ["ann-c", 10090, 1, [0, 2], "2020-06-01", "GRCm39"],
    ],
  }
}

function taxonIndex(): Map<string, FlatTreeNode> {
  const map = new Map<string, FlatTreeNode>()
  const mk = (
    id: string,
    parentId: string | null,
    name: string,
    rank: string,
  ): FlatTreeNode =>
    ({
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
    })
  map.set("2759", mk("2759", "131567", "Eukaryota", "domain"))
  map.set("32525", mk("32525", "2759", "Theria", "no rank"))
  map.set("40674", mk("40674", "32525", "Mammalia", "class"))
  map.set("9443", mk("9443", "40674", "Primates", "order"))
  map.set("9605", mk("9605", "9443", "Homo", "genus"))
  map.set("9606", mk("9606", "9605", "Homo sapiens", "species"))
  map.set("10088", mk("10088", "32525", "Mus", "genus"))
  map.set("10090", mk("10090", "10088", "Mus musculus", "species"))
  return map
}

describe("createClientHitsAdapter", () => {
  it("counts terms and drops excluded from N", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    assert.equal(adapter.termCount(new Set()), 3)
    assert.equal(adapter.termCount(new Set(["egfr"])), 2)
  })

  it("filters annotations by coverage and exclusion", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const page = adapter.annotations(
      makeFilter({
        sources: new Set([1, 2, 3]),
        minMatched: 2,
        maxMatched: 3,
        excludeTerms: new Set(),
        termCount: 3,
      }),
      { limit: 50, offset: 0 },
    )
    // ann-a (2), ann-c (2); ann-b has k=1
    assert.equal(page.total, 2)
    assert.deepEqual(
      page.results.map((r) => r.annotationId).sort(),
      ["ann-a", "ann-c"],
    )
  })

  it("coverage histogram respects exclusion", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const withAll = adapter.coverage(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
      }),
    )
    assert.equal(withAll.termCount, 3)

    const withoutEgfr = adapter.coverage(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(["egfr"]),
        termCount: 2,
        minMatched: 1,
        maxMatched: 2,
      }),
    )
    assert.equal(withoutEgfr.termCount, 2)
    // ann-c matched TP53+EGFR → after excluding EGFR, k=1
    assert.ok(withoutEgfr.matchedCounts.includes(1))
  })

  it("sourceCounts includes disabled sources", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const counts = adapter.sourceCounts(
      makeFilter({
        sources: new Set([1]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
      }),
    )
    assert.equal(counts.get(1), 2)
    assert.equal(counts.get(3), 1)
  })

  it("sourceCounts respects heatmap taxon and name filters", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const human = adapter.sourceCounts(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
        taxid: "9606",
      }),
    )
    assert.equal(human.get(1), 1)
    assert.equal(human.get(3), 1)
    assert.equal(human.get(2) ?? 0, 0)

    const brca1 = adapter.sourceCounts(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
        name: "brca1",
      }),
    )
    assert.equal(brca1.get(1), 1)
    assert.equal(brca1.get(3) ?? 0, 0)
  })

  it("counts unique organism taxids under the filter", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const all = adapter.organismCount(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
      }),
    )
    assert.equal(all, 2) // 9606 and 10090

    const humanOnly = adapter.organismCount(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
        minMatched: 1,
        maxMatched: 3,
        taxid: "9606",
      }),
    )
    assert.equal(humanOnly, 1)
  })

  it("sources and coverage filter the list but not the overview tree", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const overview = makeFilter({
      sources: new Set([1, 2, 3]),
      excludeTerms: new Set(),
      termCount: 3,
      minMatched: 1,
      maxMatched: 3,
    })
    const ensemblOnly = makeFilter({
      sources: new Set([1]),
      excludeTerms: new Set(),
      termCount: 3,
      minMatched: 1,
      maxMatched: 3,
    })
    const strictCoverage = makeFilter({
      sources: new Set([1, 2, 3]),
      excludeTerms: new Set(),
      termCount: 3,
      minMatched: 2,
      maxMatched: 3,
    })

    assert.equal(adapter.annotations(overview, { limit: 50, offset: 0 }).total, 3)
    assert.equal(
      adapter.annotations(ensemblOnly, { limit: 50, offset: 0 }).total,
      2,
    )
    assert.equal(
      adapter.annotations(strictCoverage, { limit: 50, offset: 0 }).total,
      2,
    )
    assert.equal(adapter.organismCount(ensemblOnly), 2)
    assert.equal(adapter.organismCount(strictCoverage), 2)

    const rootCounts = (filter: ReturnType<typeof makeFilter>) =>
      adapter
        .tree(filter)
        .roots.map((r) => `${r.id}:${r.count}`)
        .sort()
        .join("|")

    assert.equal(rootCounts(ensemblOnly), rootCounts(overview))
    assert.equal(rootCounts(strictCoverage), rootCounts(overview))

    const rootId = adapter.tree(overview).roots[0]?.id
    assert.ok(rootId)
    assert.deepEqual(
      adapter.nodeCounts(ensemblOnly, rootId!),
      adapter.nodeCounts(overview, rootId!),
    )
    assert.deepEqual(
      adapter.nodeCounts(strictCoverage, rootId!),
      adapter.nodeCounts(overview, rootId!),
    )
  })

  it("re-roots the overview tree by viewRank", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const overview = makeFilter({
      sources: new Set([1, 2, 3]),
      excludeTerms: new Set(),
      termCount: 3,
    })
    const auto = adapter.tree(overview)
    const byOrder = adapter.tree(overview, "order")
    assert.notEqual(
      auto.roots.map((r) => r.id).join(","),
      byOrder.roots.map((r) => r.id).join(","),
    )
    assert.ok(byOrder.roots.every((r) => (r.rank || "").toLowerCase() === "order"))
    const stats = adapter.rankStats(new Set())
    assert.ok(stats.some((s) => s.rank === "order" && s.organismCount >= 1))
  })

  it("batches overviewRowCounts for visible nodes", () => {
    const adapter = createClientHitsAdapter(hits(), taxonIndex())
    const matrix = adapter.overviewRowCounts(new Set(), ["9443", "40674"], "order")
    assert.equal(matrix.length, 2)
    assert.ok(matrix[0]!.n >= 1)
    assert.equal(matrix[0]!.byName.length, 3)
    // Same result as single-node fold for the first id.
    const single = adapter.nodeCounts(
      makeFilter({
        sources: new Set([1, 2, 3]),
        excludeTerms: new Set(),
        termCount: 3,
      }),
      "9443",
    )
    assert.equal(matrix[0]!.n, single.n)
  })
})
