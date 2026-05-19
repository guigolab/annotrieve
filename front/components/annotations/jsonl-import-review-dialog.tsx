"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { getAnnotationDisplayName } from "@/lib/annotation-display"
import type { JsonlImportPreview } from "@/lib/custom-annotations-jsonl"

interface JsonlImportReviewDialogProps {
  open: boolean
  preview: JsonlImportPreview | null
  fileName?: string | null
  onCancel: () => void
  onImportSkipDuplicates: () => void
  onImportOverwrite: () => void
}

export function JsonlImportReviewDialog({
  open,
  preview,
  fileName,
  onCancel,
  onImportSkipDuplicates,
  onImportOverwrite,
}: JsonlImportReviewDialogProps) {
  if (!preview) return null

  const { newAnnotations, duplicates, errors } = preview
  const importableNew = newAnnotations.length
  const hasDuplicates = duplicates.length > 0
  const canImportAnything = importableNew > 0 || hasDuplicates

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review JSONL import</DialogTitle>
          <DialogDescription>
            {fileName ? (
              <>
                File <span className="font-mono text-foreground">{fileName}</span>
              </>
            ) : (
              "Review the annotations below before importing."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border border-border bg-muted/30 px-2 py-2">
              <p className="text-lg font-semibold text-foreground">{importableNew}</p>
              <p className="text-[10px] text-muted-foreground">New</p>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-2">
              <p className="text-lg font-semibold text-foreground">{duplicates.length}</p>
              <p className="text-[10px] text-muted-foreground">Duplicates</p>
            </div>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2">
              <p className="text-lg font-semibold text-foreground">{errors.length}</p>
              <p className="text-[10px] text-muted-foreground">Invalid lines</p>
            </div>
          </div>

          {hasDuplicates && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                Already in your library (same MD5)
              </p>
              <ul className="max-h-32 overflow-y-auto rounded-md border border-border text-xs divide-y divide-border">
                {duplicates.map((d) => (
                  <li key={`${d.line}-${d.incoming.annotation_id}`} className="px-3 py-2 space-y-0.5">
                    <p className="font-medium truncate">
                      Line {d.line}: {getAnnotationDisplayName(d.incoming)}
                    </p>
                    <p className="text-muted-foreground truncate">
                      Matches existing “{getAnnotationDisplayName(d.existing)}”
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground">
                Choose whether to keep the existing entries or replace them with the imported
                versions.
              </p>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-destructive">Invalid lines (will be skipped)</p>
              <ul className="max-h-28 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/5 text-xs divide-y divide-destructive/20">
                {errors.slice(0, 20).map((e) => (
                  <li key={`${e.line}-${e.message}`} className="px-3 py-1.5 text-destructive">
                    <span className="font-mono">Line {e.line}:</span> {e.message}
                  </li>
                ))}
                {errors.length > 20 && (
                  <li className="px-3 py-1.5 text-muted-foreground">
                    …and {errors.length - 20} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {!canImportAnything && (
            <p className="text-sm text-muted-foreground">
              Nothing can be imported. Fix invalid lines or remove duplicates from the file.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="sm:mr-auto">
            Cancel
          </Button>
          {hasDuplicates && importableNew > 0 && (
            <Button variant="secondary" onClick={onImportSkipDuplicates}>
              Import {importableNew} new only
            </Button>
          )}
          {hasDuplicates ? (
            <Button onClick={onImportOverwrite} disabled={!canImportAnything}>
              {importableNew > 0
                ? `Import all (${importableNew + duplicates.length})`
                : `Overwrite ${duplicates.length}`}
            </Button>
          ) : (
            canImportAnything && (
              <Button onClick={onImportSkipDuplicates}>
                Import {importableNew} annotation{importableNew !== 1 ? "s" : ""}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
