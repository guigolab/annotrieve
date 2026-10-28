"use client"

import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { GENES_TSV_DOWNLOAD_CAP } from "@/lib/genes/ui"

interface GenesDownloadMenuProps {
  /** Full /hits set size (always available). */
  allCount: number
  /** Current selection size; omit or 0 to hide selection download. */
  selectionCount?: number
  showSelection?: boolean
  disabled?: boolean
  onDownloadAll: () => void
  onDownloadSelection?: () => void
}

export function GenesDownloadMenu({
  allCount,
  selectionCount = 0,
  showSelection = false,
  disabled,
  onDownloadAll,
  onDownloadSelection,
}: GenesDownloadMenuProps) {
  const allCapped = allCount > GENES_TSV_DOWNLOAD_CAP
  const selectionCapped = selectionCount > GENES_TSV_DOWNLOAD_CAP
  const canDownload = allCount > 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          disabled={disabled || !canDownload}
        >
          <Download className="h-4 w-4" />
          Download
          {canDownload ? ` (${allCount.toLocaleString()})` : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onClick={onDownloadAll} disabled={allCount === 0}>
          Download all (TSV)
          {allCapped && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              first {GENES_TSV_DOWNLOAD_CAP.toLocaleString()}
            </span>
          )}
        </DropdownMenuItem>
        {showSelection && onDownloadSelection ? (
          <DropdownMenuItem
            onClick={onDownloadSelection}
            disabled={selectionCount === 0}
          >
            Download selection (TSV)
            {selectionCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {selectionCapped
                  ? `first ${GENES_TSV_DOWNLOAD_CAP.toLocaleString()}`
                  : selectionCount.toLocaleString()}
              </span>
            ) : null}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          Annotation files (GFF)
          <span className="ml-auto text-[10px] text-muted-foreground">
            coming soon
          </span>
        </DropdownMenuItem>
        {(allCapped || (showSelection && selectionCapped)) && (
          <p className="px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            TSV export is capped at {GENES_TSV_DOWNLOAD_CAP.toLocaleString()}{" "}
            rows.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
