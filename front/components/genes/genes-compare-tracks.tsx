"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"

import {
  GenesCompareLegend,
  type CompareFeatureMode,
} from "@/components/genes/genes-compare-legend"
import { GenesCompareTranscriptPicker } from "@/components/genes/genes-compare-transcript-picker"
import { Button } from "@/components/ui/button"
import type { TranscriptPin } from "@/lib/genes/compare-store"
import { streamAnnotationGff } from "@/lib/api/annotations"
import {
  categoryTint,
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
  type GeneCategory,
} from "@/lib/genes/gene-category"
import {
  cdsLength,
  findTranscriptById,
  parseGff,
  pickLongestTranscript,
  transcriptSpan,
  type GffInterval,
  type GffTranscript,
} from "@/lib/genes/gff"
import { formatBp, formatTick, niceTicks } from "@/lib/genes/format"
import { cn } from "@/lib/utils"

export type { CompareFeatureMode }

const TRACK_H = 32
const EXON_H = 14
const PAD_X = 12
const RULER_H = 28
const TICK_MIN_GAP = 48
const LABEL_GUTTER_W = 12

interface GenesCompareTracksProps {
  pins: TranscriptPin[]
  onSetTranscript: (pinId: string, transcriptId: string | null) => void
  onRemovePin: (pinId: string) => void
  zoom?: number
  featureMode?: CompareFeatureMode
  className?: string
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

function StructureTrack({
  transcript,
  axisMax,
  width,
  featureMode,
}: {
  transcript: GffTranscript
  axisMax: number
  width: number
  featureMode: CompareFeatureMode
}) {
  const cat = geneCategoryOf({
    feature_type: transcript.type,
    biotype: transcript.biotype,
    hasCds: transcript.cds.length > 0,
  })
  const style = GENE_CATEGORY_STYLE[cat]
  const token = style.token
  const lineColor = categoryTint(token, 65)
  const exonFill =
    transcript.cds.length || transcript.utrs.length
      ? categoryTint(token, 22)
      : token
  const utrFill = categoryTint(token, 55)
  const drawW = Math.max(40, width - PAD_X * 2)
  const origin = transcript.start
  const xOf = (relBp: number) =>
    PAD_X + (relBp / Math.max(1, axisMax)) * drawW
  const xOfAbs = (pos: number) => xOf(pos - origin)
  const widthOf = (iv: GffInterval) =>
    Math.max(1, Math.abs(xOfAbs(iv.end) - xOfAbs(iv.start)))
  const mid = TRACK_H / 2
  const left = xOfAbs(transcript.start)
  const right = xOfAbs(transcript.end)
  const exonTop = mid - EXON_H / 2
  const utrs = transcript.utrs.flatMap((u) => clipToExons(u, transcript.exons))
  const cds = transcript.cds.flatMap((c) => clipToExons(c, transcript.exons))
  const showExons = featureMode === "all" || featureMode === "exons"
  const showUtrCds = featureMode === "all"
  const showCdsOnly = featureMode === "cds"

  return (
    <svg
      width={width}
      height={TRACK_H}
      viewBox={`0 0 ${width} ${TRACK_H}`}
      className="block"
      aria-hidden
    >
      <line
        x1={left}
        x2={right}
        y1={mid}
        y2={mid}
        stroke={lineColor}
        strokeWidth={1.5}
      />
      {showExons
        ? transcript.exons.map((exon, i) => (
            <rect
              key={`ex-${i}`}
              x={Math.min(xOfAbs(exon.start), xOfAbs(exon.end))}
              y={exonTop}
              width={widthOf(exon)}
              height={EXON_H}
              rx={2}
              fill={exonFill}
              stroke={token}
              strokeWidth={1}
            />
          ))
        : null}
      {showUtrCds
        ? utrs.map((utr, i) => (
            <rect
              key={`utr-${i}`}
              x={Math.min(xOfAbs(utr.start), xOfAbs(utr.end))}
              y={exonTop + 1}
              width={widthOf(utr)}
              height={EXON_H - 2}
              rx={1}
              fill={utrFill}
              opacity={0.85}
            />
          ))
        : null}
      {showUtrCds || showCdsOnly
        ? cds.map((block, i) => (
            <rect
              key={`cds-${i}`}
              x={Math.min(xOfAbs(block.start), xOfAbs(block.end))}
              y={exonTop + 1}
              width={widthOf(block)}
              height={EXON_H - 2}
              rx={1}
              fill={token}
            />
          ))
        : null}
    </svg>
  )
}

function ScaleRuler({
  axisMax,
  width,
  ticks,
}: {
  axisMax: number
  width: number
  ticks: number[]
}) {
  const drawW = Math.max(40, width - PAD_X * 2)
  const xOf = (relBp: number) =>
    PAD_X + (relBp / Math.max(1, axisMax)) * drawW

  return (
    <svg
      width={width}
      height={RULER_H}
      viewBox={`0 0 ${width} ${RULER_H}`}
      className="block text-muted-foreground"
      aria-hidden
    >
      <line
        x1={PAD_X}
        x2={PAD_X + drawW}
        y1={RULER_H - 8}
        y2={RULER_H - 8}
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      {ticks.map((t) => {
        const x = xOf(t)
        const isEdge = t === 0 || t === axisMax
        return (
          <g key={`tick-${t}`}>
            <line
              x1={x}
              x2={x}
              y1={RULER_H - 14}
              y2={RULER_H - 8}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={1}
            />
            <text
              x={x}
              y={12}
              textAnchor={
                t === 0 ? "start" : t === axisMax ? "end" : "middle"
              }
              className="fill-current"
              fontSize={10}
              fontFamily="ui-monospace, monospace"
              opacity={isEdge ? 0.9 : 0.7}
            >
              {formatTick(t, axisMax)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function GenesCompareTracks({
  pins,
  onSetTranscript,
  onRemovePin,
  zoom = 1,
  featureMode = "all",
  className,
}: GenesCompareTracksProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [baseWidth, setBaseWidth] = useState(480)

  useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const gutter = LABEL_GUTTER_W
      setBaseWidth(Math.max(280, Math.floor(el.clientWidth - gutter)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotWidth = Math.max(280, Math.round(baseWidth * zoom))

  const gffQueries = useQueries({
    queries: pins.map((pin) => ({
      queryKey: [
        "genes-gff",
        pin.annotationId,
        pin.seqid,
        pin.geneStart,
        pin.geneEnd,
      ] as const,
      enabled: Boolean(pin.seqid),
      staleTime: 5 * 60 * 1000,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await streamAnnotationGff(
          pin.annotationId,
          {
            region: pin.seqid,
            start: Math.max(0, pin.geneStart - 1),
            end: pin.geneEnd + 1,
          },
          { signal },
        )
        if (!response.ok) {
          throw new Error(`GFF request failed (${response.status})`)
        }
        return response.text()
      },
    })),
  })

  const resolved = useMemo(() => {
    return pins.map((pin, i) => {
      const q = gffQueries[i]
      const geneId = pin.sourceGeneId
      const model =
        q?.data && geneId
          ? parseGff(
              q.data,
              { start: pin.geneStart, end: pin.geneEnd },
              geneId,
            )
          : null
      const transcripts = model?.transcripts ?? []
      const selected =
        findTranscriptById(transcripts, pin.transcriptId) ??
        pickLongestTranscript(transcripts)
      return { pin, query: q, transcripts, selected }
    })
  }, [pins, gffQueries])

  const axisMax = useMemo(() => {
    let max = 1
    for (const row of resolved) {
      if (row.selected) max = Math.max(max, transcriptSpan(row.selected))
    }
    return max
  }, [resolved])

  const legendCategories = useMemo(() => {
    const seen = new Set<GeneCategory>()
    for (const row of resolved) {
      if (!row.selected) continue
      seen.add(
        geneCategoryOf({
          feature_type: row.selected.type,
          biotype: row.selected.biotype,
          hasCds: row.selected.cds.length > 0,
        }),
      )
    }
    const order: GeneCategory[] = ["coding", "non_coding", "pseudogene"]
    const out = order.filter((c) => seen.has(c))
    if (!out.includes("coding")) out.unshift("coding")
    if (!out.includes("non_coding")) {
      const codingIdx = out.indexOf("coding")
      out.splice(codingIdx + 1, 0, "non_coding")
    }
    if (!seen.has("pseudogene")) {
      return out.filter((c) => c !== "pseudogene")
    }
    return out
  }, [resolved])

  const rawTicks = useMemo(
    () => niceTicks(0, axisMax, 6),
    [axisMax],
  )

  const ticks = useMemo(() => {
    const drawW = Math.max(40, plotWidth - PAD_X * 2)
    const xOf = (relBp: number) =>
      PAD_X + (relBp / Math.max(1, axisMax)) * drawW
    const out: number[] = []
    for (const tick of rawTicks) {
      const x = xOf(tick)
      if (
        out.length &&
        Math.abs(x - xOf(out[out.length - 1]!)) < TICK_MIN_GAP &&
        tick !== axisMax
      ) {
        continue
      }
      out.push(tick)
    }
    if (!out.includes(0)) out.unshift(0)
    if (!out.includes(axisMax)) out.push(axisMax)
    return out
  }, [rawTicks, axisMax, plotWidth])

  return (
    <div
      ref={viewportRef}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-auto",
        className,
      )}
    >
      <div
        className="flex min-h-full flex-1 flex-col"
        style={{ minWidth: plotWidth + LABEL_GUTTER_W }}
      >
        <div className="sticky top-0 z-10 flex border-b border-border/60 backdrop-blur">
          <div
            className="shrink-0"
            style={{ width: LABEL_GUTTER_W }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <ScaleRuler
              axisMax={axisMax}
              width={plotWidth}
              ticks={ticks}
            />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative flex flex-col">
            {resolved.map(({ pin, query, transcripts, selected }) => {
              const span = selected ? transcriptSpan(selected) : 0
              const exons = selected?.exons.length ?? 0
              const cdsBp = selected ? cdsLength(selected.cds) : 0
              const meta = selected
                ? `${formatBp(span)} · ${exons} exon${exons === 1 ? "" : "s"}${
                    cdsBp > 0 ? ` · ${formatBp(cdsBp)} CDS` : ""
                  }`
                : query?.isLoading
                  ? "Loading…"
                  : query?.isError
                    ? "Load failed"
                    : !pin.sourceGeneId
                      ? "No source gene id"
                      : "No transcripts"

              return (
                <div
                  key={pin.id}
                  className="flex border-b border-border/40 py-0.5"
                >
                  <div
                    className="shrink-0"
                    style={{ width: LABEL_GUTTER_W }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1" style={{ width: plotWidth }}>
                    <div
                      className="sticky left-0 z-[2] flex h-5 items-center gap-2 px-2"
                      style={{ width: baseWidth }}
                    >
                      <p className="min-w-0 flex-1 truncate text-xs leading-none">
                        <span className="rounded-sm bg-background/85 italic text-foreground [box-decoration-break:clone] px-0.5">
                          {pin.species}
                        </span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="rounded-sm bg-background/85 font-mono font-medium [box-decoration-break:clone] px-0.5">
                          {pin.geneName}
                        </span>
                        <span className="ml-1.5 rounded-sm bg-background/85 tabular-nums text-muted-foreground [box-decoration-break:clone] px-0.5">
                          {meta}
                        </span>
                      </p>
                      <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-background/90">
                        <GenesCompareTranscriptPicker
                          geneName={pin.geneName}
                          species={pin.species}
                          transcripts={transcripts}
                          selected={selected}
                          pinnedTranscriptId={pin.transcriptId}
                          onSelect={(id) => onSetTranscript(pin.id, id)}
                          onUseLongest={() => onSetTranscript(pin.id, null)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Remove ${pin.geneName} in ${pin.species}`}
                          onClick={() => onRemovePin(pin.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="w-full overflow-hidden">
                      {query?.isLoading ? (
                        <div
                          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
                          style={{ height: TRACK_H, width: plotWidth }}
                        >
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Loading…
                        </div>
                      ) : selected ? (
                        <StructureTrack
                          transcript={selected}
                          axisMax={axisMax}
                          width={plotWidth}
                          featureMode={featureMode}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center text-xs text-muted-foreground"
                          style={{ height: TRACK_H, width: plotWidth }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <GenesCompareLegend
            featureMode={featureMode}
            categories={legendCategories}
            className="mt-auto"
            style={{ width: baseWidth + LABEL_GUTTER_W }}
          />
        </div>
      </div>
    </div>
  )
}
