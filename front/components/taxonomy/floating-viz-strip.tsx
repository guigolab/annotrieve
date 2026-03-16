"use client"

import { useState, useRef, useCallback } from "react"
import { ChevronDown, Network, BookOpen, SlidersHorizontal, GripVertical, LayoutDashboard, BarChart2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUIStore } from "@/lib/stores/ui"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { getTreeGeneColors, getTreeTranscriptColors, getTreeBuscoColors } from "./taxonomy-tree-controls"
import type { FeatureCountCategory } from "./taxonomy-node-tooltip"
import { GLASS_PANEL, GLASS_PANEL_PADDING, TAXONOMY_LINK_MUTED } from "./taxonomy-types"
import type { TaxonomyPayload } from "./taxonomy-types"
import type { ViewTab } from "./taxonomy-types"
import type { BreadcrumbEntry } from "./floating-breadcrumb"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { RankDistributionEntry } from "@/lib/stores/flattened-tree"
import { RankSlider } from "./rank-slider"
import { StackChartOptionsContent } from "./stack-chart-options-content"
import { cn } from "@/lib/utils"

const TABS: { id: ViewTab; label: string; Icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "constant-branch", label: "Tree", Icon: Network },
  { id: "gene-stack", label: "Top 50", Icon: BarChart2 },
]

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(n)
}

function getLeafRankDisplay(
  selectedRank: string | null,
  distribution: RankDistributionEntry[],
  leafCount: number | undefined
): { label: string; count: number } {
  const total = leafCount ?? distribution.reduce((s, d) => s + d.count, 0)
  if (selectedRank === null) {
    return { label: "All leaves", count: total }
  }
  const count = distribution.find((d) => d.rank === selectedRank)?.count ?? 0
  const label = selectedRank.charAt(0).toUpperCase() + selectedRank.slice(1)
  return { label, count }
}

export interface FloatingVizStripProps {
  /** Current root (display taxon) */
  currentDisplayTaxon: TaxonomyPayload
  breadcrumbPath: BreadcrumbEntry[]
  flatNodes: FlatTreeNode[]
  onNavigate: (taxid: string) => void
  onOpenDrawer: () => void
  distribution: RankDistributionEntry[]
  leafCount?: number
  selectedRank: string | null
  onRankSelect: (rank: string | null) => void
  activeTab: ViewTab
  onTabChange: (tab: ViewTab) => void
  /** Slot for search (ExpandableSearch) so it stays in page and can use page state */
  searchSlot: React.ReactNode
}

