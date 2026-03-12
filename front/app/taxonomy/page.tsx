"use client"

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react"
import { useSearchParams } from "next/navigation"
import { Search, X, HelpCircle } from "lucide-react"

import { D3CirclePack } from "@/components/taxonomy/d3-circle-pack"
import { TaxonomyTreeCanvas } from "@/components/taxonomy/taxonomy-tree-canvas"
import type { TreeRankOption } from "@/components/taxonomy/taxonomy-tree-controls"
import { D3StackedRadialBar } from "@/components/taxonomy/d3-stacked-radial-bar"
import { TaxonomyDetailsPanel } from "@/components/taxonomy/taxonomy-details-panel"
import { RadialTreeWithWarning } from "@/components/taxonomy/radial-tree-with-warning"
import { useTaxonomyUrlSync } from "./use-taxonomy-url-sync"
import { useFlattenedTreeStore, useRankDistribution, useRootOrganismsCount } from "@/lib/stores/flattened-tree"

import { type BreadcrumbEntry } from "@/components/taxonomy/floating-breadcrumb"
import { FloatingVizStrip } from "@/components/taxonomy/floating-viz-strip"

import type { TaxonRecord } from "@/lib/api/types"
import type { FlatTreeNode } from "@/lib/api/taxons"
import {
  type ViewTab,
  type TaxonomyPayload,
  type NodeClickEvent,
  GLASS_PANEL,
  GLASS_PANEL_PADDING,
} from "@/components/taxonomy/taxonomy-types"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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

// ─── Expandable search ───────────────────────────────────────────────────────

interface ExpandableSearchProps {
  query: string
  results: FlatTreeNode[]
  showResults: boolean
  onChange: (q: string) => void
  onSelect: (node: FlatTreeNode) => void
  onBlur: () => void
}

