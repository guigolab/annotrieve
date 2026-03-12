"use client"

import { useMemo, useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { RANK_ORDER, getRankIndex } from "@/lib/stores/flattened-tree"
import type { RankDistributionEntry } from "@/lib/stores/flattened-tree"
import { LARGE_TAXON_THRESHOLD } from "./taxonomy-types"

export const RANK_SLIDER_ALL = "__all__" as const

const RANK_DISPLAY_ORDER = RANK_ORDER.filter((r) => r !== "species")
const DOT_SIZE = 7
const SPINE_LEFT = DOT_SIZE / 2

/** Ranks that are strictly below (more specific than) the given root rank. */
function ranksAfterRoot(rootRank: string | null | undefined): readonly string[] {
  const idx = getRankIndex(rootRank)
  if (idx < 0) return RANK_DISPLAY_ORDER
  return RANK_DISPLAY_ORDER.filter((r) => getRankIndex(r) > idx)
}

/** When root rank is unknown, only show ranks that appear in the distribution (avoids top ranks with 0). */
function ranksFromDistribution(distribution: RankDistributionEntry[]): string[] {
  const ranks = distribution.map((d) => d.rank.toLowerCase().trim()).filter(Boolean)
  const seen = new Set(ranks)
  return RANK_DISPLAY_ORDER.filter((r) => seen.has(r))
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

function buildRows(
  distribution: RankDistributionEntry[],
  leafCount: number | undefined,
  ranksToShow: readonly string[]
): { rank: string; count: number; label: string }[] {
  const byRank = new Map(distribution.map((d) => [d.rank, d.count]))
  const total = leafCount ?? distribution.reduce((s, d) => s + d.count, 0)
  const allRow = { rank: RANK_SLIDER_ALL, count: total, label: "All leaves" }
  const rankRows = ranksToShow.map((rank) => ({
    rank,
    count: byRank.get(rank) ?? 0,
    label: rank.charAt(0).toUpperCase() + rank.slice(1),
  }))
  return [...rankRows, allRow]
}

interface RankSliderProps {
  distribution: RankDistributionEntry[]
  leafCount?: number
  selectedRank: string | null
  onRankSelect: (rank: string | null) => void
  /** Rank of the current root taxon; only ranks *below* this are shown (e.g. if root is class, show order/family/genus). */
  rootRank?: string | null
  /** Threshold above which ranks are flagged with a warning. Default from taxonomy-types. */
  largeTaxonThreshold?: number
  className?: string
}

export function RankSlider({
  distribution,
  leafCount,
  selectedRank,
  onRankSelect,
  rootRank,
  largeTaxonThreshold = LARGE_TAXON_THRESHOLD,
  className,
}: RankSliderProps) {
  const allowedRanks = useMemo(() => {
    const afterRoot = ranksAfterRoot(rootRank)
    // When root rank is unknown (e.g. root set from details panel with missing rank), avoid showing
    // all ranks with 0 for top levels: only show ranks that appear in the distribution.
    if (getRankIndex(rootRank) < 0 && distribution.length > 0) {
      const fromDist = ranksFromDistribution(distribution)
      return fromDist.length > 0 ? fromDist : afterRoot
    }
    return afterRoot
  }, [rootRank, distribution])
  const rows = useMemo(
    () => buildRows(distribution, leafCount, allowedRanks),
    [distribution, leafCount, allowedRanks]
  )
  const selectedIndex = useMemo(() => {
    const idx = rows.findIndex(
      (r) => (r.rank === RANK_SLIDER_ALL && selectedRank === null) || r.rank === selectedRank
    )
    // When selected rank is not in the list (e.g. root moved below it: root=class, selected=phylum), show "All leaves"
    if (idx >= 0) return idx
    return rows.length - 1
  }, [rows, selectedRank])

  const [justSelectedIndex, setJustSelectedIndex] = useState<number | null>(null)
  const [countAnimationKey, setCountAnimationKey] = useState(0)
  const prevSelectedRef = useRef(selectedIndex)
  const prevDataRef = useRef({ leafCount, distLen: distribution.length, distTotal: distribution.reduce((s, d) => s + d.count, 0) })

  useEffect(() => {
    const total = distribution.reduce((s, d) => s + d.count, 0)
    const prev = prevDataRef.current
    if (prev.leafCount !== leafCount || prev.distLen !== distribution.length || prev.distTotal !== total) {
      prevDataRef.current = { leafCount, distLen: distribution.length, distTotal: total }
      setCountAnimationKey((k) => k + 1)
    }
  }, [distribution, leafCount])

  useEffect(() => {
    if (selectedIndex !== prevSelectedRef.current) {
      setJustSelectedIndex(selectedIndex)
      prevSelectedRef.current = selectedIndex
      const t = setTimeout(() => setJustSelectedIndex(null), 320)
      return () => clearTimeout(t)
    }
  }, [selectedIndex])

  if (rows.length === 0) {
    return (
      <div className={cn("py-2 text-[10px] text-muted-foreground", className)}>
        No ranks
      </div>
    )
  }

  return (
    <div
      className={cn("relative", className)}
      role="listbox"
      aria-label="Leaf rank"
      aria-activedescendant={rows[selectedIndex] ? `rank-${rows[selectedIndex].rank}` : undefined}
    >
      {/* Spine: 1px vertical line behind dots (structural only) */}
      <div
        className="absolute bottom-0 top-0 w-px bg-foreground pointer-events-none"
        style={{ left: SPINE_LEFT, opacity: 0.08 }}
        aria-hidden
      />

      <div className="relative flex flex-col">
        {rows.map(({ rank, count, label }, index) => {
          const isAll = rank === RANK_SLIDER_ALL
          const isSelected = index === selectedIndex
          const isAbove = index < selectedIndex
          const isBelow = index > selectedIndex
          const valueToSet = isAll ? null : rank
          const state = isSelected ? "selected" : isAbove ? "traversed" : "inactive"
          const isOverThreshold = count > largeTaxonThreshold

          return (
            <button
              key={rank}
              id={`rank-${rank}`}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onRankSelect(isSelected && !isAll ? null : valueToSet)}
              title={
                isAll
                  ? `Show all leaves: ${count.toLocaleString()} organisms${isOverThreshold ? " — may impact performance" : ""}`
                  : `${label} as leaves: ${count.toLocaleString()} taxa${isOverThreshold ? " — may impact performance" : ""}`
              }
              className={cn(
                "relative flex items-center gap-2 w-full text-left py-1.5 pr-2 rounded-md transition-colors duration-[160ms] ease-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                isSelected && "bg-secondary/12",
                justSelectedIndex === index && "animate-rank-row-bounce origin-left"
              )}
              style={{ paddingLeft: DOT_SIZE + 6 }}
            >
              {/* Dot */}
              <span
                className={cn(
                  "absolute rounded-full shrink-0 transition-colors duration-[180ms] ease-out",
                  state === "inactive" &&
                    "border border-foreground/20 bg-transparent",
                  state === "traversed" &&
                    "border-0 bg-secondary/40",
                  state === "selected" &&
                    "border-0 bg-secondary ring-2 ring-secondary/50"
                )}
                style={{
                  left: 0,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
              />

              {/* Label */}
              <span
                className={cn(
                  "flex-1 truncate text-xs font-medium transition-colors duration-[180ms] ease-out",
                  state === "inactive" && "text-foreground/30",
                  state === "traversed" && "text-foreground/55",
                  state === "selected" && "text-secondary"
                )}
              >
                {label}
              </span>

              {/* Count */}
              <span
                key={countAnimationKey}
                className={cn(
                  "tabular-nums text-[11px] transition-colors duration-[180ms] ease-out animate-rank-count-in",
                  state === "inactive" && "text-foreground/20",
                  state === "traversed" && "text-foreground/35",
                  state === "selected" && "text-secondary/80",
                  isOverThreshold && state === "inactive" && "text-amber-500/50",
                  isOverThreshold && state === "traversed" && "text-amber-500/70",
                  isOverThreshold && state === "selected" && "text-amber-500"
                )}
                style={{
                  animationDelay: `${index * 25}ms`,
                }}
              >
                {formatCount(count)}
              </span>
              {isOverThreshold && (
                <AlertTriangle
                  className="h-3 w-3 shrink-0 text-amber-500"
                  aria-label="May impact performance"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
