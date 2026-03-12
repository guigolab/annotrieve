"use client"

import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { D3RadialTree } from "./d3-radial-tree"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { NodeClickEvent } from "./taxonomy-types"
import { LARGE_TAXON_THRESHOLD } from "./taxonomy-types"
import type { TreeRankOption } from "./taxonomy-tree-controls"

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
}: RadialTreeWithWarningProps) {
  const isRootTree = rootTaxid === null
  const showWarning =
    leafCountAtSelectedRank > LARGE_TAXON_THRESHOLD &&
    !acknowledgedKeys.has(viewKey)

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
              <Button
                variant="outline"
                size="sm"
                className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                onClick={() => onAcknowledge(viewKey)}
              >
                Show tree anyway
              </Button>
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
    />
  )
}