function ExpandableSearch({
  query,
  results,
  showResults,
  onChange,
  onSelect,
  onBlur,
}: ExpandableSearchProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focused && !query) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
        onBlur()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [focused, query, onBlur])

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        aria-label="Search"
        onClick={() => { setFocused(true); setTimeout(() => inputRef.current?.focus(), 10) }}
        className={cn(
          "flex items-center gap-2 h-8 rounded-lg px-2.5 border transition-all duration-200 text-sm",
          focused || query
            ? "w-52 bg-background border-border text-foreground"
            : "w-8 bg-transparent border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search taxon…"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          className={cn(
            "bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground w-full transition-opacity",
            focused || query ? "opacity-100" : "opacity-0 w-0"
          )}
          aria-label="Search taxon by name or ID"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={(e) => { e.stopPropagation(); onChange(""); setFocused(false) }}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {showResults && results.length > 0 && (
        <div className="absolute right-0 top-full mt-1.5 w-64 z-50 rounded-lg shadow-lg overflow-hidden border border-border bg-popover">
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => { onSelect(node); setFocused(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
            >
              <div className="text-sm text-foreground truncate">
                {node.scientific_name}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ID {node.id} · {node.annotations_count.toLocaleString()} annotations
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function TaxonomyPage() {
  const searchParams = useSearchParams()
  const flatNodes = useFlattenedTreeStore((s) => s.flatNodes)
  const { fetchFlattenedTree, searchNodes } = useFlattenedTreeStore()

  /** Pending root from URL before useTaxonomyUrlSync has set rootTaxon (avoids flash to Eukaryota). */
  const urlTaxid = searchParams?.get("taxon") ?? null

  // ── Core state ────────────────────────────────────────────────────────────
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

  const vizRef = useRef<HTMLDivElement>(null)
  const radialScrollRef = useRef<HTMLDivElement>(null)

  // ── URL sync (keeps rootTaxon ↔ ?taxon= in sync) ─────────────────────────
  useTaxonomyUrlSync({
    rootTaxon,
    setRootTaxon,
    setSelectedTaxon: () => { },   // selection is now handled via node popover
    setActiveView: setActiveTab,
  })

  useEffect(() => { fetchFlattenedTree() }, [fetchFlattenedTree])

  // When root changes to a taxon whose rank equals the selected leaf rank, reset rank and notify
  useEffect(() => {
    if (!rootTaxon?.taxon.rank) return
    const rootRankLower = rootTaxon.taxon.rank!.toLowerCase()
    setSelectedMaxRank((current) => {
      if (!current) return null
      if (rootRankLower === current.toLowerCase()) {
        toast.info(
          "The rank of the root overlaps with the one currently selected. Rank selector has been reset."
        )
        return null
      }
      return current
    })
  }, [rootTaxon])

  // ── Re-root helpers ───────────────────────────────────────────────────────

  const handleSetRoot = useCallback(
    (payload: TaxonomyPayload | null) => {
      setRootTaxon((prev) => {
        if (prev) setRootHistory((h) => [prev, ...h].slice(0, MAX_ROOT_HISTORY))
        return payload
      })
      setSelectedNode(null)
    },
    []
  )

  const handleBackToPreviousRoot = useCallback(() => {
    setRootHistory((h) => {
      const [prev, ...rest] = h
      setRootTaxon(prev ?? null)
      setSelectedNode(null)
      return rest
    })
  }, [])

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
    // If clicking the same node again, dismiss
    if (selectedNode?.taxid === event.taxid) {
      setSelectedNode(null)
      return
    }
    setSelectedNode(event)
  }, [selectedNode?.taxid])

  const handleDrillIn = useCallback(() => {
    if (!selectedNode) return
    handleSetRoot({ taxid: selectedNode.taxid, taxon: flatNodeToTaxon(selectedNode.node) })
  }, [selectedNode, handleSetRoot])

  const handlePinNode = useCallback(() => {
    if (!selectedNode) return
    setPinnedNode({ taxid: selectedNode.taxid, taxon: flatNodeToTaxon(selectedNode.node) })
  }, [selectedNode])

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

  // ── Derived state ─────────────────────────────────────────────────────────
  // When rootTaxon is still null (before URL sync), use URL's taxon so we don't flash Eukaryota.

  const currentDisplayTaxon = useMemo<TaxonomyPayload>(() => {
    if (rootTaxon) return rootTaxon
    const pendingTaxid = urlTaxid ?? EUKARYOTA_TAXID
    const node = flatNodes.find((n) => n.id === pendingTaxid)
    return {
      taxid: pendingTaxid,
      taxon: node
        ? flatNodeToTaxon(node)
        : ({
            taxid: pendingTaxid,
            scientific_name: pendingTaxid === EUKARYOTA_TAXID ? "Eukaryota" : "…",
          } as TaxonRecord),
    }
  }, [rootTaxon, flatNodes, urlTaxid])

  const currentRootTaxid = rootTaxon?.taxid ?? urlTaxid
  const effectiveRootTaxid = currentRootTaxid ?? EUKARYOTA_TAXID

  // Breadcrumb path: ancestors only (exclude current root; current root shown in center pill)
  const breadcrumbPath = useMemo<BreadcrumbEntry[]>(() => {
    const focalId = currentDisplayTaxon.taxid
    const byId = new Map(flatNodes.map((n) => [n.id, n]))
    const chain: FlatTreeNode[] = []
    let cur = byId.get(focalId)
    while (cur) {
      chain.push(cur)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    chain.reverse()
    return chain.slice(0, -1).map((n) => ({ taxid: n.id, name: n.scientific_name }))
  }, [currentDisplayTaxon, flatNodes])

  // Highlight the selected node if it's inside the current subtree
  const highlightTaxid = useMemo(() => {
    if (!selectedNode) return null
    const byId = new Map(flatNodes.map((n) => [n.id, n]))
    let cur = byId.get(selectedNode.taxid)
    while (cur) {
      if (cur.id === effectiveRootTaxid) return selectedNode.taxid
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return null
  }, [selectedNode, effectiveRootTaxid, flatNodes])

  // Depth of selected taxon from current root (for TaxonomyDetailsPanel breadcrumb)
  const depthFromRoot = useMemo(() => {
    if (!selectedNode) return 0
    const byId = new Map(flatNodes.map((n) => [n.id, n]))
    let cur = byId.get(selectedNode.taxid)
    let depth = 0
    while (cur && cur.id !== effectiveRootTaxid) {
      depth++
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return cur ? depth : 0
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

  const viewKey = currentRootTaxid ?? EUKARYOTA_TAXID
  const organismsCount = currentDisplayTaxon.taxon.organisms_count ?? 0

  const rankDistribution = useRankDistribution(currentRootTaxid)
  const rootOrganismsCount = useRootOrganismsCount(currentRootTaxid)

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
                rootTaxid={currentRootTaxid}
                highlightTaxid={highlightTaxid}
                selectedTaxid={selectedNode?.taxid ?? null}
                onNodeClick={handleNodeClick}
                controlledRank={selectedMaxRank}
              />
            </div>
          )}
          {activeTab === "tree" && (
            <div className="w-full h-full min-h-0 overflow-auto">
              <TaxonomyTreeCanvas
                rootTaxid={currentRootTaxid}
                highlightTaxid={highlightTaxid}
                selectedTaxid={selectedNode?.taxid ?? null}
                onNodeClick={handleNodeClick}
                controlledRank={(selectedMaxRank as TreeRankOption) ?? undefined}
                scopeHint={rootTaxon ? currentDisplayTaxon.taxon.scientific_name : undefined}
              />
            </div>
          )}
          {activeTab === "constant-branch" && (
            <div
              ref={radialScrollRef}
              className="w-full h-full flex items-start justify-center min-h-0 overflow-auto"
            >
              <RadialTreeWithWarning
                rootTaxid={currentRootTaxid}
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
                rootTaxid={currentRootTaxid}
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
          <div
            className={cn(
              GLASS_PANEL,
              GLASS_PANEL_PADDING,
              "pointer-events-auto absolute left-4 top-4 flex flex-wrap items-center gap-2 shadow-md h-[50px]"
            )}
            role="group"
            aria-label="Taxonomy explorer"
          >
            <h1 className="text-sm font-medium text-foreground">
              Taxonomy Explorer
            </h1>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Help: show description"
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={6}
                className="max-w-[260px] p-3 rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-lg text-xs text-left"
              >
                Switch views, change root, filter by rank, and search.
                Click a node in the tree to open its details.
              </PopoverContent>
            </Popover>
          </div>
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
              showLabels={showLabels}
              onShowLabelsChange={setShowLabels}
            />
        </div>

        {/* Right drawer: absolute over the canvases (taxonomy-popover so outside-click does not clear selection on panel interaction) */}
        {selectedNode && (
          <div className="taxonomy-popover absolute right-0 top-0 bottom-0 z-30 w-80 xl:w-96 border-l border-border bg-background shadow-xl flex flex-col min-h-0">
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
