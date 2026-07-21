import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinCsv, splitCsv } from "./csv-list"

describe("joinCsv", () => {
  it("joins simple values without quotes", () => {
    assert.equal(joinCsv(["NCBI", "Ensembl"]), "NCBI,Ensembl")
  })

  it("quotes values containing commas", () => {
    assert.equal(
      joinCsv(["Hiller Lab, Senckenberg Research Institute"]),
      '"Hiller Lab, Senckenberg Research Institute"'
    )
  })

  it("quotes and escapes embedded quotes", () => {
    assert.equal(joinCsv(['Foo "Bar", Baz']), '"Foo ""Bar"", Baz"')
  })

  it("mixes quoted and unquoted", () => {
    assert.equal(
      joinCsv(["Hiller Lab, Senckenberg Research Institute", "NCBI"]),
      '"Hiller Lab, Senckenberg Research Institute",NCBI'
    )
  })

  it("does not quote slash-only values", () => {
    assert.equal(joinCsv(["HHMI/UCSF"]), "HHMI/UCSF")
  })
})

describe("splitCsv", () => {
  it("splits simple multi", () => {
    assert.deepEqual(splitCsv("NCBI,Ensembl"), ["NCBI", "Ensembl"])
  })

  it("trims spaces after commas", () => {
    assert.deepEqual(splitCsv("NCBI, Ensembl"), ["NCBI", "Ensembl"])
  })

  it("keeps quoted comma value as one field", () => {
    assert.deepEqual(splitCsv('"Hiller Lab, Senckenberg Research Institute"'), [
      "Hiller Lab, Senckenberg Research Institute",
    ])
  })

  it("parses mixed quoted and unquoted", () => {
    assert.deepEqual(splitCsv('"Hiller Lab, Senckenberg Research Institute",NCBI'), [
      "Hiller Lab, Senckenberg Research Institute",
      "NCBI",
    ])
  })

  it("preserves slash in unquoted value", () => {
    assert.deepEqual(splitCsv("HHMI/UCSF"), ["HHMI/UCSF"])
  })

  it("parses quoted slash+comma value", () => {
    assert.deepEqual(splitCsv('"INRA/CNRS, France"'), ["INRA/CNRS, France"])
  })

  it("unescapes embedded quotes", () => {
    assert.deepEqual(splitCsv('"Foo ""Bar"", Baz"'), ['Foo "Bar", Baz'])
  })

  it("returns empty for null/empty", () => {
    assert.deepEqual(splitCsv(null), [])
    assert.deepEqual(splitCsv(""), [])
    assert.deepEqual(splitCsv("   "), [])
  })
})

describe("joinCsv/splitCsv round-trip", () => {
  it("round-trips comma and slash providers", () => {
    const values = [
      "Hiller Lab, Senckenberg Research Institute",
      "HHMI/UCSF",
      "NCBI",
    ]
    assert.deepEqual(splitCsv(joinCsv(values)), values)
  })
})
