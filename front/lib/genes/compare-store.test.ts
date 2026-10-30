import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import {
  MAX_PINS,
  pinIdFor,
  useCompareStore,
  type PinGeneInput,
} from "./compare-store"

function pin(n: number): PinGeneInput {
  return {
    annotationId: `ann-${n}`,
    localId: n,
    species: `Species ${n}`,
    source: 1,
    geneName: `GENE${n}`,
    seqid: "chr1",
    geneStart: 1,
    geneEnd: 100,
    strand: "+",
    sourceGeneId: null,
  }
}

describe("compare-store", () => {
  beforeEach(() => {
    useCompareStore.setState({
      pins: [],
      pinMode: "inspect",
    })
  })

  it("pinGene accepts up to MAX_PINS", () => {
    for (let i = 1; i <= MAX_PINS; i++) {
      assert.equal(useCompareStore.getState().pinGene(pin(i)), true)
    }
    assert.equal(useCompareStore.getState().pins.length, MAX_PINS)
    assert.equal(useCompareStore.getState().pinGene(pin(MAX_PINS + 1)), false)
    assert.equal(useCompareStore.getState().pins.length, MAX_PINS)
  })

  it("pinGene dedupes by id", () => {
    assert.equal(useCompareStore.getState().pinGene(pin(1)), true)
    assert.equal(useCompareStore.getState().pinGene(pin(1)), true)
    assert.equal(useCompareStore.getState().pins.length, 1)
    assert.equal(
      useCompareStore.getState().pins[0]!.id,
      pinIdFor("ann-1", 1),
    )
  })

  it("setPins restores a snapshot", () => {
    useCompareStore.getState().pinGene(pin(1))
    useCompareStore.getState().pinGene(pin(2))
    const snap = [...useCompareStore.getState().pins]
    useCompareStore.getState().clearPins()
    assert.equal(useCompareStore.getState().pins.length, 0)
    useCompareStore.getState().setPins(snap)
    assert.equal(useCompareStore.getState().pins.length, 2)
    assert.equal(useCompareStore.getState().pins[0]!.geneName, "GENE1")
  })

  it("setPinTranscript sets and clears transcriptId", () => {
    useCompareStore.getState().pinGene(pin(1))
    const id = pinIdFor("ann-1", 1)
    useCompareStore.getState().setPinTranscript(id, "tx-1")
    assert.equal(useCompareStore.getState().pins[0]!.transcriptId, "tx-1")
    useCompareStore.getState().setPinTranscript(id, null)
    assert.equal(useCompareStore.getState().pins[0]!.transcriptId, null)
  })

  it("pinMany dedupes and respects MAX_PINS", () => {
    const { added, truncated } = useCompareStore.getState().pinMany([
      pin(1),
      pin(1),
      pin(2),
    ])
    assert.equal(added, 2)
    assert.equal(truncated, false)
    assert.equal(useCompareStore.getState().pins.length, 2)
    assert.deepEqual(useCompareStore.getState().pins[0]!.queryNames, [
      "gene1",
    ])

    const many = Array.from({ length: MAX_PINS + 5 }, (_, i) => pin(i + 10))
    const again = useCompareStore.getState().pinMany(many)
    assert.equal(again.truncated, true)
    assert.equal(useCompareStore.getState().pins.length, MAX_PINS)
  })

  it("unpinMatching removes by queryNames or geneName", () => {
    useCompareStore.getState().pinGene({
      ...pin(1),
      geneName: "TP53",
      queryNames: ["p53", "tp53"],
    })
    useCompareStore.getState().pinGene(pin(2))
    assert.equal(
      useCompareStore.getState().unpinMatching("ann-1", "P53"),
      1,
    )
    assert.equal(useCompareStore.getState().pins.length, 1)
    assert.equal(useCompareStore.getState().pins[0]!.geneName, "GENE2")
  })

  it("setPinMode updates session pinMode", () => {
    assert.equal(useCompareStore.getState().pinMode, "inspect")
    useCompareStore.getState().setPinMode("pin")
    assert.equal(useCompareStore.getState().pinMode, "pin")
  })
})
