"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  geneCategoryOf,
  GENE_CATEGORY_STYLE,
} from "@/lib/genes/gene-category"
import {
  cdsLength,
  pickLongestTranscript,
  transcriptSpan,
  type GffTranscript,
} from "@/lib/genes/gff"
import { formatBp } from "@/lib/genes/format"
import { cn } from "@/lib/utils"

function displayId(id: string): string {
  return id.replace(/^(transcript:|mrna:|rna:)/i, "")
}

interface GenesCompareTranscriptPickerProps {
  geneName: string
  species: string
  transcripts: GffTranscript[]
  selected: GffTranscript | null
  /** Explicit pin.transcriptId; null means defaulting to longest. */
  pinnedTranscriptId: string | null
  onSelect: (transcriptId: string) => void
  onUseLongest: () => void
  className?: string
}

export function GenesCompareTranscriptPicker({
  geneName,
  species,
  transcripts,
  selected,
  pinnedTranscriptId,
  onSelect,
  onUseLongest,
  className,
}: GenesCompareTranscriptPickerProps) {
  const [open, setOpen] = useState(false)

  const longest = useMemo(
    () => pickLongestTranscript(transcripts),
    [transcripts],
  )

  if (transcripts.length <= 1) {
    if (!selected) return null
    return (
      <span
        className={cn(
          "max-w-[9rem] truncate font-mono text-xs text-muted-foreground",
          className,
        )}
        title={
          selected.synthetic ? "gene structure" : displayId(selected.id)
        }
      >
        {selected.synthetic ? "gene structure" : displayId(selected.id)}
      </span>
    )
  }

  const label = selected
    ? selected.synthetic
      ? "gene structure"
      : displayId(selected.id)
    : "Transcript"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-6 max-w-[11rem] gap-1 px-1.5 text-xs font-normal",
            className,
          )}
          aria-label={`Choose transcript for ${geneName}`}
        >
          <span className="min-w-0 truncate font-mono">{label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {transcripts.length}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 max-h-[min(60vh,28rem)]"
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{geneName}</p>
            <p className="truncate text-xs italic text-muted-foreground">
              {species}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Close transcript picker"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div
          role="radiogroup"
          aria-label="Transcripts"
          className="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          {transcripts.map((tx) => {
            const isSelected = selected?.id === tx.id
            const isLongest = longest?.id === tx.id
            const cat = geneCategoryOf({
              feature_type: tx.type,
              biotype: tx.biotype,
              hasCds: tx.cds.length > 0,
            })
            const style = GENE_CATEGORY_STYLE[cat]
            const span = transcriptSpan(tx)
            const exons = tx.exons.length
            const cdsBp = cdsLength(tx.cds)
            const kind =
              tx.biotype ||
              tx.type ||
              (tx.synthetic ? "gene" : "transcript")
            return (
              <button
                key={tx.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isSelected && "bg-primary/10",
                )}
                onClick={() => {
                  onSelect(tx.id)
                  setOpen(false)
                }}
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: style.token }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-mono font-medium">
                      {tx.synthetic ? "gene structure" : displayId(tx.id)}
                    </span>
                    {isLongest ? (
                      <span className="rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Longest
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-muted-foreground">
                    {kind}
                    {" · "}
                    {formatBp(span)}
                    {" · "}
                    {exons} exon{exons === 1 ? "" : "s"}
                    {cdsBp > 0 ? ` · ${formatBp(cdsBp)} CDS` : ""}
                  </span>
                </span>
                {isSelected ? (
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                    aria-hidden
                  />
                ) : (
                  <span className="w-3.5 shrink-0" aria-hidden />
                )}
              </button>
            )
          })}
        </div>

        {pinnedTranscriptId ? (
          <footer className="shrink-0 border-t border-border px-3 py-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                onUseLongest()
                setOpen(false)
              }}
            >
              Use longest
            </button>
          </footer>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