export function FloatingVizStrip({
  currentDisplayTaxon,
  breadcrumbPath,
  flatNodes,
  onNavigate,
  onOpenDrawer,
  distribution,
  leafCount,
  selectedRank,
  onRankSelect,
  activeTab,
  onTabChange,
  searchSlot,
}: FloatingVizStripProps) {
  const [rootOpen, setRootOpen] = useState(false)
  const [leafRankOpen, setLeafRankOpen] = useState(false)
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null)


  const handleDragEnd = useCallback(() => {
    dragStartRef.current = null
    window.removeEventListener("mousemove", handleDragMove)
    window.removeEventListener("mouseup", handleDragEnd)
  }, [])

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      const start = dragStartRef.current
      if (!start || !stripRef.current) return
      const el = stripRef.current
      const rect = el.getBoundingClientRect()
      const parent = el.offsetParent as Element | null
      if (!parent) return
      const parentRect = parent.getBoundingClientRect()
      const halfW = rect.width / 2
      const minX = halfW
      const maxX = parentRect.width - halfW
      const minY = 0
      const maxY = parentRect.height - rect.height
      const deltaX = e.clientX - start.clientX
      const deltaY = e.clientY - start.clientY
      const newX = Math.min(maxX, Math.max(minX, start.x + deltaX))
      const newY = Math.min(maxY, Math.max(minY, start.y + deltaY))
      setPosition({ x: newX, y: newY })
    },
    []
  )

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      const el = stripRef.current
      if (!el) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const parent = el.offsetParent as Element | null
      if (!parent) return
      const parentRect = parent.getBoundingClientRect()
      // Convert viewport coords to parent-relative (left/top are relative to offset parent)
      const x = rect.left + rect.width / 2 - parentRect.left
      const y = rect.top - parentRect.top
      dragStartRef.current = { clientX: e.clientX, clientY: e.clientY, x, y }
      setPosition((prev) => prev ?? { x, y })
      window.addEventListener("mousemove", handleDragMove)
      window.addEventListener("mouseup", handleDragEnd)
    },
    [handleDragMove, handleDragEnd]
  )

  const theme = useUIStore((s) => s.theme)
  const isDark = theme === "dark"
  const geneColors = getTreeGeneColors(isDark)
  const transcriptColors = getTreeTranscriptColors(isDark)
  const buscoColors = getTreeBuscoColors(isDark)

  const rootTitle = currentDisplayTaxon.taxon.scientific_name ?? "Eukaryota"
  const currentNode = flatNodes.find((n) => n.id === currentDisplayTaxon.taxid)
  const rootRank = currentDisplayTaxon.taxon.rank ?? currentNode?.rank ?? null
  const organismsCount = currentDisplayTaxon.taxon.organisms_count ?? 0
  const assembliesCount = currentDisplayTaxon.taxon.assemblies_count ?? 0
  const annotationsCount = currentDisplayTaxon.taxon.annotations_count ?? 0
  const coding = currentNode?.coding_count ?? 0
  const nonCoding = currentNode?.non_coding_count ?? 0
  const pseudo = currentNode?.pseudogene_count ?? 0
  const geneTotal = coding + nonCoding + pseudo
  const transcriptTotal = (currentNode?.mrna_count ?? 0) + (currentNode?.lncrna_count ?? 0) + (currentNode?.trna_count ?? 0) + (currentNode?.mirna_count ?? 0)
  const buscoTotal = (currentNode?.busco_single_copy_mean ?? 0) + (currentNode?.busco_duplicated_mean ?? 0) + (currentNode?.busco_fragmented_mean ?? 0) + (currentNode?.busco_missing_mean ?? 0)
  const hasRecordCounts = organismsCount > 0 || assembliesCount > 0 || annotationsCount > 0
  const hasGeneCounts = geneTotal > 0
  const hasTranscriptCounts = transcriptTotal > 0
  const hasBuscoCounts = buscoTotal > 0
  const featureCategories: FeatureCountCategory[] = [
    ...(hasGeneCounts ? (["genes"] as const) : []),
    ...(hasTranscriptCounts ? (["transcripts"] as const) : []),
    ...(hasBuscoCounts ? (["busco"] as const) : []),
  ]
  const stackMode = useTaxonomyGeneTypesStore((s) => s.stackMode)
  const setStackMode = useTaxonomyGeneTypesStore((s) => s.setStackMode)
  /** Default to bottom-strip selected category; fallback to first available. */
  const rootFeatureCategory: FeatureCountCategory =
    featureCategories.includes(stackMode) ? stackMode : (featureCategories[0] ?? "genes")

  const leafDisplay = getLeafRankDisplay(selectedRank, distribution, leafCount)

  return (
    <div
      ref={stripRef}
      className={cn(
        "pointer-events-auto absolute top-4 w-fit",
        position === null ? "left-1/2 -translate-x-1/2" : ""
      )}
      style={
        position
          ? { left: position.x, top: position.y, transform: "translate(-50%, 0)" }
          : undefined
      }
    >
      <div
        className={cn(
          GLASS_PANEL,
          GLASS_PANEL_PADDING,
          "flex flex-wrap items-center gap-2 shadow-md"
        )}
        role="toolbar"
        aria-label="Visualization controls"
      >
      {/* Drag handle */}
      <button
        type="button"
        onMouseDown={handleDragStart}
        className={cn(
          "flex items-center justify-center rounded-md p-[5px] text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing touch-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label="Drag to move strip"
      >
        <GripVertical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
      {/* Root dropdown */}
      <Popover open={rootOpen} onOpenChange={setRootOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-sm font-medium text-primary",
              "hover:bg-muted transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label="Current root"
            aria-expanded={rootOpen}
          >
            <span className="truncate max-w-[140px]">{rootTitle}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", rootOpen && "rotate-180")}
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className={cn("w-72 p-2 rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-lg max-h-[85vh] overflow-y-auto")}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Ancestors (lineage): re-root on click */}
          {breadcrumbPath.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90 mb-1">
                Lineage
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {breadcrumbPath.map(({ taxid, name }, i) => (
                  <span key={taxid} className="flex items-center gap-0.5 shrink-0">
                    {i > 0 && <span className="text-muted-foreground/50 select-none">›</span>}
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(taxid)
                        setRootOpen(false)
                      }}
                      className={cn(TAXONOMY_LINK_MUTED, "truncate max-w-[80px]")}
                      title={`Re-root to ${name}`}
                    >
                      {name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Root details: rank, record counts, gene counts (always visible) */}
          <div className="space-y-2 border-t border-border/50 pt-2 mt-1">
            {rootRank && (
              <div className="space-y-0.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                  Rank
                </div>
                <div className="text-xs text-foreground">{rootRank}</div>
              </div>
            )}
            {hasRecordCounts && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                  Record counts
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5 tabular-nums">
                  <div className="flex justify-between gap-4">
                    <span>Annotations</span>
                    <span>{annotationsCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Assemblies</span>
                    <span>{assembliesCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Organisms</span>
                    <span>{organismsCount.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
            {(hasGeneCounts || hasTranscriptCounts || hasBuscoCounts) && (
              <div className="space-y-1.5">
                {featureCategories.length > 1 ? (
                  <div className="flex gap-0.5">
                    {featureCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setStackMode(cat)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors",
                          rootFeatureCategory === cat ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {cat === "genes" ? "Genes" : cat === "transcripts" ? "Transcripts" : "BUSCO"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                    {rootFeatureCategory === "genes" ? "Gene counts" : rootFeatureCategory === "transcripts" ? "Transcript counts" : "BUSCO"}
                  </div>
                )}
                {rootFeatureCategory === "genes" && hasGeneCounts && (
                  <>
                    <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                      {coding > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(coding / geneTotal) * 100}%`, backgroundColor: geneColors.coding }} title={`Coding: ${coding.toLocaleString()}`} />}
                      {nonCoding > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(nonCoding / geneTotal) * 100}%`, backgroundColor: geneColors.non_coding }} title={`Non-coding: ${nonCoding.toLocaleString()}`} />}
                      {pseudo > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(pseudo / geneTotal) * 100}%`, backgroundColor: geneColors.pseudogene }} title={`Pseudogene: ${pseudo.toLocaleString()}`} />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.coding }} />Coding <span>{coding.toLocaleString()}</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.non_coding }} />Non-cod <span>{nonCoding.toLocaleString()}</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.pseudogene }} />Pseudo <span>{pseudo.toLocaleString()}</span></span>
                    </div>
                  </>
                )}
                {rootFeatureCategory === "transcripts" && hasTranscriptCounts && currentNode && (
                  <>
                    <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                      {(currentNode.mrna_count ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.mrna_count ?? 0) / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.mRNA }} />}
                      {(currentNode.lncrna_count ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.lncrna_count ?? 0) / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.lncRNA }} />}
                      {(currentNode.trna_count ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.trna_count ?? 0) / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.tRNA }} />}
                      {(currentNode.mirna_count ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.mirna_count ?? 0) / transcriptTotal) * 100}%`, backgroundColor: transcriptColors.miRNA }} />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {(currentNode.mrna_count ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.mRNA }} />mRNA <span>{(currentNode.mrna_count ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.lncrna_count ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.lncRNA }} />lncRNA <span>{(currentNode.lncrna_count ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.trna_count ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.tRNA }} />tRNA <span>{(currentNode.trna_count ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.mirna_count ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.miRNA }} />miRNA <span>{(currentNode.mirna_count ?? 0).toLocaleString()}</span></span>}
                    </div>
                  </>
                )}
                {rootFeatureCategory === "busco" && hasBuscoCounts && currentNode && (
                  <>
                    <div className="flex h-2.5 w-full min-w-32 max-w-44 rounded overflow-hidden bg-muted/50 border border-border/30">
                      {(currentNode.busco_single_copy_mean ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.busco_single_copy_mean ?? 0) / buscoTotal) * 100}%`, backgroundColor: buscoColors.single_copy }} />}
                      {(currentNode.busco_duplicated_mean ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.busco_duplicated_mean ?? 0) / buscoTotal) * 100}%`, backgroundColor: buscoColors.duplicated }} />}
                      {(currentNode.busco_fragmented_mean ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.busco_fragmented_mean ?? 0) / buscoTotal) * 100}%`, backgroundColor: buscoColors.fragmented }} />}
                      {(currentNode.busco_missing_mean ?? 0) > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${((currentNode.busco_missing_mean ?? 0) / buscoTotal) * 100}%`, backgroundColor: buscoColors.missing }} />}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {(currentNode.busco_single_copy_mean ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.single_copy }} />C+S <span>{(currentNode.busco_single_copy_mean ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.busco_duplicated_mean ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.duplicated }} />C+D <span>{(currentNode.busco_duplicated_mean ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.busco_fragmented_mean ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.fragmented }} />F <span>{(currentNode.busco_fragmented_mean ?? 0).toLocaleString()}</span></span>}
                      {(currentNode.busco_missing_mean ?? 0) > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.missing }} />M <span>{(currentNode.busco_missing_mean ?? 0).toLocaleString()}</span></span>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="pt-1.5 border-t border-border/50 mt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-xs gap-1.5"
              onClick={() => {
                onOpenDrawer()
                setRootOpen(false)
              }}
            >
              <BookOpen className="h-3 w-3" />
              View details
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Divider */}
      <div className="w-px h-5 bg-border/60 shrink-0" aria-hidden />

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Visualization mode"
        className="flex items-center gap-0.5"
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-label={label}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-[5px] rounded-md text-xs transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden [@media(min-width:900px)]:inline">{label}</span>
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border/60 shrink-0" aria-hidden />

      {/* Leaf rank popover — active rank uses secondary (matches RankSlider selected state) */}
      <Popover open={leafRankOpen} onOpenChange={setLeafRankOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-[5px] text-xs font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedRank !== null
                ? "bg-secondary/12 text-secondary hover:bg-secondary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            aria-label="Leaf rank"
            aria-expanded={leafRankOpen}
          >
            <span>
              {leafDisplay.label}
              <span
                className={cn(
                  "font-normal tabular-nums ml-0.5",
                  selectedRank !== null ? "text-secondary/80" : "text-muted-foreground/80"
                )}
              >
                ({formatCount(leafDisplay.count)})
              </span>
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", leafRankOpen && "rotate-180")}
              aria-hidden
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={6}
          className={cn("w-52 p-2 rounded-lg border border-border bg-popover/95 backdrop-blur-sm shadow-lg max-h-[70vh] overflow-y-auto")}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <p className="text-xs text-muted-foreground mb-2 px-1 leading-tight">
            Ranks under <span className="text-foreground/90">{rootTitle}</span>. Click one to show that rank as leaves in the viz.
          </p>
          <RankSlider
            distribution={distribution}
            leafCount={leafCount}
            selectedRank={selectedRank}
            onRankSelect={(rank) => {
              onRankSelect(rank)
              setLeafRankOpen(false)
            }}
            rootRank={rootRank}
          />
        </PopoverContent>
      </Popover>

      {/* Divider */}
      <div className="w-px h-5 bg-border/60 shrink-0" aria-hidden />

      {/* Search (passed from page) */}
      {searchSlot}
      </div>
    </div>
  )
}
