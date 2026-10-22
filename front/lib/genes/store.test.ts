import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"

import { activeNames, useGenesStore } from "./store"

describe("activeNames", () => {
  it("drops excluded", () => {
    assert.deepEqual(
      activeNames(["TP53", "BRCA1", "EGFR"], new Set(["brca1"])),
      ["TP53", "EGFR"],
    )
  })
})

describe("useGenesStore selection", () => {
  beforeEach(() => {
    useGenesStore.setState({
      t: null,
      g: null,
      panel: {
        level: "list",
        annotationId: null,
        localId: null,
        species: null,
        source: null,
      },
      coverage: null,
      excluded: new Set(),
      sources: new Set([1, 2, 3]),
      expanded: new Set(),
    })
  })

  it("toggles taxon and resets panel", () => {
    const s = useGenesStore.getState()
    s.openAnnotation({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    assert.equal(useGenesStore.getState().panel.level, "annotation")
    useGenesStore.getState().selectTaxon("9606")
    assert.equal(useGenesStore.getState().t, "9606")
    assert.equal(useGenesStore.getState().panel.level, "list")
    useGenesStore.getState().selectTaxon("9606")
    assert.equal(useGenesStore.getState().t, null)
  })

  it("selectCell sets both and resets stack", () => {
    useGenesStore.getState().openAnnotation({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    useGenesStore.getState().openGene(5)
    useGenesStore.getState().selectCell("7742", "TP53")
    const st = useGenesStore.getState()
    assert.equal(st.t, "7742")
    assert.equal(st.g, "TP53")
    assert.equal(st.panel.level, "list")
  })

  it("popPanel walks gene -> annotation -> list", () => {
    useGenesStore.getState().openAnnotation({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    useGenesStore.getState().openGene(5)
    useGenesStore.getState().popPanel()
    assert.equal(useGenesStore.getState().panel.level, "annotation")
    useGenesStore.getState().popPanel()
    assert.equal(useGenesStore.getState().panel.level, "list")
  })

  it("setTaxa stores labels and clears selection", () => {
    useGenesStore.getState().selectTaxon("9606")
    useGenesStore.getState().setTaxa(
      [{ taxid: 9606, label: "Homo sapiens" }],
      [{ taxid: 7227, label: "Drosophila melanogaster" }],
    )
    const st = useGenesStore.getState()
    assert.deepEqual(st.includeTaxa, [
      { taxid: 9606, label: "Homo sapiens" },
    ])
    assert.deepEqual(st.excludeTaxa, [
      { taxid: 7227, label: "Drosophila melanogaster" },
    ])
    assert.equal(st.t, null)
  })

  it("relabelTaxa updates labels from the tree", () => {
    useGenesStore.getState().setTaxa(
      [{ taxid: 9606, label: "9606" }],
      [],
    )
    useGenesStore.getState().relabelTaxa((id) =>
      id === 9606 ? "Homo sapiens" : undefined,
    )
    assert.equal(
      useGenesStore.getState().includeTaxa[0]?.label,
      "Homo sapiens",
    )
  })
})
