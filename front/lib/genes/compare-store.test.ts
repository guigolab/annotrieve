import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import {
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
      transcriptMode: "longest",
    })
  })

  it("pinGene accepts more than the former cap of 6", () => {
    for (let i = 1; i <= 8; i++) {
      assert.equal(useCompareStore.getState().pinGene(pin(i)), true)
    }
    assert.equal(useCompareStore.getState().pins.length, 8)
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

  it("setTranscriptMode longest clears transcriptIds", () => {
    useCompareStore.getState().pinGene(pin(1))
    useCompareStore.getState().setPinTranscript(
      pinIdFor("ann-1", 1),
      "tx-1",
    )
    useCompareStore.getState().setTranscriptMode("choose")
    assert.equal(useCompareStore.getState().transcriptMode, "choose")
    assert.equal(
      useCompareStore.getState().pins[0]!.transcriptId,
      "tx-1",
    )
    useCompareStore.getState().setTranscriptMode("longest")
    assert.equal(useCompareStore.getState().transcriptMode, "longest")
    assert.equal(useCompareStore.getState().pins[0]!.transcriptId, null)
  })
})
