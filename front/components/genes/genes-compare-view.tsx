"use client"

import { useCallback, useEffect, useState } from "react"
import { Pin } from "lucide-react"

import {
  GenesCompareTracks,
  type CompareFeatureMode,
} from "@/components/genes/genes-compare-tracks"
import { GenesCompareToolbar } from "@/components/genes/genes-compare-toolbar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useCompareStore } from "@/lib/genes/compare-store"
import { toastUndo } from "@/lib/genes/toast-undo"
import { cn } from "@/lib/utils"

const ZOOM_MIN = 1
const ZOOM_MAX = 8
const ZOOM_STEP = 1.5

interface GenesCompareViewProps {
  onGoToAnnotations: () => void
  className?: string
}

export function GenesCompareView({
  onGoToAnnotations,
  className,
}: GenesCompareViewProps) {
  const pins = useCompareStore((s) => s.pins)
  const unpin = useCompareStore((s) => s.unpin)
  const clearPins = useCompareStore((s) => s.clearPins)
  const setPins = useCompareStore((s) => s.setPins)
  const setPinTranscript = useCompareStore((s) => s.setPinTranscript)

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

  const onRemovePin = useCallback(
    (pinId: string) => {
      const snapshot = [...useCompareStore.getState().pins]
      const pin = snapshot.find((p) => p.id === pinId)
      if (!pin) return
      unpin(pinId)
      toastUndo(`Removed ${pin.geneName} · Undo`, () => setPins(snapshot))
    },
    [unpin, setPins],
  )

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
          "flex min-h-0 flex-1 flex-col items-center justify-center px-6",
          className,
        )}
      >
        <Card className="w-full max-w-sm border-2 border-dashed p-8 text-center">
          <Pin className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No genes pinned</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Switch to Pin mode in Annotations and click a gene cell, or pin
            from an annotation&apos;s gene drawer, to compare transcripts here.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4 h-9"
            onClick={onGoToAnnotations}
          >
            Add genes
          </Button>
        </Card>
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
      <GenesCompareToolbar
        pinCount={pins.length}
        featureMode={featureMode}
        onFeatureModeChange={setFeatureMode}
        zoom={zoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onClear={onClear}
        onAddGenes={onGoToAnnotations}
      />

      <GenesCompareTracks
        pins={pins}
        onSetTranscript={setPinTranscript}
        onRemovePin={onRemovePin}
        zoom={zoom}
        featureMode={featureMode}
      />
    </section>
  )
}
