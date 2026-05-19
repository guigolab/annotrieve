"use client"

import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { D3RadialTree } from "./d3-radial-tree"
import type { LegendItem } from "./d3-radial-tree"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { NodeClickEvent } from "./taxonomy-types"
import { LARGE_TAXON_THRESHOLD } from "./taxonomy-types"
import type { TreeRankOption } from "./taxonomy-tree-controls"
import type { RankDistributionEntry } from "@/lib/stores/flattened-tree"
import { getRankIndex } from "@/lib/stores/flattened-tree"

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface RadialTreeWithWarningProps {
  rootTaxid: string | null
  highlightTaxid?: string | null
  /** Total organism/leaf count under root (used in warning text). */
  organismsCount: number
  /** Leaf count at the currently selected rank; warning shows when this exceeds threshold. */
  leafCountAtSelectedRank: number
  viewKey: string
  acknowledgedKeys: Set<string>
  onAcknowledge: (key: string) => void
  onNodeClick?: (event: NodeClickEvent) => void
  /** @deprecated use onNodeClick */
  onTaxonSelect?: (taxid: string, node: FlatTreeNode) => void
  scopeHint?: string
  /** When set, filters tree by rank (same as rank slider / tree controls). */
  controlledRank?: TreeRankOption | null
  /** When true, show taxon labels on the radial tree. */
  controlledShowLabels?: boolean
  /** Rank distribution for quick-fix button */
  distribution?: RankDistributionEntry[]
  /** Called when user selects a suggested rank */
  onSelectRank?: (rank: string | null) => void
  /** Current root taxon rank (used to filter suggestions) */
  currentRootRank?: string | null
  /** Forwarded to D3RadialTree for legend updates */
  onLegendChange?: (items: LegendItem[]) => void
}

export function RadialTreeWithWarning({
  rootTaxid,
  highlightTaxid = null,
  organismsCount,
  leafCountAtSelectedRank,
  viewKey,
  acknowledgedKeys,
  onAcknowledge,
  onNodeClick,
  onTaxonSelect,
  scopeHint,
  controlledRank,
  controlledShowLabels,
  distribution,
  onSelectRank,
  currentRootRank,
  onLegendChange,
}: RadialTreeWithWarningProps) {
  const isRootTree = rootTaxid === null
  const showWarning =
    leafCountAtSelectedRank > LARGE_TAXON_THRESHOLD &&
    !acknowledgedKeys.has(viewKey)

  // Find the best rank suggestion: deepest rank strictly below root with count ≤ threshold
  const suggestedRank = useMemo(() => {
    if (!distribution || !onSelectRank) return null
    const rootIdx = currentRootRank ? getRankIndex(currentRootRank) : -1
    // Ranks strictly below current root (higher index = deeper = more specific)
    const candidates = distribution.filter((d) => {
      const idx = getRankIndex(d.rank)
      return idx > rootIdx && d.count > 0
    })
    // Prefer the one with the largest count ≤ threshold (most detail while safe)
    const safe = candidates.filter((d) => d.count <= LARGE_TAXON_THRESHOLD)
    if (safe.length > 0) {
      return safe.reduce((best, d) => (d.count > best.count ? d : best))
    }
    // Fallback: smallest non-zero count rank
    if (candidates.length > 0) {
      return candidates.reduce((best, d) => (d.count < best.count ? d : best))
    }
    return null
  }, [distribution, onSelectRank, currentRootRank])

  if (showWarning) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="max-w-md w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Large taxonomy — performance warning</h3>
              {scopeHint && (
                <p className="text-xs text-muted-foreground">
                  Viewing subtree under{" "}
                  <span className="font-medium text-foreground">{scopeHint}</span>.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                The selected leaf rank would show{" "}
                <span className="font-semibold text-foreground">{leafCountAtSelectedRank.toLocaleString()} leaves</span>.
                Rendering the radial tree may freeze or crash the browser.
              </p>
              <p className="text-sm text-muted-foreground">
                Try selecting a <span className="font-medium text-amber-600 dark:text-amber-400">higher rank</span> in the Leaf rank menu
                (e.g. Class, Order, or Family) to reduce the number of leaves, or choose another rank from the rank
                selector.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  onClick={() => onAcknowledge(viewKey)}
                >
                  Show tree anyway
                </Button>
                {suggestedRank && onSelectRank && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onSelectRank(suggestedRank.rank)}
                  >
                    Switch to {capitalize(suggestedRank.rank)} ({formatCount(suggestedRank.count)})
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <D3RadialTree
      rootTaxid={rootTaxid}
      highlightTaxid={highlightTaxid}
      onNodeClick={onNodeClick}
      onTaxonSelect={onTaxonSelect}
      controlledRank={controlledRank}
      controlledShowLabels={controlledShowLabels}
      onLegendChange={onLegendChange}
    />
  )
}
