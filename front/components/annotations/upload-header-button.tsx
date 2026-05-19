"use client"

import { Button } from "@/components/ui/button"
import { Loader2, UploadCloud, Check, Trash2, FileText } from "lucide-react"
import { useCustomUpload } from "@/components/annotations/custom-upload-context"
import { getAnnotationDisplayName } from "@/lib/annotation-display"

interface UploadHeaderButtonProps {
  onOpenDrawer: () => void
}

export function UploadHeaderButton({ onOpenDrawer }: UploadHeaderButtonProps) {
  const {
    uploadSession,
    phase,
    loadingLabel,
    confirmAddToFavorites,
    discardSession,
  } = useCustomUpload()

  if (phase === "idle") {
    return (
      <Button
        size="sm"
        variant="default"
        onClick={onOpenDrawer}
        className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2"
        aria-label="Upload custom GFF or JSON"
      >
        <UploadCloud className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Upload custom GFF / JSON</span>
      </Button>
    )
  }

  if (phase === "loading") {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={onOpenDrawer}
        className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:min-w-[10rem] sm:px-3 sm:gap-2"
        aria-label={loadingLabel}
        title={loadingLabel}
      >
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span className="hidden sm:inline truncate">{loadingLabel}</span>
      </Button>
    )
  }

  if (phase === "error") {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={onOpenDrawer}
          className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2"
          aria-label="Upload failed — view details"
          title="Upload failed — view details"
        >
          <UploadCloud className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Upload failed — view details</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={discardSession}
          className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2"
          aria-label="Discard upload"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Discard</span>
        </Button>
      </div>
    )
  }

  const displayName = uploadSession.result
    ? getAnnotationDisplayName(uploadSession.result)
    : uploadSession.customName || "Custom annotation"

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <span className="text-xs text-muted-foreground hidden sm:inline max-w-[12rem] truncate" title={displayName}>
        Ready: {displayName}
      </span>
      <Button
        size="sm"
        onClick={confirmAddToFavorites}
        className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2"
        aria-label="Add to favorites"
        title={displayName}
      >
        <Check className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Add to favorites</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenDrawer}
        className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2"
        aria-label="Review upload"
      >
        <FileText className="h-4 w-4 shrink-0 sm:hidden" />
        <span className="hidden sm:inline">Review</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={discardSession}
        className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2 text-muted-foreground"
        aria-label="Discard upload"
      >
        <Trash2 className="h-4 w-4 shrink-0" />
        <span className="hidden sm:inline">Discard</span>
      </Button>
    </div>
  )
}
