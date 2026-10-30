"use client"

import { useEffect, useState } from "react"
import { Search, Sparkles } from "lucide-react"

import { GenesGeneSetEditor } from "@/components/genes/genes-gene-set-editor"
import { GenesTaxaPopover } from "@/components/genes/genes-taxa-popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { GENES_CONTROL_H } from "@/lib/genes/ui"
import { cn } from "@/lib/utils"

interface GenesQueryBarProps {
  queryText: string
  onQueryTextChange: (text: string) => void
  onSearch: () => void
  onOpenPrefix: () => void
  onPasteCommit: (pasted: string) => boolean
  queryNames: string[]
  nameCount: number
  hitTerms: HitTerm[]
  activeTerms: ResolvedTerm[]
  onApplyText: (names: string[]) => void
  onPreparePrefixDraft: (draft: string) => void
  onRemoveName: (name: string) => void
  onRemoveZeroHits: (names: string[]) => void
  onClearAll: () => void
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  onApplyTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
  /** Increment to open the gene-set editor (e.g. zero-hit Review). */
  editorOpenSignal?: number
  className?: string
}

export function GenesQueryBar({
  queryText,
  onQueryTextChange,
  onSearch,
  onOpenPrefix,
  onPasteCommit,
  queryNames,
  nameCount,
  hitTerms,
  activeTerms,
  onApplyText,
  onPreparePrefixDraft,
  onRemoveName,
  onRemoveZeroHits,
  onClearAll,
  includeTaxa,
  excludeTaxa,
  onApplyTaxa,
  editorOpenSignal = 0,
  className,
}: GenesQueryBarProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const draftEmpty = !queryText.trim()
  const atLimit = nameCount >= MAX_NAMES_GET
  const showPrefixHint = queryText.includes("*")

  useEffect(() => {
    if (editorOpenSignal > 0) setEditorOpen(true)
  }, [editorOpenSignal])

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
    >
      <div className="relative min-w-0 flex-1 basis-[12rem]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={queryText}
          onChange={(e) => onQueryTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              if (!draftEmpty) onSearch()
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (text && onPasteCommit(text)) {
              e.preventDefault()
            }
          }}
          placeholder="Add genes (BRCA1, TP53 or prefix*)…"
          aria-label="Add gene names"
          className={cn(GENES_CONTROL_H, "rounded-md bg-background pl-10 pr-24")}
          disabled={atLimit && draftEmpty}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "absolute right-1 top-1/2 h-7 -translate-y-1/2 gap-1 px-2 text-xs",
            showPrefixHint ? "text-foreground" : "text-muted-foreground",
          )}
          onClick={() => onOpenPrefix()}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Prefix
        </Button>
      </div>

      <GenesGeneSetEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        queryNames={queryNames}
        hitTerms={hitTerms}
        activeTerms={activeTerms}
        onApplyText={(names) => {
          onApplyText(names)
          setEditorOpen(false)
        }}
        onOpenPrefix={() => {
          setEditorOpen(false)
          onOpenPrefix()
        }}
        onPreparePrefixDraft={onPreparePrefixDraft}
        onRemoveName={onRemoveName}
        onRemoveZeroHits={onRemoveZeroHits}
        onClearAll={onClearAll}
      />

      <GenesTaxaPopover
        includeTaxa={includeTaxa}
        excludeTaxa={excludeTaxa}
        onApply={onApplyTaxa}
      />
    </div>
  )
}
