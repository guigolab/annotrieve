"use client"

import { Badge } from "@/components/ui/badge"
import type { GeneMatch } from "@/lib/api/xrefs-types"
import { groupMatches } from "@/lib/genes/matches"
import { cn } from "@/lib/utils"

interface GenesMatchChipsProps {
  matches: GeneMatch[] | undefined | null
  className?: string
}

export function GenesMatchChips({ matches, className }: GenesMatchChipsProps) {
  const grouped = groupMatches(matches)
  if (!grouped.chips.length) return null

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md px-1.5 py-1",
        grouped.multiKey && "bg-amber-500/10 ring-1 ring-amber-500/25",
        className,
      )}
    >
      {grouped.multiKey && (
        <Badge
          variant="outline"
          className="border-amber-500/30 bg-amber-500/20 text-xs font-medium text-amber-800 dark:text-amber-200"
        >
          {grouped.distinctInputs.length} keys hit this gene
        </Badge>
      )}
      {grouped.chips.map((chip) => {
        const isAlias = chip.ns === "alias"
        const label = chip.showMapping
          ? `${chip.input} → ${chip.name}`
          : chip.name
        return (
          <span
            key={`${chip.ns}:${chip.name}:${chip.input}`}
            className={cn(
              "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs",
              isAlias
                ? "border border-border bg-background text-muted-foreground"
                : "bg-primary/10 text-foreground",
            )}
            title={`${chip.ns}: ${chip.name} (query: ${chip.input})`}
          >
            <span className="truncate">{label}</span>
            {isAlias && (
              <Badge
                variant="outline"
                className="shrink-0 px-1 py-0 text-xs font-normal"
              >
                alias
              </Badge>
            )}
          </span>
        )
      })}
    </div>
  )
}
