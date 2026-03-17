"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { HelpCircle } from "lucide-react"

import { D3CirclePack } from "@/components/taxonomy/d3-circle-pack"
import type { TreeRankOption } from "@/components/taxonomy/taxonomy-tree-controls"
import { D3StackedRadialBar } from "@/components/taxonomy/d3-stacked-radial-bar"
import { TaxonomyDetailsPanel } from "@/components/taxonomy/taxonomy-details-panel"
import { RadialTreeWithWarning } from "@/components/taxonomy/radial-tree-with-warning"
import { ExpandableSearch } from "@/components/taxonomy/expandable-search"
import { useTaxonomyUrlSync } from "./use-taxonomy-url-sync"
import { useFlattenedTreeStore, useRankDistribution, useRootOrganismsCount, getRankIndex } from "@/lib/stores/flattened-tree"

import { type BreadcrumbEntry } from "@/components/taxonomy/floating-breadcrumb"
import { FloatingVizStrip } from "@/components/taxonomy/floating-viz-strip"
import { BottomStackVizStrip } from "@/components/taxonomy/bottom-stack-viz-strip"
import { RankResetToast } from "@/components/taxonomy/rank-reset-toast"

import type { TaxonRecord } from "@/lib/api/types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import {
  type ViewTab,
  type TaxonomyPayload,
  type NodeClickEvent,
  GLASS_PANEL,
  GLASS_PANEL_PADDING,
} from "@/components/taxonomy/taxonomy-types"
import { TaxonomyHelpDialog } from "@/components/taxonomy/taxonomy-help-dialog"
import { cn } from "@/lib/utils"

const EUKARYOTA_TAXID = "2759"
const MAX_ROOT_HISTORY = 10

function flatNodeToTaxon(node: FlatTreeNode): TaxonRecord {
  return {
    taxid: node.id,
    scientific_name: node.scientific_name,
    rank: node.rank ?? undefined,
    organisms_count: node.organisms_count,
    assemblies_count: node.assemblies_count,
    annotations_count: node.annotations_count,
  }
}

