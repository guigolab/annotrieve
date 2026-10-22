"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const AUTO_VALUE = "__auto__"

export interface GenesRankOption {
  rank: string
  taxonCount: number
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

function rankLabel(rank: string): string {
  return rank.charAt(0).toUpperCase() + rank.slice(1)
}

interface GenesRankSelectProps {
  viewRank: string | null
  options: GenesRankOption[]
  /** When true, hide the Auto option (e.g. no include-taxids; kingdom is default). */
  hideAuto?: boolean
  disabled?: boolean
  disabledReason?: string | null
  onViewRankChange: (rank: string | null) => void
  className?: string
}

export function GenesRankSelect({
  viewRank,
  options,
  hideAuto,
  disabled,
  disabledReason,
  onViewRankChange,
  className,
}: GenesRankSelectProps) {
  const value = viewRank ?? (hideAuto ? options[0]?.rank ?? AUTO_VALUE : AUTO_VALUE)

  return (
    <div className={cn("min-w-0", className)}>
      <Select
        value={value}
        disabled={disabled || (!hideAuto && options.length === 0)}
        onValueChange={(next) =>
          onViewRankChange(next === AUTO_VALUE ? null : next)
        }
      >
        <SelectTrigger
          className="h-7 w-full min-w-0 px-2 text-[11px] shadow-none"
          aria-label="Root rank"
          title={disabled ? (disabledReason ?? undefined) : undefined}
        >
          <SelectValue placeholder={hideAuto ? "Kingdom" : "Auto"} />
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[10rem]">
          {!hideAuto ? (
            <SelectItem value={AUTO_VALUE} className="text-xs">
              Auto
            </SelectItem>
          ) : null}
          {options.map(({ rank, taxonCount }) => (
            <SelectItem key={rank} value={rank} className="text-xs">
              <span className="flex w-full items-center justify-between gap-3">
                <span>{rankLabel(rank)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCount(taxonCount)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {disabled && disabledReason ? (
        <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
          {disabledReason}
        </p>
      ) : null}
    </div>
  )
}
