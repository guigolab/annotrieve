"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileJson,
  FileUp,
  Info,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCustomUpload } from "@/components/annotations/custom-upload-context"
import type { CustomAnnotation } from "@/lib/types"
import { FeaturesSummary } from "@/components/sidebar/file-overview-dialog/features-summary"
import { OverviewSection } from "@/components/sidebar/file-overview-dialog/overview-section"
import { CustomAnnotationDetailHeader } from "@/components/annotations/custom-annotation-detail-header"

type UploadFlow = "gff" | "json" | "jsonl"

interface UploadCustomDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: "upload" | "view"
  viewAnnotation?: CustomAnnotation | null
}

interface FlowOption {
  id: UploadFlow
  title: string
  description: string
  icon: typeof UploadCloud
}

const FLOW_OPTIONS: FlowOption[] = [
  {
    id: "gff",
    title: "Upload GFF",
    description:
      "Upload a GFF3 file from your computer. We compute feature statistics on our servers and add the result to your favorites.",
    icon: UploadCloud,
  },
  {
    id: "json",
    title: "Import from JSON",
    description:
      "Paste or load a single annotation JSON (e.g. from a previous download). Useful when you already have computed stats.",
    icon: FileJson,
  },
  {
    id: "jsonl",
    title: "Import from JSONL",
    description:
      "Restore a library exported from Favorites — one annotation per line. We validate each line and handle duplicates.",
    icon: FileUp,
  },
]

function FlowPickerCard({
  option,
  onSelect,
}: {
  option: FlowOption
  onSelect: () => void
}) {
  const Icon = option.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl border border-border bg-card p-4 transition-all",
        "hover:border-primary/50 hover:bg-muted/40 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{option.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{option.description}</p>
        </div>
      </div>
    </button>
  )
}

function FlowBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2 mb-1">
      <ArrowLeft className="h-4 w-4" />
      Choose another method
    </Button>
  )
}

