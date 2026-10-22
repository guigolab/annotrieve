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
  count: number
  disabled?: boolean
  onDownloadTsv: () => void
}

export function GenesDownloadMenu({
  count,
  disabled,
  onDownloadTsv,
}: GenesDownloadMenuProps) {
  const capped = count > GENES_TSV_DOWNLOAD_CAP

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0"
          disabled={disabled || count === 0}
        >
          <Download className="h-4 w-4" />
          Download{count > 0 ? ` (${count.toLocaleString()})` : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={onDownloadTsv}>
          Hits table (TSV)
          {capped && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              first {GENES_TSV_DOWNLOAD_CAP.toLocaleString()}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          Annotation files (GFF)
          <span className="ml-auto text-[10px] text-muted-foreground">
            coming soon
          </span>
        </DropdownMenuItem>
        {capped && (
          <p className="px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
            TSV export is capped at {GENES_TSV_DOWNLOAD_CAP.toLocaleString()}{" "}
            rows. Narrow filters to export fewer hits.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
