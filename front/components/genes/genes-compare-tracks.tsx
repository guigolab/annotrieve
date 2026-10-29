"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { streamAnnotationGff } from "@/lib/api/annotations"
import type {
  TranscriptMode,
  TranscriptPin,
} from "@/lib/genes/compare-store"
import {
  categoryTint,
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
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

const TRACK_H = 32
const EXON_H = 14
const PAD_X = 12
const RULER_H = 28
const TICK_MIN_GAP = 48
const LABEL_GUTTER_W = 36

export type CompareFeatureMode = "all" | "exons" | "cds"

interface GenesCompareTracksProps {
  pins: TranscriptPin[]
  transcriptMode?: TranscriptMode
  onSetTranscript: (pinId: string, transcriptId: string) => void
  zoom?: number
  featureMode?: CompareFeatureMode
  className?: string
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

function StructureTrack({
  transcript,
  axisMax,
  width,
  ticks,
  featureMode,
}: {
  transcript: GffTranscript
  axisMax: number
  width: number
  ticks: number[]
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
      {ticks.map((t) => {
        const x = xOf(t)
        return (
          <line
            key={`grid-${t}`}
            x1={x}
            x2={x}
            y1={0}
            y2={TRACK_H}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
        )
      })}
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

function TrackDownloadStub({ geneName }: { geneName: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          aria-label={`Download ${geneName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-44 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">
          Download
        </p>
        {/* TODO: wire GFF / FASTA / BED export handlers */}
        <div className="flex flex-col gap-0.5">
          {(["GFF", "FASTA", "BED"] as const).map((label) => (
            <button
              key={label}
              type="button"
              disabled
              className="rounded px-2 py-1.5 text-left text-xs text-muted-foreground opacity-60"
            >
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function GenesCompareTracks({
  pins,
  transcriptMode = "longest",
  onSetTranscript,
  zoom = 1,
  featureMode = "all",
  className,
}: GenesCompareTracksProps) {
  const chooseMode = transcriptMode === "choose"
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

  const assignedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const live = new Set(pins.map((p) => p.id))
    for (const id of [...assignedRef.current]) {
      if (!live.has(id)) assignedRef.current.delete(id)
    }
  }, [pins])

  useEffect(() => {
    if (!chooseMode) {
      assignedRef.current.clear()
      return
    }
    for (const { pin, selected, query } of resolved) {
      if (!selected || !query?.isSuccess) continue
      if (pin.transcriptId) {
        assignedRef.current.add(pin.id)
        continue
      }
      if (assignedRef.current.has(pin.id)) continue
      assignedRef.current.add(pin.id)
      onSetTranscript(pin.id, selected.id)
    }
  }, [resolved, onSetTranscript, chooseMode])

  const axisMax = useMemo(() => {
    let max = 1
    for (const row of resolved) {
      if (row.selected) max = Math.max(max, transcriptSpan(row.selected))
    }
    return max
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
      <div style={{ minWidth: plotWidth + LABEL_GUTTER_W }}>
        <div className="sticky top-0 z-10 flex border-b border-border/60 bg-background/95 backdrop-blur">
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
            <p className="px-3 pb-1 text-[10px] tabular-nums text-muted-foreground">
              Shared scale · {formatBp(axisMax)} max span
              {zoom !== 1 ? ` · ${Math.round(zoom * 100)}%` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col">
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
                className="flex border-b border-border/40 py-1"
              >
                <div
                  className="flex shrink-0 items-center justify-center self-stretch"
                  style={{ width: LABEL_GUTTER_W }}
                >
                  <TrackDownloadStub geneName={pin.geneName} />
                </div>
                <div className="min-w-0 flex-1" style={{ width: plotWidth }}>
                  <div className="relative mb-0.5 flex h-6 items-center gap-2 px-2">
                    <p className="min-w-0 truncate text-center text-[11px] leading-tight">
                      <span className="italic text-foreground">
                        {pin.species}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="font-mono font-medium">
                        {pin.geneName}
                      </span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="tabular-nums text-muted-foreground">
                        {meta}
                      </span>
                    </p>
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                      {transcripts.length > 0 && chooseMode ? (
                        <Select
                          value={selected?.id ?? undefined}
                          onValueChange={(v) => onSetTranscript(pin.id, v)}
                        >
                          <SelectTrigger className="h-6 w-[9.5rem] text-[10px]">
                            <SelectValue placeholder="Transcript" />
                          </SelectTrigger>
                          <SelectContent>
                            {transcripts.map((tx) => (
                              <SelectItem
                                key={tx.id}
                                value={tx.id}
                                className="text-xs"
                              >
                                {tx.synthetic
                                  ? "gene structure"
                                  : displayId(tx.id)}{" "}
                                <span className="text-muted-foreground">
                                  ({formatBp(transcriptSpan(tx))})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : selected ? (
                        <span className="max-w-[9rem] truncate font-mono text-[10px] text-muted-foreground">
                          {selected.synthetic
                            ? "gene structure"
                            : displayId(selected.id)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full overflow-hidden bg-muted/20">
                    {query?.isLoading ? (
                      <div
                        className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"
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
                        ticks={ticks}
                        featureMode={featureMode}
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center text-[11px] text-muted-foreground"
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
      </div>
    </div>
  )
}