/** Ancestor chain from node up to root (node first, then parent, …). */
function getAncestorChain(taxid: string, flatNodes: FlatTreeNode[]): FlatTreeNode[] {
  const byId = new Map(flatNodes.map((n) => [n.id, n]))
  const chain: FlatTreeNode[] = []
  let cur = byId.get(taxid)
  while (cur) {
    chain.push(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return chain
}

/** True if descendantTaxid is under rootTaxid in the tree. */
function isDescendantOf(
  descendantTaxid: string,
  rootTaxid: string,
  flatNodes: FlatTreeNode[]
): boolean {
  const byId = new Map(flatNodes.map((n) => [n.id, n]))
  let cur = byId.get(descendantTaxid)
  while (cur) {
    if (cur.id === rootTaxid) return true
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return false
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TaxonomyPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const flatNodes = useFlattenedTreeStore((s) => s.flatNodes)
  const { fetchFlattenedTree, searchNodes } = useFlattenedTreeStore()

  /** URL is the source of truth for current root taxid (middleware ensures ?taxon= is always set). */
  const currentRootTaxidFromUrl = searchParams?.get("taxon") ?? EUKARYOTA_TAXID

  // ── Core state ────────────────────────────────────────────────────────────
  /** Loaded payload for the current URL taxid; updated by URL sync (on load) and by handleSetRoot (on navigate). */
  const [rootTaxon, setRootTaxon] = useState<TaxonomyPayload | null>(null)
  const [rootHistory, setRootHistory] = useState<TaxonomyPayload[]>([])
  const [selectedNode, setSelectedNode] = useState<NodeClickEvent | null>(null)
  const [pinnedNode, setPinnedNode] = useState<TaxonomyPayload | null>(null)
  const [activeTab, setActiveTab] = useState<ViewTab>("overview")
  /** Rank slider: "show down to" this rank (null = all). */
  const [selectedMaxRank, setSelectedMaxRank] = useState<string | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<FlatTreeNode[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  // View options (Radial + Gene Stack): labels visibility
  const [showLabels, setShowLabels] = useState(false)

  // Radial warning
  const [radialWarningAcknowledged, setRadialWarningAcknowledged] =
    useState<Set<string>>(new Set())
  // Rank reset toast (shown when root moves below selected rank)
  const [rankResetToastOpen, setRankResetToastOpen] = useState(false)
  const [helpDialogOpen, setHelpDialogOpen] = useState(false)

  const vizRef = useRef<HTMLDivElement>(null)
  const radialScrollRef = useRef<HTMLDivElement>(null)
  const selectedNodeRef = useRef<NodeClickEvent | null>(null)
  const activeTabRef = useRef<ViewTab>(activeTab)
  selectedNodeRef.current = selectedNode
  activeTabRef.current = activeTab

  // ── URL as source of truth: sync hook loads root payload when URL taxid changes ─────────────────────────
  useTaxonomyUrlSync({
    rootPayload: rootTaxon,
    setRootPayload: setRootTaxon,
    setActiveView: setActiveTab,
  })

  useEffect(() => { fetchFlattenedTree() }, [fetchFlattenedTree])

  const selectedMaxRankRef = useRef(selectedMaxRank)
  selectedMaxRankRef.current = selectedMaxRank

  // When root changes: reset selected leaf rank if it's at or above the new root (e.g. root=class, selected=phylum)
  useEffect(() => {
    if (!rootTaxon?.taxon.rank) return
    const rootIdx = getRankIndex(rootTaxon.taxon.rank)
    if (rootIdx < 0) return
    const current = selectedMaxRankRef.current
    if (!current) return
    const currentIdx = getRankIndex(current)
    if (currentIdx < 0) return
    // Selected rank is valid only when it's below the root (e.g. root=class → order/family/genus ok; phylum not ok)
    if (currentIdx <= rootIdx) {
      setSelectedMaxRank(null)
      setRankResetToastOpen(true)
    }
  }, [rootTaxon])

  // ── Re-root helpers: update state and URL together (URL is source of truth; we write it only on navigate) ─────

  const handleSetRoot = useCallback(
    (payload: TaxonomyPayload | null) => {
      setRootTaxon((prev) => {
        if (prev) setRootHistory((h) => [prev, ...h].slice(0, MAX_ROOT_HISTORY))
        return payload
      })
      setSelectedNode(null)
      if (payload) {
        const view = activeTabRef.current
        router.replace(`/taxonomy?taxon=${payload.taxid}&view=${view}`, {
          scroll: false,
        })
      }
    },
    [router]
  )

  const handleBackToPreviousRoot = useCallback(() => {
    setRootHistory((h) => {
      const [prev, ...rest] = h
      if (prev != null) {
        router.replace(`/taxonomy?taxon=${prev.taxid}`, { scroll: false })
        setRootTaxon(prev)
        setSelectedNode(null)
      }
      return rest
    })
  }, [router])

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); setShowSearchResults(false); return }
    const r = searchNodes(q.trim(), 10)
    setSearchResults(r)
    setShowSearchResults(r.length > 0)
  }, [searchNodes])

  const handleSelectFromSearch = useCallback((node: FlatTreeNode) => {
    setSelectedNode({ taxid: node.id, node, screenX: 0, screenY: 0 })
    setSearchQuery("")
    setShowSearchResults(false)
  }, [])

  // ── Node interactions ─────────────────────────────────────────────────────

  const handleNodeClick = useCallback((event: NodeClickEvent) => {
    setSelectedNode((prev) => (prev?.taxid === event.taxid ? null : event))
  }, [])

  const handleDrillIn = useCallback(() => {
    const node = selectedNodeRef.current
    if (!node) return
    handleSetRoot({ taxid: node.taxid, taxon: flatNodeToTaxon(node.node) })
  }, [handleSetRoot])

  const handlePinNode = useCallback(() => {
    const node = selectedNodeRef.current
    if (!node) return
    setPinnedNode({ taxid: node.taxid, taxon: flatNodeToTaxon(node.node) })
  }, [])

  // ── Dismiss popover on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!selectedNode) return
    const handler = (e: MouseEvent) => {
      // Let canvas clicks handle themselves via onNodeClick
      const target = e.target as HTMLElement
      if (target.tagName === "CANVAS") return
      if ((target.closest(".taxonomy-popover"))) return
      setSelectedNode(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [selectedNode])

  const handleGeneStackNodeClick = useCallback((taxid: string) => {
    const node = flatNodes.find((n) => n.id === taxid)
    if (!node) return
    setSelectedNode({ taxid, node, screenX: 0, screenY: 0 })
  }, [flatNodes])

  // ── Derived state: effective root taxid from URL; display payload from state or flatNodes ─────────────────────

  const effectiveRootTaxid = currentRootTaxidFromUrl

  const currentDisplayTaxon = useMemo<TaxonomyPayload>(() => {
    if (rootTaxon?.taxid === effectiveRootTaxid) return rootTaxon
    const node = flatNodes.find((n) => n.id === effectiveRootTaxid)
    return {
      taxid: effectiveRootTaxid,
      taxon: node
        ? flatNodeToTaxon(node)
        : ({
            taxid: effectiveRootTaxid,
            scientific_name: effectiveRootTaxid === EUKARYOTA_TAXID ? "Eukaryota" : "…",
          } as TaxonRecord),
    }
  }, [rootTaxon, flatNodes, effectiveRootTaxid])

  // Breadcrumb path: ancestors only (exclude current root; current root shown in center pill)
  const breadcrumbPath = useMemo<BreadcrumbEntry[]>(() => {
    const chain = getAncestorChain(currentDisplayTaxon.taxid, flatNodes)
    return chain.reverse().slice(0, -1).map((n) => ({ taxid: n.id, name: n.scientific_name }))
  }, [currentDisplayTaxon.taxid, flatNodes])

  // Highlight the selected node only if it's inside the current subtree
  const highlightTaxid = useMemo(() => {
    if (!selectedNode) return null
    return isDescendantOf(selectedNode.taxid, effectiveRootTaxid, flatNodes) ? selectedNode.taxid : null
  }, [selectedNode, effectiveRootTaxid, flatNodes])

  // Depth of selected taxon from current root (for TaxonomyDetailsPanel breadcrumb)
  const depthFromRoot = useMemo(() => {
    if (!selectedNode) return 0
    const chain = getAncestorChain(selectedNode.taxid, flatNodes)
    const rootIndex = chain.findIndex((n) => n.id === effectiveRootTaxid)
    return rootIndex >= 0 ? rootIndex : 0
  }, [selectedNode, effectiveRootTaxid, flatNodes])

  const handleSelectAncestor = useCallback(
    (ancestor: TaxonRecord) => {
      const node = flatNodes.find((n) => n.id === ancestor.taxid)
      const flatNode: FlatTreeNode =
        node ??
        ({
          id: ancestor.taxid,
          parentId: null,
          scientific_name: ancestor.scientific_name ?? "",
          annotations_count: ancestor.annotations_count ?? 0,
          assemblies_count: ancestor.assemblies_count ?? 0,
          organisms_count: ancestor.organisms_count ?? 0,
          rank: ancestor.rank ?? null,
          coding_count: 0,
          non_coding_count: 0,
          pseudogene_count: 0,
        } as FlatTreeNode)
      setSelectedNode({ taxid: ancestor.taxid, node: flatNode, screenX: 0, screenY: 0 })
    },
    [flatNodes]
  )

  const handleOpenDetailsPanelForRoot = useCallback(() => {
    const node = flatNodes.find((n) => n.id === currentDisplayTaxon.taxid)
    const flatNode: FlatTreeNode =
      node ??
      ({
        id: currentDisplayTaxon.taxid,
        parentId: null,
        scientific_name: currentDisplayTaxon.taxon.scientific_name ?? "",
        annotations_count: currentDisplayTaxon.taxon.annotations_count ?? 0,
        assemblies_count: currentDisplayTaxon.taxon.assemblies_count ?? 0,
        organisms_count: currentDisplayTaxon.taxon.organisms_count ?? 0,
        rank: currentDisplayTaxon.taxon.rank ?? null,
        coding_count: 0,
        non_coding_count: 0,
        pseudogene_count: 0,
      } as FlatTreeNode)
    setSelectedNode({
      taxid: currentDisplayTaxon.taxid,
      node: flatNode,
      screenX: 0,
      screenY: 0,
    })
  }, [flatNodes, currentDisplayTaxon])

  const viewKey = effectiveRootTaxid
  const organismsCount = currentDisplayTaxon.taxon.organisms_count ?? 0

  const rankDistribution = useRankDistribution(effectiveRootTaxid)
  const rootOrganismsCount = useRootOrganismsCount(effectiveRootTaxid)

  // Leaf count at selected rank (used for radial warning threshold)
  const leafCountAtSelectedRank =
    selectedMaxRank === null
      ? (rootOrganismsCount ?? 0)
      : (rankDistribution.find((d) => d.rank === selectedMaxRank)?.count ?? 0)

  return (
    <div
      className="flex flex-col"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── Viz area (full width); drawer overlays on the right when open ── */}
      <div ref={vizRef} className="flex-1 relative flex flex-col min-h-0 bg-background overflow-hidden">
        {/* View area (fills viz, canvas/content underneath) */}
        <div
          className="relative flex-1 min-h-0 flex items-center justify-center"
          aria-label="Visualization area"
        >
          {activeTab === "overview" && (
            <div className="w-full h-full flex items-center justify-center min-h-0">
              <D3CirclePack
                rootTaxid={effectiveRootTaxid}
                highlightTaxid={highlightTaxid}
                selectedTaxid={selectedNode?.taxid ?? null}
                onNodeClick={handleNodeClick}
                controlledRank={selectedMaxRank}
              />
            </div>
          )}
          {activeTab === "constant-branch" && (
            <div
              ref={radialScrollRef}
              className="w-full h-full flex items-start justify-center min-h-0 overflow-auto"
            >
              <RadialTreeWithWarning
                rootTaxid={effectiveRootTaxid}
                highlightTaxid={highlightTaxid}
                organismsCount={organismsCount}
                leafCountAtSelectedRank={leafCountAtSelectedRank}
                viewKey={viewKey}
                acknowledgedKeys={radialWarningAcknowledged}
                onAcknowledge={(k) => setRadialWarningAcknowledged((p) => new Set(p).add(k))}
                onNodeClick={handleNodeClick}
                controlledRank={(selectedMaxRank as TreeRankOption) ?? undefined}
                controlledShowLabels={showLabels}
                scopeHint={rootTaxon ? currentDisplayTaxon.taxon.scientific_name : undefined}
              />
            </div>
          )}
          {activeTab === "gene-stack" && (
            <div className="w-full h-full flex items-center justify-center min-h-0 overflow-auto">
              <D3StackedRadialBar
                rootTaxid={effectiveRootTaxid}
                highlightTaxid={highlightTaxid}
                onTaxonSelect={handleGeneStackNodeClick}
                controlledRank={(selectedMaxRank as TreeRankOption) ?? undefined}
                controlledShowLabels={showLabels}
              />
            </div>
          )}

        </div>

        {/* Title + help on the far left; strip centered */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {/* Title and help (click to show description) — far left; same height (50px) and padding as strip */}
          <header
            className={cn(
              GLASS_PANEL,
              GLASS_PANEL_PADDING,
              "pointer-events-auto absolute left-4 top-4 flex flex-wrap items-center gap-2 shadow-md h-[50px]"
            )}
            aria-label="Taxonomy explorer"
          >
            <h1 className="text-sm font-medium text-foreground">
              Taxonomy Explorer
            </h1>
            <button
              type="button"
              aria-label="Help: how to use the Taxonomy Explorer"
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setHelpDialogOpen(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            </button>
            <TaxonomyHelpDialog open={helpDialogOpen} onOpenChange={setHelpDialogOpen} />
          </header>
          {/* Rank reset toast: far right of strip row (same vertical alignment) */}
          <RankResetToast
            open={rankResetToastOpen}
            onClose={() => setRankResetToastOpen(false)}
            className="absolute right-4 top-4"
          />
          {/* Bottom strip: stack chart options (Tree + Outliers views only) */}
          <BottomStackVizStrip
            visible={activeTab === "constant-branch" || activeTab === "gene-stack"}
            showLabels={showLabels}
            onShowLabelsChange={setShowLabels}
          />
          {/* Strip: draggable, centered by default */}
          <FloatingVizStrip
              currentDisplayTaxon={currentDisplayTaxon}
              breadcrumbPath={breadcrumbPath}
              flatNodes={flatNodes}
              onNavigate={(taxid) => {
                const node = flatNodes.find((n) => n.id === taxid)
                if (node) handleSetRoot({ taxid, taxon: flatNodeToTaxon(node) })
              }}
              onOpenDrawer={handleOpenDetailsPanelForRoot}
              distribution={rankDistribution}
              leafCount={rootOrganismsCount}
              selectedRank={selectedMaxRank}
              onRankSelect={setSelectedMaxRank}
              activeTab={activeTab}
              onTabChange={(t) => {
                setActiveTab(t)
                setSelectedNode(null)
              }}
              searchSlot={
                <ExpandableSearch
                  query={searchQuery}
                  results={searchResults}
                  showResults={showSearchResults}
                  onChange={handleSearch}
                  onSelect={handleSelectFromSearch}
                  onBlur={() => setShowSearchResults(false)}
                />
              }
            />
        </div>

        {/* Right drawer: absolute over the canvases (taxonomy-popover so outside-click does not clear selection on panel interaction). */}
        {selectedNode && (
          <div className="taxonomy-popover absolute right-0 top-0 bottom-0 z-30 w-80 xl:w-96 min-w-0 border-l border-border bg-background shadow-xl flex flex-col min-h-0 overflow-hidden">
            <TaxonomyDetailsPanel
              selectedTaxon={{
                taxid: selectedNode.taxid,
                taxon: flatNodeToTaxon(selectedNode.node),
              }}
              isPanelTaxonCurrentRoot={selectedNode.taxid === effectiveRootTaxid}
              currentRootTaxon={currentDisplayTaxon.taxon}
              depthFromRoot={depthFromRoot}
              pinnedTaxon={pinnedNode ? { taxid: pinnedNode.taxid, taxon: pinnedNode.taxon } : null}
              onPin={(payload) => setPinnedNode(payload)}
              onUnpin={() => setPinnedNode(null)}
              onClose={() => setSelectedNode(null)}
              onExploreFrom={handleDrillIn}
              onSelectAncestor={handleSelectAncestor}
            />
          </div>
        )}
    </div>
  </div>
  )
}
