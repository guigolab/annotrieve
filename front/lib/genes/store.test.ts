import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"

import { EMPTY_LIST_FILTERS } from "./list-filters"
import { EMPTY_SELECTION } from "./selection"
import { activeNames, useGenesStore } from "./store"
import { DEFAULT_COUNT_UNIT } from "./view"

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
      listFilters: { ...EMPTY_LIST_FILTERS },
      annotationsSelection: EMPTY_SELECTION,
      annotationsSelectionAnchor: { row: null, col: null },
      unit: DEFAULT_COUNT_UNIT,
      drawer: null,
      coverage: null,
      excluded: new Set(),
      sources: new Set([1, 2, 3]),
      expanded: new Set(),
    })
  })

  it("setListFilters closes drawer", () => {
    const s = useGenesStore.getState()
    s.openDrawer({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    assert.equal(useGenesStore.getState().drawer?.annotationId, "ann-1")
    useGenesStore.getState().setListFilters({
      ...EMPTY_LIST_FILTERS,
      includeTaxids: ["9606"],
    })
    assert.deepEqual(useGenesStore.getState().listFilters.includeTaxids, [
      "9606",
    ])
    assert.equal(useGenesStore.getState().drawer, null)
  })

  it("setListFilters with cells closes drawer", () => {
    useGenesStore.getState().openDrawer({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    useGenesStore.getState().setDrawerGene(5)
    useGenesStore.getState().setListFilters({
      ...EMPTY_LIST_FILTERS,
      includeCells: [{ taxid: "7742", gene: "TP53" }],
    })
    const st = useGenesStore.getState()
    assert.equal(st.listFilters.includeCells[0]?.taxid, "7742")
    assert.equal(st.drawer, null)
  })

  it("setDrawerGene expands, toggles closed, and closeDrawer clears", () => {
    useGenesStore.getState().openDrawer({
      annotationId: "ann-1",
      species: "Human",
      source: 1,
    })
    useGenesStore.getState().setDrawerGene(5)
    assert.equal(useGenesStore.getState().drawer?.localId, 5)
    useGenesStore.getState().setDrawerGene(5)
    assert.equal(useGenesStore.getState().drawer?.localId, null)
    assert.equal(useGenesStore.getState().drawer?.annotationId, "ann-1")
    useGenesStore.getState().setDrawerGene(7)
    assert.equal(useGenesStore.getState().drawer?.localId, 7)
    useGenesStore.getState().closeDrawer()
    assert.equal(useGenesStore.getState().drawer, null)
  })

  it("setTaxa stores labels and clears list taxid filters", () => {
    useGenesStore.getState().setListFilters({
      ...EMPTY_LIST_FILTERS,
      includeTaxids: ["9606"],
    })
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
    assert.deepEqual(st.listFilters.includeTaxids, [])
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

describe("view", () => {
  beforeEach(() => {
    useGenesStore.setState({
      view: "distribution",
      queryNames: ["TP53"],
      queryText: "",
    })
  })

  it("setView changes the active lens", () => {
    useGenesStore.getState().setView("annotations")
    assert.equal(useGenesStore.getState().view, "annotations")
  })

  it("hydrateFromUrl accepts view", () => {
    useGenesStore.getState().hydrateFromUrl({ view: "compare" })
    assert.equal(useGenesStore.getState().view, "compare")
  })

  it("hydrateFromUrl opens drawer from ann/gene", () => {
    useGenesStore.getState().hydrateFromUrl({
      annotationId: "ann-9",
      localId: 3,
    })
    const d = useGenesStore.getState().drawer
    assert.equal(d?.annotationId, "ann-9")
    assert.equal(d?.localId, 3)
  })

  it("clearGeneSet resets view to distribution", () => {
    useGenesStore.getState().setView("compare")
    useGenesStore.getState().clearGeneSet()
    const st = useGenesStore.getState()
    assert.equal(st.view, "distribution")
    assert.deepEqual(st.queryNames, [])
  })
})

describe("resetViewFilters", () => {
  beforeEach(() => {
    useGenesStore.setState({
      listFilters: {
        ...EMPTY_LIST_FILTERS,
        includeTaxids: ["9606"],
        includeNames: ["TP53"],
      },
      sources: new Set([1]),
      coverage: { min: 2, max: 2 },
      viewRank: "order",
      excluded: new Set(["egfr"]),
      expanded: new Set(["7742"]),
      drawer: {
        annotationId: "ann-1",
        localId: null,
        species: "Human",
        source: 1,
      },
      queryNames: ["TP53", "EGFR"],
      includeTaxa: [],
      excludeTaxa: [],
    })
  })

  it("clears list controls but leaves Distribution viewRank", () => {
    useGenesStore.getState().resetViewFilters()
    const st = useGenesStore.getState()
    assert.deepEqual(st.listFilters, EMPTY_LIST_FILTERS)
    assert.deepEqual([...st.sources].sort(), [1, 2, 3])
    assert.equal(st.coverage, null)
    assert.equal(st.viewRank, "order")
    assert.equal(st.drawer, null)
    assert.equal(st.keep, "all")
    assert.equal(st.search, "")
  })

  it("does not clear the gene set or expanded nodes", () => {
    useGenesStore.getState().resetViewFilters()
    const st = useGenesStore.getState()
    assert.deepEqual(st.queryNames, ["TP53", "EGFR"])
    assert.ok(st.expanded.has("7742"))
  })

  it("clears excluded name filters", () => {
    useGenesStore.getState().resetViewFilters()
    assert.equal(useGenesStore.getState().excluded.size, 0)
  })
})