export function UploadCustomDrawer({
  open,
  onOpenChange,
  mode = "upload",
  viewAnnotation = null,
}: UploadCustomDrawerProps) {
  const {
    uploadSession,
    phase,
    submitting,
    rateLimit,
    canStartNewUpload,
    isSessionLocked,
    loadingLabel,
    setUploadSession,
    discardSession,
    confirmAddToFavorites,
    submitGff,
    submitJson,
    previewJsonlImport,
    hasNameClash,
    jsonlParsing,
    jsonlImportSummary,
  } = useCustomUpload()

  const [activeFlow, setActiveFlow] = useState<UploadFlow | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [jsonFileName, setJsonFileName] = useState<string | null>(null)
  const [jsonlLocalError, setJsonlLocalError] = useState<string | null>(null)

  const isViewMode = mode === "view" && viewAnnotation != null
  const { customName, jsonText, result, jobError } = uploadSession
  const gffFileLabel = selectedFile?.name ?? uploadSession.gffFileName
  const displayAnnotation = isViewMode ? viewAnnotation : result

  const handleClose = () => {
    setActiveFlow(null)
    onOpenChange(false)
  }

  const handleBackToPicker = () => {
    setActiveFlow(null)
    setSelectedFile(null)
    setJsonFileName(null)
    setJsonlLocalError(null)
    setUploadSession({ jobError: null })
  }

  const handleGffSubmit = async () => {
    if (!selectedFile) {
      setUploadSession({ jobError: "Please select a GFF file." })
      return
    }
    await submitGff(selectedFile)
  }

  const handleJsonFileChange = (file: File | null) => {
    if (!file) return
    setJsonFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setUploadSession({
        jsonText: typeof reader.result === "string" ? reader.result : "",
        jobError: null,
      })
    }
    reader.onerror = () => setUploadSession({ jobError: "Failed to read JSON file." })
    reader.readAsText(file)
  }

  const handleJsonlFile = async (file: File | null) => {
    if (!file) return
    setJsonlLocalError(null)
    try {
      const preview = await previewJsonlImport(file)
      const importable =
        preview.newAnnotations.length +
        preview.duplicates.length
      if (importable === 0 && preview.errors.length > 0) {
        setJsonlLocalError(
          `No valid annotations found. ${preview.errors.length} line${preview.errors.length !== 1 ? "s" : ""} failed validation.`,
        )
      }
    } catch (err: unknown) {
      setJsonlLocalError(err instanceof Error ? err.message : "Failed to read JSONL file.")
    }
  }

  const downloadAnnotationJson = (annotation: CustomAnnotation) => {
    const dataStr = JSON.stringify(annotation, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${annotation.custom_name || annotation.annotation_id}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const showPicker = !isViewMode && canStartNewUpload && !result && activeFlow === null
  const showFlowForm = !isViewMode && canStartNewUpload && !result && activeFlow !== null
  const showBottomBar = isViewMode || Boolean(result)

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ease-in-out",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={handleClose}
      />
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 bg-background border-l shadow-lg",
          "transition-transform duration-300 ease-in-out flex flex-col",
          open ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: "min(800px, 90vw)" }}
      >
        <div className="flex flex-col border-b flex-shrink-0 bg-muted/30">
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="text-lg font-semibold">
              {isViewMode ? "Custom annotation details" : "Add custom annotation"}
            </h2>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {!isViewMode && !displayAnnotation && (
            <p className="px-4 pb-3 text-xs text-muted-foreground">
              {isSessionLocked
                ? "Finish or discard the current upload using the header actions before starting a new one."
                : "Choose how you want to add a custom annotation to your favorites."}
            </p>
          )}
          {displayAnnotation && <CustomAnnotationDetailHeader annotation={displayAnnotation} />}
        </div>

        {!isViewMode && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>GFF uploads: 50 per 24 hours (tracked by IP).</span>
            </div>
            {rateLimit && (
              <span className="font-mono shrink-0">
                Remaining: <span className="font-semibold">{rateLimit.remaining}</span>
              </span>
            )}
          </div>
        )}

        <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", showBottomBar && "pb-24")}>
          {!isViewMode && phase === "loading" && (
            <Card className="p-6 flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">{loadingLabel}</p>
              <p className="text-xs text-muted-foreground">
                Computing statistics. You can close this panel and use the header when ready.
              </p>
            </Card>
          )}

          {!isViewMode && phase === "error" && (
            <Card className="p-4 border-destructive/40 bg-destructive/5 space-y-3">
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{jobError || "Upload failed."}</span>
              </div>
              <Button variant="outline" size="sm" onClick={discardSession} className="gap-2">
                Discard and try again
              </Button>
            </Card>
          )}

          {showPicker && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick the option that matches your data. You can switch methods anytime before
                submitting.
              </p>
              <div className="grid gap-3">
                {FLOW_OPTIONS.map((option) => (
                  <FlowPickerCard
                    key={option.id}
                    option={option}
                    onSelect={() => setActiveFlow(option.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {showFlowForm && activeFlow === "gff" && (
            <Card className="p-4 space-y-4">
              <FlowBackButton onBack={handleBackToPicker} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Upload GFF3</h3>
                <p className="text-xs text-muted-foreground">
                  We read your file, compute gene and transcript statistics, and store the result
                  locally in this browser.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Display name</label>
                <Input
                  value={customName}
                  onChange={(e) => setUploadSession({ customName: e.target.value, jobError: null })}
                  placeholder="My experiment annotation"
                />
                {customName && hasNameClash(customName) && (
                  <p className="text-xs text-destructive">This name is already used.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">GFF3 file</label>
                <Input
                  type="file"
                  accept=".gff,.gff3,.gff.gz,.gff3.gz"
                  onChange={(e) => {
                    setSelectedFile(e.target.files?.[0] || null)
                    setUploadSession({ jobError: null })
                  }}
                />
                {gffFileLabel && (
                  <p className="text-xs text-muted-foreground">
                    Selected: <span className="font-mono">{gffFileLabel}</span>
                  </p>
                )}
              </div>
              {jobError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{jobError}</span>
                </div>
              )}
              <Button
                className="w-full"
                onClick={handleGffSubmit}
                disabled={
                  submitting || !customName.trim() || !selectedFile || hasNameClash(customName)
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4 mr-2" />
                    Upload and compute
                  </>
                )}
              </Button>
            </Card>
          )}

          {showFlowForm && activeFlow === "json" && (
            <Card className="p-4 space-y-4">
              <FlowBackButton onBack={handleBackToPicker} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Import from JSON</h3>
                <p className="text-xs text-muted-foreground">
                  Provide one annotation object with{" "}
                  <span className="font-mono text-foreground">kind: &quot;custom&quot;</span>,{" "}
                  <span className="font-mono text-foreground">features_summary</span>, and MD5
                  metadata. Statistics are optional but recommended for charts.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Display name</label>
                <Input
                  value={customName}
                  onChange={(e) => setUploadSession({ customName: e.target.value, jobError: null })}
                  placeholder="Overrides name in JSON if set"
                />
                {customName && hasNameClash(customName) && (
                  <p className="text-xs text-destructive">This name is already used.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Load JSON file</label>
                <Input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => handleJsonFileChange(e.target.files?.[0] || null)}
                />
                {jsonFileName && (
                  <p className="text-xs text-muted-foreground">
                    Loaded: <span className="font-mono">{jsonFileName}</span>
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Or paste JSON</label>
                <Textarea
                  value={jsonText}
                  onChange={(e) =>
                    setUploadSession({ jsonText: e.target.value, jobError: null })
                  }
                  rows={8}
                  className="font-mono text-xs"
                  placeholder='{"kind":"custom","custom_name":"…","uploaded_md5":"…","features_summary":{…}}'
                />
              </div>
              {jobError && (
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{jobError}</span>
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => submitJson()}
                disabled={!jsonText.trim() || !customName.trim() || hasNameClash(customName)}
              >
                <FileJson className="h-4 w-4 mr-2" />
                Validate and preview
              </Button>
            </Card>
          )}

          {showFlowForm && activeFlow === "jsonl" && (
            <Card className="p-4 space-y-4">
              <FlowBackButton onBack={handleBackToPicker} />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Import from JSONL</h3>
                <p className="text-xs text-muted-foreground">
                  Each non-empty line must be a valid custom annotation JSON. We check syntax,
                  required fields, duplicates in the file, and matches with your existing library
                  before importing.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">JSONL file</label>
                <Input
                  type="file"
                  accept=".jsonl,application/x-ndjson,.json"
                  disabled={jsonlParsing}
                  onChange={(e) => {
                    void handleJsonlFile(e.target.files?.[0] ?? null)
                    e.target.value = ""
                  }}
                />
              </div>
              {jsonlParsing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Validating file…
                </div>
              )}
              {jsonlLocalError && (
                <div className="flex items-start gap-2 text-xs text-destructive rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{jsonlLocalError}</span>
                </div>
              )}
              {jsonlImportSummary && (
                <div className="flex items-start gap-2 text-xs text-foreground rounded-md border border-primary/30 bg-primary/5 p-3">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>{jsonlImportSummary}</span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                After selecting a file, a review dialog lets you skip or overwrite duplicates.
              </p>
            </Card>
          )}

          {displayAnnotation && (
            <div className="space-y-4">
              <FeaturesSummary annotation={displayAnnotation} />
              {displayAnnotation.features_statistics && (
                <OverviewSection stats={displayAnnotation.features_statistics as any} />
              )}
            </div>
          )}
        </div>

        {showBottomBar && displayAnnotation && (
          <div className="shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4 space-y-3">
            <div className="flex items-center justify-end gap-2">
              <Button size="lg" variant="outline" onClick={() => downloadAnnotationJson(displayAnnotation)}>
                Download JSON
              </Button>
              {!isViewMode && (
                <Button
                  onClick={() => {
                    if (confirmAddToFavorites()) {
                      onOpenChange(false)
                    }
                  }}
                  size="lg"
                >
                  Add to favorites
                </Button>
              )}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Stored locally with display name, upload date, file size, and MD5. Compare with
              catalog favorites using the same charts.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
