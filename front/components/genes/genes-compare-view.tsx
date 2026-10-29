"use client"

import { useCallback, useEffect, useState } from "react"
import { Minus, Pin, Plus, X } from "lucide-react"

import {
  GenesCompareTracks,
  type CompareFeatureMode,
} from "@/components/genes/genes-compare-tracks"
import { Button } from "@/components/ui/button"
import {
  useCompareStore,
  type TranscriptMode,
} from "@/lib/genes/compare-store"
import { toastUndo } from "@/lib/genes/toast-undo"
import { cn } from "@/lib/utils"

const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.5

interface GenesCompareViewProps {
  onGoToAnnotations: () => void
  className?: string
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-md border border-border p-0.5 text-[11px]"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cn(
            "rounded px-2 py-1 font-medium transition-colors",
            value === o.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function GenesCompareView({
  onGoToAnnotations,
  className,
}: GenesCompareViewProps) {
  const pins = useCompareStore((s) => s.pins)
  const transcriptMode = useCompareStore((s) => s.transcriptMode)
  const unpin = useCompareStore((s) => s.unpin)
  const clearPins = useCompareStore((s) => s.clearPins)
  const setPins = useCompareStore((s) => s.setPins)
  const setPinTranscript = useCompareStore((s) => s.setPinTranscript)
  const setTranscriptMode = useCompareStore((s) => s.setTranscriptMode)

  const [zoom, setZoom] = useState(1)
  const [featureMode, setFeatureMode] =
    useState<CompareFeatureMode>("all")

  const pinKey = pins.map((p) => p.id).join(",")
  useEffect(() => {
    setZoom(1)
  }, [pinKey])

  const onClear = useCallback(() => {
    const snapshot = [...useCompareStore.getState().pins]
    if (!snapshot.length) return
    clearPins()
    toastUndo(
      `Cleared ${snapshot.length} pin${snapshot.length === 1 ? "" : "s"} · Undo`,
      () => setPins(snapshot),
    )
  }, [clearPins, setPins])

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(ZOOM_MIN, Math.round((z / ZOOM_STEP) * 100) / 100))
  }, [])

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.round(z * ZOOM_STEP * 100) / 100))
  }, [])

  if (!pins.length) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center",
          className,
        )}
      >
        <Pin className="h-8 w-8 text-muted-foreground/60" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-medium">No genes pinned</p>
          <p className="text-xs text-muted-foreground">
            Pin genes from the Annotations list (single-gene queries) or from
            an annotation&apos;s gene drawer to compare transcripts here.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 text-sm"
          onClick={onGoToAnnotations}
        >
          Add genes →
        </Button>
      </div>
    )
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <Pin className="h-3.5 w-3.5 text-primary" aria-hidden />
        <p className="min-w-0 text-xs font-medium">
          Compare ·{" "}
          <span className="tabular-nums text-muted-foreground">
            {pins.length} pinned
          </span>
        </p>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] text-muted-foreground">Features:</span>
          <SegmentedControl
            label="Feature display"
            value={featureMode}
            onChange={setFeatureMode}
            options={[
              { id: "all", label: "All" },
              { id: "exons", label: "Exons" },
              { id: "cds", label: "CDS" },
            ]}
          />
          <span className="text-[11px] text-muted-foreground">Transcript:</span>
          <SegmentedControl
            label="Transcript mode"
            value={transcriptMode}
            onChange={(m: TranscriptMode) => setTranscriptMode(m)}
            options={[
              { id: "longest", label: "Longest" },
              { id: "choose", label: "Choose per track" },
            ]}
          />
          <div
            role="group"
            aria-label="Zoom"
            className="inline-flex items-center gap-0.5"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Zoom out"
              disabled={zoom <= ZOOM_MIN}
              onClick={zoomOut}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[2.75rem] text-center text-[11px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              aria-label="Zoom in"
              disabled={zoom >= ZOOM_MAX}
              onClick={zoomIn}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onClear}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={onGoToAnnotations}
          >
            Add genes →
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/40 px-3 py-2 sm:px-4">
        {pins.map((pin) => (
          <span
            key={pin.id}
            className="inline-flex max-w-full items-center gap-1 border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            <span className="truncate italic">{pin.species}</span>
            <span className="truncate font-mono">{pin.geneName}</span>
            <button
              type="button"
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={`Unpin ${pin.geneName}`}
              onClick={() => unpin(pin.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <GenesCompareTracks
        pins={pins}
        transcriptMode={transcriptMode}
        onSetTranscript={setPinTranscript}
        zoom={zoom}
        featureMode={featureMode}
      />
    </section>
  )
}
