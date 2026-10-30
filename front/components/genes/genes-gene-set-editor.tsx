"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ChevronDown, Sparkles, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import type { HitTerm } from "@/lib/api/xrefs-types"
import type { ResolvedTerm } from "@/lib/genes/adapter"
import {
  buildGeneSetEditorRows,
  formatGeneSetChipLabel,
} from "@/lib/genes/gene-set"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import {
  exactNamesBeforePrefixSheet,
  partitionTokens,
  tokenizeGeneQuery,
  uniqueNames,
} from "@/lib/genes/tokenize"
import { useMediaQuery } from "@/lib/hooks/use-media-query"
import { cn } from "@/lib/utils"

interface GenesGeneSetEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queryNames: string[]
  hitTerms: HitTerm[]
  activeTerms: ResolvedTerm[]
  onApplyText: (names: string[]) => void
  onOpenPrefix: () => void
  /** Sync textarea draft into the query input before opening the prefix sheet. */
  onPreparePrefixDraft: (draft: string) => void
  onRemoveName: (name: string) => void
  onRemoveZeroHits: (names: string[]) => void
  onClearAll: () => void
  /** Summary chip rendered as the trigger when using Popover. */
  trigger?: ReactNode
}

function EditorBody({
  queryNames,
  hitTerms,
  activeTerms,
  onApplyText,
  onOpenPrefix,
  onPreparePrefixDraft,
  onRemoveName,
  onRemoveZeroHits,
  onClearAll,
  onRequestClose,
}: Omit<GenesGeneSetEditorProps, "open" | "onOpenChange" | "trigger"> & {
  onRequestClose?: () => void
}) {
  const [draft, setDraft] = useState(queryNames.join(", "))

  useEffect(() => {
    setDraft(queryNames.join(", "))
  }, [queryNames])

  const rows = useMemo(
    () => buildGeneSetEditorRows(queryNames, hitTerms, activeTerms),
    [queryNames, hitTerms, activeTerms],
  )
  const zeroHitNames = useMemo(
    () => rows.filter((r) => r.zeroHits).map((r) => r.name),
    [rows],
  )

  const applyText = () => {
    const tokens = tokenizeGeneQuery(draft)
    const beforePrefix = exactNamesBeforePrefixSheet(draft)
    if (beforePrefix) {
      // Prefixes in the textarea must go through the sheet — hand off.
      onPreparePrefixDraft(draft)
      onOpenPrefix()
      return
    }
    const exact = uniqueNames(
      partitionTokens(tokens).exact,
      MAX_NAMES_GET,
    )
    onApplyText(exact)
  }

  return (
    <div className="flex max-h-[min(32rem,80vh)] flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          Gene set · {queryNames.length.toLocaleString()} genes
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {queryNames.length}/{MAX_NAMES_GET}
        </p>
      </div>

      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="BRCA1, TP53, MYC…"
        className="min-h-[4.5rem] resize-y rounded-md text-sm"
        aria-label="Edit gene set as text"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg"
          onClick={applyText}
        >
          Apply text
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg"
          onClick={() => {
            onOpenPrefix()
            onRequestClose?.()
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Add by prefix…
        </Button>
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {rows.length === 0 ? (
          <li className="px-1 py-6 text-center text-xs text-muted-foreground">
            No genes in the set yet.
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm",
                row.zeroHits && "text-amber-700 dark:text-amber-400",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-mono" title={row.name}>
                {row.name}
                {row.viaAlias ? (
                  <Badge
                    variant="outline"
                    className="ml-1.5 align-middle text-xs font-normal"
                  >
                    alias
                  </Badge>
                ) : null}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {row.zeroHits
                  ? "no hits"
                  : `${row.count.toLocaleString()} annotations`}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${row.name}`}
                onClick={() => onRemoveName(row.name)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="flex flex-wrap gap-2 border-t border-border pt-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={!zeroHitNames.length}
          onClick={() => onRemoveZeroHits(zeroHitNames)}
        >
          Remove all with no hits
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground"
          disabled={!queryNames.length}
          onClick={onClearAll}
        >
          Clear all
        </Button>
      </div>
    </div>
  )
}

export function GenesGeneSetEditor({
  open,
  onOpenChange,
  queryNames,
  hitTerms,
  activeTerms,
  onApplyText,
  onOpenPrefix,
  onPreparePrefixDraft,
  onRemoveName,
  onRemoveZeroHits,
  onClearAll,
  trigger,
}: GenesGeneSetEditorProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const chipLabel = formatGeneSetChipLabel(queryNames)
  const defaultTrigger = (
    <Button
      type="button"
      variant="outline"
      className="h-9 max-w-[16rem] shrink-0 gap-1.5 rounded-md px-3"
      aria-expanded={open}
      title={queryNames.join(", ") || "Gene set"}
    >
      <span className="text-muted-foreground">Genes</span>
      <span className="min-w-0 truncate font-medium">
        {queryNames.length ? chipLabel : "none"}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </Button>
  )

  const body = (
    <EditorBody
      queryNames={queryNames}
      hitTerms={hitTerms}
      activeTerms={activeTerms}
      onApplyText={onApplyText}
      onOpenPrefix={onOpenPrefix}
      onPreparePrefixDraft={onPreparePrefixDraft}
      onRemoveName={onRemoveName}
      onRemoveZeroHits={onRemoveZeroHits}
      onClearAll={onClearAll}
      onRequestClose={() => onOpenChange(false)}
    />
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] p-3 sm:w-[26rem]">
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      <span
        onClick={() => onOpenChange(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onOpenChange(true)
          }
        }}
        role="button"
        tabIndex={0}
      >
        {trigger ?? defaultTrigger}
      </span>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl p-4">
          <SheetHeader className="sr-only">
            <SheetTitle>Gene set</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    </>
  )
}
