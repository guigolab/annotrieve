export type UtrKind = "five_prime" | "three_prime" | "utr"

export interface GffInterval {
  start: number
  end: number
  id?: string
  type?: string
  phase?: string | null
  /** Classified UTR end (5' / 3') when known. */
  utrKind?: UtrKind
}

export interface GffTranscript {
  id: string
  strand: string
  start: number
  end: number
  exons: GffInterval[]
  utrs: GffInterval[]
  cds: GffInterval[]
  /** Explicit GFF `intron` features only (never derived from exon gaps). */
  introns: GffInterval[]
  /** Exons, UTRs, or CDS parent the gene directly, with no transcript feature. */
  synthetic: boolean
  type?: string
  name?: string | null
  product?: string | null
  biotype?: string | null
  seqid?: string
}

export interface GffModel {
  windowStart: number
  windowEnd: number
  seqid?: string
  transcripts: GffTranscript[]
}

interface Feature {
  type: string
  start: number
  end: number
  strand: string
  phase: string | null
  seqid: string
  id: string
  parents: string[]
  name: string | null
  product: string | null
  biotype: string | null
  description: string | null
  proteinId: string | null
  transcriptId: string | null
}

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=")
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) {
      try {
        out[key] = decodeURIComponent(value)
      } catch {
        out[key] = value
      }
    }
  }
  return out
}

function parentsOf(attrs: Record<string, string>): string[] {
  const raw = attrs.Parent || attrs.parent || ""
  return raw.split(",").map((item) => item.trim()).filter(Boolean)
}

function isUtr(type: string): boolean {
  return type === "utr" || type.endsWith("_utr")
}

function isIntron(type: string): boolean {
  return type === "intron"
}

function isStructure(type: string): boolean {
  return type === "exon" || type === "cds" || isUtr(type) || isIntron(type)
}

function overlaps(start: number, end: number, windowStart: number, windowEnd: number): boolean {
  return start <= windowEnd && end >= windowStart
}

function clipInterval(
  interval: GffInterval,
  windowStart: number,
  windowEnd: number,
): GffInterval | null {
  const start = Math.max(interval.start, windowStart)
  const end = Math.min(interval.end, windowEnd)
  if (end < start) return null
  return { ...interval, start, end }
}

function intervalFromFeature(feature: Feature): GffInterval {
  return {
    start: feature.start,
    end: feature.end,
    id: feature.id || undefined,
    type: feature.type,
    phase: feature.type === "cds" ? feature.phase : null,
  }
}

function intervalsOf(features: Feature[], accept: (feature: Feature) => boolean): GffInterval[] {
  return features.filter(accept).map(intervalFromFeature)
}

function childrenOf(features: Feature[], parentId: string): Feature[] {
  if (!parentId) return []
  return features.filter((feature) => feature.parents.includes(parentId))
}

function clipParts(parts: GffInterval[], windowStart: number, windowEnd: number): GffInterval[] {
  return parts
    .map((part) => clipInterval(part, windowStart, windowEnd))
    .filter((part): part is GffInterval => part !== null)
}

function pickAttr(attrs: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = attrs[key]
    if (value) return value
  }
  return null
}

/**
 * Classify a UTR relative to CDS on the given strand.
 * Falls back to GFF type hints (five_prime_utr / three_prime_utr).
 */
export function classifyUtr(
  utr: GffInterval,
  cds: GffInterval[],
  strand: string,
): UtrKind {
  const type = (utr.type ?? "").toLowerCase()
  if (type.includes("five") || type === "5_utr" || type === "five_prime_utr") {
    return "five_prime"
  }
  if (type.includes("three") || type === "3_utr" || type === "three_prime_utr") {
    return "three_prime"
  }
  if (!cds.length) return "utr"
  const cdsStart = Math.min(...cds.map((c) => c.start))
  const cdsEnd = Math.max(...cds.map((c) => c.end))
  const mid = (utr.start + utr.end) / 2
  if (strand === "-") {
    if (mid > cdsEnd) return "five_prime"
    if (mid < cdsStart) return "three_prime"
  } else {
    if (mid < cdsStart) return "five_prime"
    if (mid > cdsEnd) return "three_prime"
  }
  return "utr"
}

function annotateUtrs(utrs: GffInterval[], cds: GffInterval[], strand: string): GffInterval[] {
  return utrs.map((utr) => ({
    ...utr,
    utrKind: classifyUtr(utr, cds, strand),
  }))
}

/** Sort exons in transcription order (5' → 3'). */
export function sortExonsByStrand(exons: GffInterval[], strand: string): GffInterval[] {
  const sorted = [...exons].sort((a, b) => a.start - b.start || a.end - b.end)
  return strand === "-" ? sorted.reverse() : sorted
}

/** Parse a GFF3 slice into the isoforms of one gene id.
 *  The scale is the gene locus. Exons, UTRs, and CDS parented by the gene
 *  itself become one synthetic transcript.
 */
