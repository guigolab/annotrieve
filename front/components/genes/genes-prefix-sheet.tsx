"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  canonicalTaxidCsv,
  searchNames,
  XrefsApiError,
} from "@/lib/api/xrefs"
import type { NameCategory } from "@/lib/api/xrefs-types"
import {
  MAX_NAMES_GET,
  NAME_CATEGORY_ORDER,
  normalizePrefix,
} from "@/lib/genes/prefix"
import { cn } from "@/lib/utils"

interface GenesPrefixSheetProps {
  open: boolean
  onClose: () => void
  onApply: (names: string[]) => void
  names: string[]
  includeTaxids: number[]
  excludeTaxids: number[]
  onToggle: (name: string, checked: boolean) => void
  onIncludeShown: (names: string[]) => void
  onExcludeShown: (names: string[]) => void
  /** Seed the prefix input when the sheet opens. */
  initialPrefix?: string
}

export function GenesPrefixSheet({
  open,
  onClose,
  onApply,
  names,
  includeTaxids,
  excludeTaxids,
  onToggle,
  onIncludeShown,
  onExcludeShown,
  initialPrefix = "",
}: GenesPrefixSheetProps) {
  const [draft, setDraft] = useState("")
  const [debounced, setDebounced] = useState("")
  const [bucket, setBucket] = useState<NameCategory | "all">("all")

  useEffect(() => {
    if (!open) return
    const seed = initialPrefix.replace(/\*$/, "")
    if (seed) {
      setDraft(seed)
      setDebounced(seed)
    }
  }, [open, initialPrefix])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(draft.trim()), 400)
    return () => clearTimeout(id)
  }, [draft])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const normalized = debounced ? normalizePrefix(debounced) : null
  const prefix = normalized && "prefix" in normalized ? normalized.prefix : null
  const localError = normalized && "error" in normalized ? normalized.error : null

  const query = useQuery({
    queryKey: [
      "genes-names",
      prefix,
      canonicalTaxidCsv(includeTaxids) ?? "",
      canonicalTaxidCsv(excludeTaxids) ?? "",
    ],
    enabled: open && Boolean(prefix),
    staleTime: 10 * 60 * 1000,
    queryFn: ({ signal }) =>
      searchNames(
        {
          prefix: prefix!,
          include_taxids: includeTaxids.length ? includeTaxids : null,
          exclude_taxids: excludeTaxids.length ? excludeTaxids : null,
        },
        { signal },
      ),
  })

  const rows = query.data?.results ?? []
  const bucketCounts = useMemo(() => {
    const counts = new Map<NameCategory, number>()
    for (const row of rows) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
    }
    return counts
  }, [rows])
  const activeBucket =
    bucket !== "all" && (bucketCounts.get(bucket) ?? 0) === 0 ? "all" : bucket
  const visible = useMemo(
    () =>
      activeBucket === "all"
        ? rows
        : rows.filter((row) => row.category === activeBucket),
    [rows, activeBucket],
  )
  const selected = new Set(names.map((n) => n.toLowerCase()))
  const atCap = names.length >= MAX_NAMES_GET
  const room = Math.max(0, MAX_NAMES_GET - names.length)

  const errorMessage =
    (debounced ? localError : null) ??
    (query.error instanceof XrefsApiError
      ? query.error.detail?.message ?? query.error.message
      : query.error
        ? String((query.error as Error).message ?? query.error)
        : null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Cancel prefix sheet"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-r bg-background shadow-xl">
        <header className="flex items-start gap-2 border-b px-4 py-3 shrink-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-sm font-semibold tracking-tight">
              Add by prefix
            </h2>
            <p className="text-xs text-muted-foreground">
              Expand a prefix into gene names, then add them to your set.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="px-4 py-3 shrink-0 space-y-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Prefix, e.g. seleno"
            className="h-11 rounded-xl shadow-sm bg-background"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            At least 3 characters. Selected{" "}
            <span className="tabular-nums">
              {names.length}/{MAX_NAMES_GET}
            </span>
            .
          </p>
        </div>

        {draft.trim() && rows.length > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5 shrink-0">
            {NAME_CATEGORY_ORDER.map((item) => {
              const count =
                item.id === "all" ? rows.length : bucketCounts.get(item.id) ?? 0
              if (count === 0) return null
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBucket(item.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
                    activeBucket === item.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {item.label} {count.toLocaleString()}
                </button>
              )
            })}
            <button
              type="button"
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
              disabled={!visible.length || room <= 0}
              onClick={() =>
                onIncludeShown(visible.slice(0, room).map((row) => row.name))
              }
            >
              Add shown
            </button>
            <button
              type="button"
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
              disabled={!visible.length}
              onClick={() => onExcludeShown(visible.map((row) => row.name))}
            >
              Remove shown
            </button>
          </div>
        )}

        {errorMessage && (
          <p className="px-4 pb-2 text-sm text-destructive">{errorMessage}</p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
          {!draft.trim() && !query.isFetching && (
            <p className="px-2 py-8 text-xs text-muted-foreground text-center">
              Try a prefix like <span className="font-mono">seleno</span> to
              list matching gene names.
            </p>
          )}
          {query.isFetching && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Expanding prefix…
            </div>
          )}
          {!query.isFetching && prefix && !errorMessage && !visible.length && (
            <p className="px-2 py-6 text-xs text-muted-foreground text-center">
              {activeBucket === "all"
                ? "No gene names match this prefix."
                : "No gene names in this group."}
            </p>
          )}
          {visible.map((row) => {
            const checked = selected.has(row.name.toLowerCase())
            const disabled = !checked && atCap
            return (
              <label
                key={row.name}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50",
                  disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) =>
                    onToggle(row.name, value === true)
                  }
                />
                <span
                  className="font-mono text-sm truncate flex-1"
                  title={row.name}
                >
                  {row.name}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.n_annotations.toLocaleString()}
                </span>
              </label>
            )
          })}
        </div>

        <footer className="shrink-0 border-t px-4 py-3 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl font-semibold"
            disabled={!names.length}
            onClick={() => onApply(names)}
          >
            {names.length
              ? `Add ${names.length.toLocaleString()} to gene set`
              : "Add to gene set"}
          </Button>
        </footer>
      </aside>
    </div>
  )
}
