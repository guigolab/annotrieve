import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  categoryTint,
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
} from "./gene-category"

describe("geneCategoryOf", () => {
  it("classifies pseudogenes from feature_type or biotype", () => {
    assert.equal(
      geneCategoryOf({ feature_type: "pseudogene", biotype: null }),
      "pseudogene",
    )
    assert.equal(
      geneCategoryOf({ feature_type: "gene", biotype: "transcribed_pseudogene" }),
      "pseudogene",
    )
  })

  it("classifies coding from CDS or protein_coding biotype", () => {
    assert.equal(
      geneCategoryOf({ feature_type: "gene", biotype: "protein_coding" }),
      "coding",
    )
    assert.equal(
      geneCategoryOf({ feature_type: "gene", biotype: "lncRNA", hasCds: true }),
      "coding",
    )
  })

  it("defaults to non-coding", () => {
    assert.equal(
      geneCategoryOf({ feature_type: "gene", biotype: "lncRNA" }),
      "non_coding",
    )
    assert.equal(geneCategoryOf({ feature_type: "gene" }), "non_coding")
  })

  it("prefers pseudogene over CDS", () => {
    assert.equal(
      geneCategoryOf({
        feature_type: "pseudogene",
        biotype: "protein_coding",
        hasCds: true,
      }),
      "pseudogene",
    )
  })
})

describe("GENE_CATEGORY_STYLE", () => {
  it("uses theme tokens for SVG", () => {
    assert.equal(GENE_CATEGORY_STYLE.coding.token, "var(--primary)")
    assert.equal(GENE_CATEGORY_STYLE.non_coding.token, "var(--secondary)")
    assert.equal(GENE_CATEGORY_STYLE.pseudogene.token, "var(--accent)")
  })

  it("builds color-mix tints", () => {
    assert.equal(
      categoryTint("var(--primary)", 55),
      "color-mix(in oklch, var(--primary) 55%, transparent)",
    )
  })
})
