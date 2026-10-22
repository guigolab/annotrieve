"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react"

import { Button } from "@/components/ui/button"
import {
  categoryTint,
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
  type GeneCategory,
} from "@/lib/genes/gene-category"
import {
  cdsLength,
  sortExonsByStrand,
  type GffInterval,
  type GffModel,
  type GffTranscript,
} from "@/lib/genes/gff"
import { formatBp, formatTick, locusLength, niceTicks } from "@/lib/genes/format"
import { cn } from "@/lib/utils"

const PAD_X = 36
const RULER_TOP = 6
const RULER_H = 22
const LEGEND_H = 20
const DRAW_H = 20
const NAME_H = 16
const TRACK_H = DRAW_H + NAME_H
const DEFAULT_VISIBLE = 8
const CHEVRON_STEP = 32
const TICK_MIN_GAP = 44
const EXON_H = 14
const INNER_INSET = 1
const UTR_HATCH_ID = "genes-utr-hatch"

interface GenesGeneBrowserProps {
  model: GffModel
  /** Gene-level category (pseudogene forces purple on all isoforms). */
  geneCategory?: GeneCategory
  className?: string
}

type HoverKind = "exon" | "cds" | "utr" | "intron" | "transcript"

interface HoverInfo {
  kind: HoverKind
  title: string
  lines: string[]
  x: number
  y: number
  highlight?: { x: number; y: number; w: number; h: number }
  highlightColor?: string
}

type LegendEntry = {
  label: string
  fill: string
  stroke?: string
  hatch?: boolean
  line?: boolean
}

function displayId(id: string): string {
  return id.replace(/^(transcript:|mrna:|rna:)/i, "")
}

function clipToExons(interval: GffInterval, exons: GffInterval[]): GffInterval[] {
  if (!exons.length) return [interval]
  const pieces: GffInterval[] = []
  for (const exon of exons) {
    const start = Math.max(interval.start, exon.start)
    const end = Math.min(interval.end, exon.end)
    if (end >= start) pieces.push({ ...interval, start, end })
  }
  return pieces
}

function utrLabel(utr: GffInterval): string {
  if (utr.utrKind === "five_prime") return "5′ UTR"
  if (utr.utrKind === "three_prime") return "3′ UTR"
  return "UTR"
}

function coversX(
  blocks: GffInterval[],
  xOf: (pos: number) => number,
  x: number,
): boolean {
  return blocks.some((b) => {
    const x1 = Math.min(xOf(b.start), xOf(b.end))
    const x2 = Math.max(xOf(b.start), xOf(b.end))
    return x >= x1 && x <= x2
  })
}

function transcriptCategory(
  transcript: GffTranscript,
  geneCategory: GeneCategory | undefined,
): GeneCategory {
  if (geneCategory === "pseudogene") return "pseudogene"
  return geneCategoryOf({
    feature_type: transcript.type,
    biotype: transcript.biotype,
    hasCds: transcript.cds.length > 0,
  })
}

function legendFor(
  transcripts: GffTranscript[],
  geneCategory: GeneCategory | undefined,
): LegendEntry[] {
  let hasExonShell = false
  let hasNonCodingExon = false
  let hasCds = false
  let hasUtr5 = false
  let hasUtr3 = false
  let hasUtr = false
  let hasIntron = false
  let sampleCat: GeneCategory = geneCategory ?? "coding"

  for (const tx of transcripts) {
    sampleCat = transcriptCategory(tx, geneCategory)
    if (tx.exons.length) {
      if (tx.cds.length || tx.utrs.length) hasExonShell = true
      else hasNonCodingExon = true
    }
    if (tx.cds.length) hasCds = true
    for (const utr of tx.utrs) {
      if (utr.utrKind === "five_prime") hasUtr5 = true
      else if (utr.utrKind === "three_prime") hasUtr3 = true
      else hasUtr = true
    }
    if (tx.introns.length) hasIntron = true
  }

  const token = GENE_CATEGORY_STYLE[sampleCat].token
  const entries: LegendEntry[] = []
  if (hasExonShell || hasNonCodingExon) {
    entries.push({
      label: "Exon",
      fill: hasCds || hasUtr5 || hasUtr3 || hasUtr
        ? categoryTint(token, 22)
        : token,
      stroke: token,
    })
  }
  if (hasCds) {
    entries.push({ label: "CDS", fill: token })
  }
  if (hasUtr5) {
    entries.push({
      label: "5′ UTR",
      fill: categoryTint(token, 55),
      hatch: true,
    })
  }
  if (hasUtr3) {
    entries.push({
      label: "3′ UTR",
      fill: categoryTint(token, 55),
      hatch: true,
    })
  }
  if (hasUtr && !hasUtr5 && !hasUtr3) {
    entries.push({
      label: "UTR",
      fill: categoryTint(token, 55),
      hatch: true,
    })
  }
  if (hasIntron) {
    entries.push({
      label: "Intron",
      fill: token,
      line: true,
    })
  }
  return entries
}