export function parseGff(
  text: string,
  locus: { start: number; end: number },
  geneId: string | null | undefined,
): GffModel | null {
  if (!geneId) return null

  const features: Feature[] = []
  let locusSeqid: string | undefined
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const cols = line.split("\t")
    if (cols.length < 8) continue
    const start = Number(cols[3])
    const end = Number(cols[4])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const attrs = attributes(cols[8] ?? "")
    const seqid = cols[0] || ""
    const id = attrs.ID || attrs.Id || ""
    if (id === geneId || attrs.Parent === geneId || parentsOf(attrs).includes(geneId)) {
      locusSeqid = locusSeqid || seqid
    }
    features.push({
      type: (cols[2] || "").toLowerCase(),
      start: Math.min(start, end),
      end: Math.max(start, end),
      strand: cols[6] || ".",
      phase: cols[7] === "." ? null : cols[7] || null,
      seqid,
      id,
      parents: parentsOf(attrs),
      name: pickAttr(attrs, "Name", "name"),
      product: pickAttr(attrs, "product"),
      biotype: pickAttr(attrs, "biotype", "gene_biotype", "transcript_biotype"),
      description: pickAttr(attrs, "description", "Note"),
      proteinId: pickAttr(attrs, "protein_id"),
      transcriptId: pickAttr(attrs, "transcript_id"),
    })
  }
  if (!features.length) return null

  const direct = childrenOf(features, geneId)
  if (!direct.length) return null

  const geneLevel = direct.filter((feature) => isStructure(feature.type))
  const transcriptFeatures = direct.filter((feature) => !isStructure(feature.type))

  const models: GffTranscript[] = transcriptFeatures.map((transcript, index) => {
    const parts = childrenOf(features, transcript.id).filter((feature) =>
      isStructure(feature.type),
    )
    const exons = intervalsOf(parts, (feature) => feature.type === "exon")
    const cds = intervalsOf(parts, (feature) => feature.type === "cds")
    const rawUtrs = intervalsOf(parts, (feature) => isUtr(feature.type))
    const introns = intervalsOf(parts, (feature) => isIntron(feature.type))
    return {
      id: transcript.id || transcript.transcriptId || `transcript-${index + 1}`,
      strand: transcript.strand,
      start: transcript.start,
      end: transcript.end,
      exons,
      utrs: annotateUtrs(rawUtrs, cds, transcript.strand),
      cds,
      introns,
      synthetic: false,
      type: transcript.type,
      name: transcript.name,
      product: transcript.product,
      biotype: transcript.biotype,
      seqid: transcript.seqid,
    }
  })

  if (geneLevel.length) {
    const gene = features.find((feature) => feature.id === geneId)
    const exons = intervalsOf(geneLevel, (feature) => feature.type === "exon")
    const cds = intervalsOf(geneLevel, (feature) => feature.type === "cds")
    const rawUtrs = intervalsOf(geneLevel, (feature) => isUtr(feature.type))
    const introns = intervalsOf(geneLevel, (feature) => isIntron(feature.type))
    const strand = gene?.strand || geneLevel[0].strand
    models.push({
      id: geneId,
      strand,
      start: Math.min(...geneLevel.map((feature) => feature.start)),
      end: Math.max(...geneLevel.map((feature) => feature.end)),
      exons,
      utrs: annotateUtrs(rawUtrs, cds, strand),
      cds,
      introns,
      synthetic: true,
      type: gene?.type ?? "gene",
      name: gene?.name ?? null,
      product: gene?.product ?? null,
      biotype: gene?.biotype ?? null,
      seqid: gene?.seqid ?? locusSeqid,
    })
  }

  const windowStart = Math.min(locus.start, locus.end)
  const windowEnd = Math.max(locus.start, locus.end)

  const clipped = models
    .filter((transcript) =>
      overlaps(transcript.start, transcript.end, windowStart, windowEnd),
    )
    .map((transcript) => {
      const span = clipInterval(transcript, windowStart, windowEnd)
      if (!span) return null
      return {
        ...transcript,
        start: span.start,
        end: span.end,
        exons: clipParts(transcript.exons, windowStart, windowEnd),
        utrs: clipParts(transcript.utrs, windowStart, windowEnd),
        cds: clipParts(transcript.cds, windowStart, windowEnd),
        introns: clipParts(transcript.introns, windowStart, windowEnd),
      }
    })
    .filter((transcript): transcript is GffTranscript => transcript !== null)

  if (!clipped.length) return null
  clipped.sort(
    (a, b) =>
      Number(a.synthetic) - Number(b.synthetic) ||
      a.start - b.start ||
      a.id.localeCompare(b.id),
  )
  return {
    windowStart,
    windowEnd,
    seqid: locusSeqid ?? clipped[0]?.seqid,
    transcripts: clipped,
  }
}

/** Total CDS length in bp across blocks. */
export function cdsLength(cds: GffInterval[]): number {
  return cds.reduce((sum, block) => sum + Math.max(0, block.end - block.start + 1), 0)
}
