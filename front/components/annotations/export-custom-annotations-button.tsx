"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Download } from "lucide-react"
import { downloadCustomAnnotationsJsonl } from "@/lib/custom-annotations-jsonl"
import type { CustomAnnotation } from "@/lib/types"

interface ExportCustomAnnotationsButtonProps {
  customAnnotations: CustomAnnotation[]
}

export function ExportCustomAnnotationsButton({
  customAnnotations,
}: ExportCustomAnnotationsButtonProps) {
  const [open, setOpen] = useState(false)
  const count = customAnnotations.length

  if (count === 0) return null

  const handleDownload = () => {
    downloadCustomAnnotationsJsonl(customAnnotations)
  }

  return (
    <>
      <div className="relative">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 sm:gap-2 sm:pr-3"
          onClick={() => setOpen(true)}
          aria-label={`Export ${count} custom annotation${count !== 1 ? "s" : ""}`}
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Export custom</span>
        </Button>
        <span
          className="pointer-events-none absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          aria-hidden
        >
          {count > 99 ? "99+" : count}
        </span>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export custom annotations</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground pt-1">
                <p>
                  Download a <span className="font-medium text-foreground">JSONL</span> file with{" "}
                  <span className="font-medium text-foreground">{count}</span> custom annotation
                  {count !== 1 ? "s" : ""} stored in this browser.
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Each line is one JSON object (display name, upload metadata, feature summary and statistics).</li>
                  <li>Raw GFF files are not included — only computed stats from your uploads.</li>
                  <li>
                    To restore on this or another device, open{" "}
                    <span className="font-medium text-foreground">Upload custom GFF / JSON</span> and use{" "}
                    <span className="font-medium text-foreground">Import from JSONL</span>.
                  </li>
                  <li>You can also import a single annotation via the JSON tab in that panel.</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button className="gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download JSONL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