export function GenesGeneBrowser({
  model,
  geneCategory,
  className,
}: GenesGeneBrowserProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(480)
  const [showAll, setShowAll] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth
      setWidth(Math.max(280, Math.floor(w)))
    })
    ro.observe(el)
    setWidth(Math.max(280, Math.floor(el.clientWidth)))
    return () => ro.disconnect()
  }, [])

  const transcripts = model.transcripts
  const visible = showAll ? transcripts : transcripts.slice(0, DEFAULT_VISIBLE)
  const hidden = Math.max(0, transcripts.length - DEFAULT_VISIBLE)

  const span = Math.max(1, model.windowEnd - model.windowStart)
  const plotW = Math.max(120, width - PAD_X * 2)
  const rawTicks = useMemo(
    () => niceTicks(model.windowStart, model.windowEnd, 5),
    [model.windowStart, model.windowEnd],
  )

  const tracksTop = RULER_TOP + RULER_H + LEGEND_H
  const height = tracksTop + visible.length * TRACK_H + 8
  const legend = useMemo(
    () => legendFor(visible, geneCategory),
    [visible, geneCategory],
  )

  const xOf = (pos: number) =>
    PAD_X + ((pos - model.windowStart) / span) * plotW
  const widthOf = (interval: GffInterval) =>
    Math.max(1, xOf(interval.end) - xOf(interval.start))

  const labelledTicks = useMemo(() => {
    const out: number[] = []
    for (const tick of rawTicks) {
      const x = xOf(tick)
      if (
        out.length &&
        Math.abs(x - xOf(out[out.length - 1])) < TICK_MIN_GAP &&
        tick !== model.windowEnd
      ) {
        continue
      }
      out.push(tick)
    }
    if (!out.includes(model.windowStart)) out.unshift(model.windowStart)
    if (!out.includes(model.windowEnd)) out.push(model.windowEnd)
    return out
    // xOf depends on width/span which change with resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTicks, model.windowStart, model.windowEnd, width, span])

  let cursor = tracksTop
  const rows = visible.map((transcript) => {
    const top = cursor
    cursor += TRACK_H
    return { transcript, top }
  })

  const setSegmentHover = (
    e: MouseEvent | FocusEvent,
    info: Omit<HoverInfo, "x" | "y">,
  ) => {
    const root = containerRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    let clientX = rect.left + rect.width / 2
    let clientY = rect.top + 20
    if ("clientX" in e) {
      clientX = e.clientX
      clientY = e.clientY
    }
    setHover({
      ...info,
      x: Math.min(rect.width - 12, Math.max(12, clientX - rect.left)),
      y: Math.min(rect.height - 12, Math.max(12, clientY - rect.top)),
    })
  }

  const transcriptCard = (transcript: GffTranscript): Omit<HoverInfo, "x" | "y"> => {
    const cdsBp = cdsLength(transcript.cds)
    const lines = [
      transcript.type ? `Type: ${transcript.type}` : null,
      transcript.name ? `Name: ${transcript.name}` : null,
      transcript.product ? `Product: ${transcript.product}` : null,
      transcript.biotype ? `Biotype: ${transcript.biotype}` : null,
      `${model.seqid ?? transcript.seqid ?? "?"}:${transcript.start.toLocaleString()}-${transcript.end.toLocaleString()} (${transcript.strand || "."})`,
      `Length ${formatBp(locusLength(transcript.start, transcript.end))}`,
      `${transcript.exons.length} exon${transcript.exons.length === 1 ? "" : "s"}`,
      cdsBp > 0
        ? `CDS ${formatBp(cdsBp)} (~${Math.floor(cdsBp / 3).toLocaleString()} aa)`
        : "No CDS",
      transcript.synthetic ? "Structure attached to gene (no transcript feature)" : null,
    ].filter(Boolean) as string[]
    return {
      kind: "transcript",
      title: transcript.synthetic ? "Gene structure" : displayId(transcript.id),
      lines,
    }
  }

  const segmentCard = (
    kind: HoverKind,
    title: string,
    interval: GffInterval,
    transcript: GffTranscript,
    highlight: HoverInfo["highlight"],
    highlightColor: string,
  ): Omit<HoverInfo, "x" | "y"> => {
    const lines = [
      `${model.seqid ?? transcript.seqid ?? "?"}:${interval.start.toLocaleString()}-${interval.end.toLocaleString()}`,
      `Length ${formatBp(locusLength(interval.start, interval.end))}`,
      `Transcript ${displayId(transcript.id)}`,
      `Strand ${transcript.strand || "."}`,
      kind === "cds" && interval.phase != null ? `Phase ${interval.phase}` : null,
    ].filter(Boolean) as string[]
    return { kind, title, lines, highlight, highlightColor }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <svg
        width={width}
        height={height}
        className="w-full h-auto text-foreground overflow-visible"
        role="img"
        aria-label="Transcript isoforms"
      >
        <defs>
          <pattern
            id={UTR_HATCH_ID}
            patternUnits="userSpaceOnUse"
            width={6}
            height={6}
            patternTransform="rotate(45)"
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              stroke="var(--background)"
              strokeWidth={2}
              opacity={0.55}
            />
          </pattern>
        </defs>

        <line
          x1={PAD_X}
          x2={PAD_X + plotW}
          y1={RULER_TOP + 14}
          y2={RULER_TOP + 14}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {labelledTicks.map((tick) => {
          const x = xOf(tick)
          return (
            <g key={tick}>
              <line
                x1={x}
                x2={x}
                y1={RULER_TOP + 12}
                y2={RULER_TOP + 16}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <line
                x1={x}
                x2={x}
                y1={tracksTop}
                y2={height - 2}
                stroke="var(--border)"
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text
                x={x}
                y={RULER_TOP + 10}
                textAnchor={
                  tick === model.windowStart
                    ? "start"
                    : tick === model.windowEnd
                      ? "end"
                      : "middle"
                }
                className="fill-muted-foreground"
                fontSize={9}
              >
                {formatTick(tick, span)}
              </text>
            </g>
          )
        })}

        {legend.map((entry, index) => {
          const x = PAD_X + index * 72
          const y = RULER_TOP + RULER_H + 4
          return (
            <g key={`${entry.label}-${index}`}>
              {entry.line ? (
                <line
                  x1={x}
                  x2={x + 10}
                  y1={y + 4}
                  y2={y + 4}
                  stroke={entry.fill}
                  strokeWidth={2.5}
                />
              ) : (
                <>
                  <rect
                    x={x}
                    y={y}
                    width={10}
                    height={8}
                    rx={1}
                    fill={entry.fill}
                    stroke={entry.stroke}
                    strokeWidth={entry.stroke ? 1 : 0}
                  />
                  {entry.hatch && (
                    <rect
                      x={x}
                      y={y}
                      width={10}
                      height={8}
                      rx={1}
                      fill={`url(#${UTR_HATCH_ID})`}
                    />
                  )}
                </>
              )}
              <text
                x={x + 14}
                y={y + 8}
                className="fill-muted-foreground"
                fontSize={9}
              >
                {entry.label}
              </text>
            </g>
          )
        })}

        {rows.map(({ transcript, top }) => {
          const mid = top + DRAW_H / 2
          const cat = transcriptCategory(transcript, geneCategory)
          const style = GENE_CATEGORY_STYLE[cat]
          const token = style.token
          const lineColor = categoryTint(token, 65)
          const exonFill =
            transcript.cds.length || transcript.utrs.length
              ? categoryTint(token, 22)
              : token
          const utrFill = categoryTint(token, 55)
          const label = transcript.synthetic
            ? "gene structure"
            : displayId(transcript.id)
          const exonsOrdered = sortExonsByStrand(transcript.exons, transcript.strand)
          const utrs = transcript.utrs.flatMap((utr) =>
            clipToExons(utr, transcript.exons),
          )
          const cds = transcript.cds.flatMap((block) =>
            clipToExons(block, transcript.exons),
          )
          const introns = transcript.introns
          const cdsBp = cdsLength(transcript.cds)
          const metaParts = [
            transcript.type || null,
            transcript.exons.length
              ? `${transcript.exons.length} exon${transcript.exons.length === 1 ? "" : "s"}`
              : null,
            cdsBp > 0 ? `${Math.floor(cdsBp / 3).toLocaleString()} aa` : null,
          ].filter(Boolean)
          const meta = metaParts.join(" · ")

          const xStart = xOf(transcript.start)
          const xEnd = xOf(transcript.end)
          const left = Math.min(xStart, xEnd)
          const right = Math.max(xStart, xEnd)
          const forward = transcript.strand !== "-"
          const exonTop = mid - EXON_H / 2
          const innerH = EXON_H - INNER_INSET * 2
          const innerTop = exonTop + INNER_INSET
          const txCard = transcriptCard(transcript)

          return (
            <g key={`${transcript.id}-${top}`}>
              {/* Continuous strand line */}
              <line
                x1={left}
                x2={right}
                y1={mid}
                y2={mid}
                stroke={lineColor}
                strokeWidth={1.5}
              />
              {/* Invisible hit target for the line / transcript */}
              <rect
                x={left}
                y={mid - 6}
                width={Math.max(1, right - left)}
                height={12}
                fill="transparent"
                className="cursor-pointer"
                tabIndex={0}
                onMouseEnter={(e) => setSegmentHover(e, txCard)}
                onMouseMove={(e) => setSegmentHover(e, txCard)}
                onFocus={(e) => setSegmentHover(e, txCard)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              />

              {/* Explicit intron features as thicker segments */}
              {introns.map((intron, intronIndex) => {
                const x1 = xOf(intron.start)
                const x2 = xOf(intron.end)
                const hx = {
                  x: Math.min(x1, x2),
                  y: mid - 2,
                  w: Math.max(1, Math.abs(x2 - x1)),
                  h: 4,
                }
                const info = segmentCard(
                  "intron",
                  `Intron ${intronIndex + 1}/${introns.length}`,
                  intron,
                  transcript,
                  hx,
                  token,
                )
                return (
                  <g key={`intron-${intronIndex}`}>
                    <line
                      x1={hx.x}
                      x2={hx.x + hx.w}
                      y1={mid}
                      y2={mid}
                      stroke={token}
                      strokeWidth={3}
                    />
                    <rect
                      x={hx.x}
                      y={mid - 6}
                      width={hx.w}
                      height={12}
                      fill="transparent"
                      className="cursor-pointer"
                      tabIndex={0}
                      onMouseEnter={(e) => setSegmentHover(e, info)}
                      onMouseMove={(e) => setSegmentHover(e, info)}
                      onFocus={(e) => setSegmentHover(e, info)}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                    />
                  </g>
                )
              })}

              {/* Direction chevrons only in gaps between exon boxes */}
              {Array.from(
                { length: Math.max(0, Math.floor((right - left) / CHEVRON_STEP)) },
                (_, i) => {
                  const x = left + (i + 0.5) * CHEVRON_STEP
                  if (x >= right - 4) return null
                  if (coversX(transcript.exons, xOf, x)) return null
                  const pts = forward
                    ? `${x - 3},${mid} ${x + 3},${mid - 3} ${x + 3},${mid + 3}`
                    : `${x + 3},${mid} ${x - 3},${mid - 3} ${x - 3},${mid + 3}`
                  return (
                    <polygon
                      key={`chev-${i}`}
                      points={pts}
                      fill={lineColor}
                      opacity={0.9}
                    />
                  )
                },
              )}

              {/* 3' arrowhead just past the transcript end */}
              {right - left > 8 && (
                <polygon
                  points={
                    forward
                      ? `${right + 6},${mid} ${right - 2},${mid - 5} ${right - 2},${mid + 5}`
                      : `${left - 6},${mid} ${left + 2},${mid - 5} ${left + 2},${mid + 5}`
                  }
                  fill={lineColor}
                />
              )}

              {/* Exon boxes */}
              {transcript.exons.map((exon, exonIndex) => {
                const orderedIndex = exonsOrdered.findIndex(
                  (e) => e.start === exon.start && e.end === exon.end,
                )
                const hx = {
                  x: xOf(exon.start),
                  y: exonTop,
                  w: widthOf(exon),
                  h: EXON_H,
                }
                const info = segmentCard(
                  "exon",
                  `Exon ${orderedIndex >= 0 ? orderedIndex + 1 : exonIndex + 1}/${transcript.exons.length}`,
                  exon,
                  transcript,
                  hx,
                  token,
                )
                return (
                  <rect
                    key={`exon-${exonIndex}`}
                    x={hx.x}
                    y={hx.y}
                    width={hx.w}
                    height={hx.h}
                    rx={2}
                    fill={exonFill}
                    stroke={token}
                    strokeWidth={1}
                    className="cursor-pointer"
                    tabIndex={0}
                    onMouseEnter={(e) => setSegmentHover(e, info)}
                    onMouseMove={(e) => setSegmentHover(e, info)}
                    onFocus={(e) => setSegmentHover(e, info)}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                )
              })}

              {/* UTR inside exon boxes */}
              {utrs.map((utr, utrIndex) => {
                const hx = {
                  x: xOf(utr.start) + INNER_INSET,
                  y: innerTop,
                  w: Math.max(1, widthOf(utr) - INNER_INSET * 2),
                  h: innerH,
                }
                const info = segmentCard(
                  "utr",
                  utrLabel(utr),
                  utr,
                  transcript,
                  hx,
                  token,
                )
                return (
                  <g key={`utr-${utrIndex}`}>
                    <rect
                      x={hx.x}
                      y={hx.y}
                      width={hx.w}
                      height={hx.h}
                      rx={1}
                      fill={utrFill}
                      className="cursor-pointer"
                      tabIndex={0}
                      onMouseEnter={(e) => setSegmentHover(e, info)}
                      onMouseMove={(e) => setSegmentHover(e, info)}
                      onFocus={(e) => setSegmentHover(e, info)}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                    />
                    <rect
                      x={hx.x}
                      y={hx.y}
                      width={hx.w}
                      height={hx.h}
                      rx={1}
                      fill={`url(#${UTR_HATCH_ID})`}
                      pointerEvents="none"
                    />
                  </g>
                )
              })}

              {/* CDS inside exon boxes */}
              {cds.map((block, cdsIndex) => {
                const hx = {
                  x: xOf(block.start) + INNER_INSET,
                  y: innerTop,
                  w: Math.max(1, widthOf(block) - INNER_INSET * 2),
                  h: innerH,
                }
                const info = segmentCard(
                  "cds",
                  `CDS ${cdsIndex + 1}/${cds.length}`,
                  block,
                  transcript,
                  hx,
                  token,
                )
                return (
                  <rect
                    key={`cds-${cdsIndex}`}
                    x={hx.x}
                    y={hx.y}
                    width={hx.w}
                    height={hx.h}
                    rx={1}
                    fill={token}
                    className="cursor-pointer"
                    tabIndex={0}
                    onMouseEnter={(e) => setSegmentHover(e, info)}
                    onMouseMove={(e) => setSegmentHover(e, info)}
                    onFocus={(e) => setSegmentHover(e, info)}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                )
              })}

              <text
                x={left}
                y={top + DRAW_H + NAME_H - 3}
                fontSize={9}
                className="fill-muted-foreground cursor-pointer"
                tabIndex={0}
                onMouseEnter={(e) => setSegmentHover(e, txCard)}
                onMouseMove={(e) => setSegmentHover(e, txCard)}
                onFocus={(e) => setSegmentHover(e, txCard)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
              >
                {label}
              </text>
              {meta && (
                <text
                  x={right}
                  y={top + DRAW_H + NAME_H - 3}
                  textAnchor="end"
                  fontSize={9}
                  className="fill-muted-foreground"
                >
                  {meta.length > 28 ? `${meta.slice(0, 27)}…` : meta}
                </text>
              )}
            </g>
          )
        })}

        {hover?.highlight && (
          <rect
            x={hover.highlight.x - 1}
            y={hover.highlight.y - 1}
            width={hover.highlight.w + 2}
            height={hover.highlight.h + 2}
            fill="none"
            stroke={hover.highlightColor ?? "var(--primary)"}
            strokeWidth={2}
            rx={2}
            pointerEvents="none"
          />
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-[16rem] rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
          style={{
            left: Math.min(width - 180, Math.max(4, hover.x + 12)),
            top: Math.max(4, hover.y + 12),
          }}
          role="tooltip"
        >
          <div className="font-medium">{hover.title}</div>
          <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
            {hover.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {hidden > 0 && (
        <div className="mt-1">
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show fewer" : `Show all ${transcripts.length}`}
          </Button>
        </div>
      )}
    </div>
  )
}
