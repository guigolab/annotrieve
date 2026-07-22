import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  EMPTY_FILTERS_STATE,
  filtersStateHasActive,
  pickFiltersState,
} from "./stores/analytics-current-filters"

describe("analytics-current-filters helpers", () => {
  it("pickFiltersState clones arrays", () => {
    const taxons = [{ taxid: "9606", scientific_name: "Homo sapiens" }]
    const picked = pickFiltersState({
      ...EMPTY_FILTERS_STATE,
      selectedTaxons: taxons,
      biotypes: ["protein_coding"],
    })
    assert.deepEqual(picked.selectedTaxons, taxons)
    assert.notEqual(picked.selectedTaxons, taxons)
    assert.deepEqual(picked.biotypes, ["protein_coding"])
    taxons.push({ taxid: "10090", scientific_name: "Mus musculus" })
    assert.equal(picked.selectedTaxons.length, 1)
  })

  it("filtersStateHasActive detects empty and active", () => {
    assert.equal(filtersStateHasActive(null), false)
    assert.equal(filtersStateHasActive(EMPTY_FILTERS_STATE), false)
    assert.equal(
      filtersStateHasActive({
        ...EMPTY_FILTERS_STATE,
        biotypes: ["lncRNA"],
      }),
      true
    )
  })
})
