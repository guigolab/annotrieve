import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"

import {
  buildGeneSetEditorRows,
  formatGeneSetChipLabel,
  formatScopeSummary,
  planOpenPrefix,
} from "./gene-set"

describe("planOpenPrefix", () => {
  it("opens empty when the draft is blank", () => {
    assert.deepEqual(planOpenPrefix(""), {
      mode: "empty",
      seed: "",
      exactToCommit: [],
      leaveQueryText: "",
    })
    assert.deepEqual(planOpenPrefix("   "), {
      mode: "empty",
      seed: "",
      exactToCommit: [],
      leaveQueryText: "",
    })
  })

  it("with a * token commits exacts and leaves prefixes", () => {
    assert.deepEqual(planOpenPrefix("TP53, seleno*"), {
      mode: "prefix-token",
      seed: "seleno",
      exactToCommit: ["TP53"],
      leaveQueryText: "seleno*",
    })
  })

  it("prefix-only does not commit and seeds the stem", () => {
    assert.deepEqual(planOpenPrefix("seleno*"), {
      mode: "prefix-token",
      seed: "seleno",
      exactToCommit: [],
      leaveQueryText: "seleno*",
    })
  })

  it("bare stem does not commit; seeds the first token", () => {
    assert.deepEqual(planOpenPrefix("seleno"), {
      mode: "bare-stem",
      seed: "seleno",
      exactToCommit: [],
      leaveQueryText: "seleno",
    })
  })

  it("multiple bare stems still do not commit", () => {
    const plan = planOpenPrefix("TP53 BRCA1")
    assert.equal(plan.mode, "bare-stem")
    assert.equal(plan.seed, "TP53")
    assert.deepEqual(plan.exactToCommit, [])
    assert.equal(plan.leaveQueryText, "TP53 BRCA1")
  })
})

describe("formatScopeSummary", () => {
  it("defaults to All eukaryotes", () => {
    assert.equal(formatScopeSummary([], []), "All eukaryotes")
  })

  it("lists includes and excluded with a minus", () => {
    assert.equal(
      formatScopeSummary(
        [{ taxid: 33208, label: "Metazoa" }],
        [{ taxid: 8782, label: "Aves" }],
      ),
      "Metazoa, −Aves",
    )
  })
})

describe("buildGeneSetEditorRows", () => {
  const hits: HitTerm[] = [
    { input: "TP53", name: "TP53", namespaces: ["symbol"], n_hits: 100 },
    { input: "FOO1", name: "FOO1", namespaces: ["symbol"], n_hits: 0 },
    { input: "BRCA1", name: "BRCA1", namespaces: ["alias"], n_hits: 50 },
  ]
  const active: ResolvedTerm[] = [
    {
      name: "TP53",
      id: "tp53",
      termIndex: 0,
      viaAlias: false,
      count: 4980,
    },
    {
      name: "BRCA1",
      id: "brca1",
      termIndex: 2,
      viaAlias: true,
      count: 5012,
    },
  ]

  it("sorts by count descending with zero-hit last", () => {
    const rows = buildGeneSetEditorRows(
      ["FOO1", "TP53", "BRCA1"],
      hits,
      active,
    )
    assert.deepEqual(
      rows.map((r) => r.name),
      ["BRCA1", "TP53", "FOO1"],
    )
    assert.equal(rows[0]!.viaAlias, true)
    assert.equal(rows[0]!.count, 5012)
    assert.equal(rows[2]!.zeroHits, true)
  })
})

describe("formatGeneSetChipLabel", () => {
  it("shows Genes when empty", () => {
    assert.equal(formatGeneSetChipLabel([]), "Genes")
  })

  it("lists up to three names then +N", () => {
    assert.equal(formatGeneSetChipLabel(["A", "B"]), "A, B")
    assert.equal(
      formatGeneSetChipLabel(["A", "B", "C", "D", "E"]),
      "A, B, C +2",
    )
  })
})
