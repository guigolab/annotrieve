import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  cdsLength,
  classifyUtr,
  parseGff,
  pickLongestTranscript,
  sortExonsByStrand,
  transcriptSpan,
  type GffInterval,
  type GffTranscript,
} from "./gff"

const GENE_ID = "gene:TP53"

function gffLine(
  seqid: string,
  type: string,
  start: number,
  end: number,
  strand: string,
  attrs: string,
  phase = ".",
): string {
  return `${seqid}\t.\t${type}\t${start}\t${end}\t.\t${strand}\t${phase}\t${attrs}`
}

describe("parseGff", () => {
  it("parses transcript fields, phase, and attributes", () => {
    const text = [
      gffLine("chr17", "gene", 100, 500, "+", `ID=${GENE_ID};Name=TP53;biotype=protein_coding`),
      gffLine(
        "chr17",
        "mRNA",
        100,
        500,
        "+",
        `ID=tx1;Parent=${GENE_ID};Name=TP53-201;product=tumor protein;biotype=protein_coding`,
      ),
      gffLine("chr17", "exon", 100, 150, "+", `ID=e1;Parent=tx1`),
      gffLine("chr17", "exon", 200, 300, "+", `ID=e2;Parent=tx1`),
      gffLine("chr17", "exon", 400, 500, "+", `ID=e3;Parent=tx1`),
      gffLine("chr17", "CDS", 220, 280, "+", `ID=c1;Parent=tx1`, "0"),
      gffLine("chr17", "five_prime_UTR", 100, 150, "+", `ID=u5;Parent=tx1`),
      gffLine("chr17", "three_prime_UTR", 400, 500, "+", `ID=u3;Parent=tx1`),
    ].join("\n")

    const model = parseGff(text, { start: 100, end: 500 }, GENE_ID)
    assert.ok(model)
    assert.equal(model.seqid, "chr17")
    assert.equal(model.transcripts.length, 1)
    const tx = model.transcripts[0]
    assert.equal(tx.id, "tx1")
    assert.equal(tx.type, "mrna")
    assert.equal(tx.name, "TP53-201")
    assert.equal(tx.product, "tumor protein")
    assert.equal(tx.biotype, "protein_coding")
    assert.equal(tx.synthetic, false)
    assert.equal(tx.exons.length, 3)
    assert.equal(tx.cds.length, 1)
    assert.equal(tx.cds[0].phase, "0")
    assert.equal(tx.utrs.length, 2)
    assert.equal(tx.utrs[0].utrKind, "five_prime")
    assert.equal(tx.utrs[1].utrKind, "three_prime")
    assert.equal(tx.introns.length, 0)
  })

  it("parses explicit intron features and leaves gaps empty otherwise", () => {
    const withIntrons = [
      gffLine("chr1", "gene", 10, 100, "+", `ID=${GENE_ID}`),
      gffLine("chr1", "mRNA", 10, 100, "+", `ID=tx1;Parent=${GENE_ID}`),
      gffLine("chr1", "exon", 10, 30, "+", `ID=e1;Parent=tx1`),
      gffLine("chr1", "exon", 70, 100, "+", `ID=e2;Parent=tx1`),
      gffLine("chr1", "intron", 31, 69, "+", `ID=i1;Parent=tx1`),
    ].join("\n")
    const model = parseGff(withIntrons, { start: 10, end: 100 }, GENE_ID)
    assert.ok(model)
    assert.equal(model.transcripts[0].introns.length, 1)
    assert.equal(model.transcripts[0].introns[0].start, 31)
    assert.equal(model.transcripts[0].introns[0].end, 69)

    const without = [
      gffLine("chr1", "gene", 10, 100, "+", `ID=${GENE_ID}`),
      gffLine("chr1", "mRNA", 10, 100, "+", `ID=tx1;Parent=${GENE_ID}`),
      gffLine("chr1", "exon", 10, 30, "+", `ID=e1;Parent=tx1`),
      gffLine("chr1", "exon", 70, 100, "+", `ID=e2;Parent=tx1`),
    ].join("\n")
    const empty = parseGff(without, { start: 10, end: 100 }, GENE_ID)
    assert.ok(empty)
    assert.equal(empty.transcripts[0].introns.length, 0)
  })

  it("builds a synthetic gene-level row when structure parents the gene", () => {
    const text = [
      gffLine("chr1", "gene", 10, 100, "-", `ID=${GENE_ID}`),
      gffLine("chr1", "exon", 10, 40, "-", `ID=e1;Parent=${GENE_ID}`),
      gffLine("chr1", "exon", 60, 100, "-", `ID=e2;Parent=${GENE_ID}`),
      gffLine("chr1", "CDS", 20, 40, "-", `ID=c1;Parent=${GENE_ID}`, "1"),
    ].join("\n")

    const model = parseGff(text, { start: 10, end: 100 }, GENE_ID)
    assert.ok(model)
    assert.equal(model.transcripts.length, 1)
    assert.equal(model.transcripts[0].synthetic, true)
    assert.equal(model.transcripts[0].exons.length, 2)
    assert.equal(model.transcripts[0].cds[0].phase, "1")
    assert.equal(model.transcripts[0].introns.length, 0)
  })

  it("classifies UTRs from CDS position on minus strand", () => {
    const cds: GffInterval[] = [{ start: 50, end: 80 }]
    assert.equal(
      classifyUtr({ start: 90, end: 100, type: "utr" }, cds, "-"),
      "five_prime",
    )
    assert.equal(
      classifyUtr({ start: 10, end: 20, type: "utr" }, cds, "-"),
      "three_prime",
    )
  })

  it("sorts exons in transcription order", () => {
    const exons: GffInterval[] = [
      { start: 100, end: 120 },
      { start: 200, end: 220 },
      { start: 50, end: 70 },
    ]
    const plus = sortExonsByStrand(exons, "+")
    assert.deepEqual(
      plus.map((e) => e.start),
      [50, 100, 200],
    )
    const minus = sortExonsByStrand(exons, "-")
    assert.deepEqual(
      minus.map((e) => e.start),
      [200, 100, 50],
    )
  })

  it("sums cds length", () => {
    assert.equal(cdsLength([{ start: 1, end: 10 }, { start: 21, end: 30 }]), 20)
  })

  it("picks longest genomic span transcript", () => {
    const short: GffTranscript = {
      id: "a",
      strand: "+",
      start: 1,
      end: 100,
      exons: [],
      utrs: [],
      cds: [{ start: 1, end: 90 }],
      introns: [],
      synthetic: false,
    }
    const long: GffTranscript = {
      id: "b",
      strand: "+",
      start: 1,
      end: 500,
      exons: [],
      utrs: [],
      cds: [{ start: 1, end: 50 }],
      introns: [],
      synthetic: false,
    }
    assert.equal(transcriptSpan(long), 500)
    assert.equal(pickLongestTranscript([short, long])?.id, "b")
  })
})
