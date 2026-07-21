"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  downloadAnnotationsReport,
  type FetchAnnotationsParams,
} from "@/lib/api/annotations"
import {
  buildSelectedFieldsParam,
  getDefaultTsvFields,
  getExtendedTsvFields,
} from "@/lib/annotations-tsv-fields"

interface DownloadTsvDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalAnnotations: number
  buildDownloadParams: () => FetchAnnotationsParams
}

export function DownloadTsvDialog({
  open,
  onOpenChange,
  totalAnnotations,
  buildDownloadParams,
}: DownloadTsvDialogProps) {
  const [loading, setLoading] = useState(false)
  const [checkedExtended, setCheckedExtended] = useState<Set<string>>(new Set())

  const defaultFields = useMemo(() => getDefaultTsvFields(), [])
  const extendedFields = useMemo(() => getExtendedTsvFields(), [])
  const additionalCount = checkedExtended.size
  const totalColumnCount = defaultFields.length + additionalCount

  useEffect(() => {
    if (!open) {
      setCheckedExtended(new Set())
    }
  }, [open])

  const toggleExtendedField = useCallback((key: string, checked: boolean) => {
    setCheckedExtended((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const handleDownload = useCallback(async () => {
    try {
      setLoading(true)
      const params = { ...buildDownloadParams() }
      delete params.limit
      delete params.offset

      const selectedFields = buildSelectedFieldsParam(checkedExtended)
      if (selectedFields) {
        params.selected_fields = selectedFields
      }

      const blob = await downloadAnnotationsReport(params)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "annotations_report.tsv"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      onOpenChange(false)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [buildDownloadParams, checkedExtended, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Download TSV report</DialogTitle>
          <DialogDescription>
            Generate a TSV report of the current annotation results based on your active filters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="p-3 rounded-md border bg-muted/20">
            <div className="font-medium text-foreground">Default columns (always included)</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {defaultFields.map((field) => (
                <span
                  key={field.key}
                  className="inline-flex items-center rounded-md border bg-background px-2 py-0.5 text-xs font-mono text-muted-foreground"
                >
                  {field.key}
                </span>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-md border">
            <div className="font-medium text-foreground">Additional columns</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Select extra fields to append after the default columns.
            </p>
            <div className="mt-3 max-h-72 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {extendedFields.map((field) => {
                  const checkboxId = `tsv-field-${field.key}`
                  return (
                    <div key={field.key} className="flex items-start gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={checkedExtended.has(field.key)}
                        onCheckedChange={(value) =>
                          toggleExtendedField(field.key, value === true)
                        }
                        disabled={loading}
                      />
                      <Label
                        htmlFor={checkboxId}
                        className="cursor-pointer text-sm leading-snug"
                      >
                        <span className="font-medium text-foreground">{field.label}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {field.key}
                        </span>
                      </Label>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>



          <div className="p-3 rounded-md border bg-muted/40 space-y-2">
            <div className="font-medium text-foreground">Summary</div>
            <ul className="text-muted-foreground list-disc list-inside space-y-1">
              <li>
                Total annotations in current result set:{" "}
                <span className="text-foreground font-semibold">
                  {totalAnnotations.toLocaleString()}
                </span>
              </li>
              <li>
                Columns to export:{" "}
                <span className="text-foreground font-semibold">{totalColumnCount}</span>{" "}
                ({defaultFields.length} default
                {additionalCount > 0 ? ` + ${additionalCount} additional` : ""})
              </li>
            </ul>
          </div>
          <div className="p-3 rounded-md border bg-amber-50 dark:bg-amber-900/20">
            <div className="font-medium text-foreground">About file URLs in the report</div>
            <ul className="mt-2 text-amber-800 dark:text-amber-200 text-xs space-y-1">
              <li>
                <span className="font-semibold text-foreground">source_url</span>: direct link to
                the original source file provided by the data source.
              </li>
              <li>
                <span className="font-semibold text-foreground">bgzip_path/csi_path</span>: relative path of
                the file processed by Annotrieve (sorted, bgzipped, and indexed). To download,
                prepend{" "}
                <span className="font-mono text-foreground">
                  https://genome.crg.es/annotrieve/files
                </span>{" "}
                to this path.
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Preparing…" : "Download TSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
