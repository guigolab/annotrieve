"use client"

import { useMemo, useCallback, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { X, Compass, Info, ChevronUp, ChevronDown, ChevronRight, ExternalLink, FileSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WikiSummary } from "@/components/wiki-summary"
import type { FlatTreeNode } from "@/lib/api/taxons"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useFlattenedTreeStore } from "@/lib/stores/flattened-tree"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { buildAnnotationsListUrl, buildEntityDetailsUrl } from "@/lib/utils"
import { getTreeGeneColors, getTreeTranscriptColors, getTreeBuscoColors } from "./taxonomy-tree-controls"
import type { FeatureCountCategory } from "./taxonomy-node-tooltip"
import { TAXONOMY_HIGHLIGHT_COLOR } from "./taxonomy-types"
import { useUIStore } from "@/lib/stores/ui"
import type { TaxonRecord } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const GENE_COUNT_LABELS = { coding: "Coding", non_coding: "Non-cod", pseudogene: "Pseudo" } as const

function flatNodeToTaxonRecord(n: FlatTreeNode): TaxonRecord {
  return {
    taxid: n.id,
    scientific_name: n.scientific_name,
    rank: n.rank ?? undefined,
    organisms_count: n.organisms_count,
    assemblies_count: n.assemblies_count,
    annotations_count: n.annotations_count,
  }
}

interface TaxonomyDetailsPanelProps {
  selectedTaxon: { taxid: string; taxon: TaxonRecord }
  isPanelTaxonCurrentRoot: boolean
  /** The taxon currently used as view root (for ghost breadcrumb) */
  currentRootTaxon: TaxonRecord
  /** How many levels below the current root the selected taxon sits */
  depthFromRoot: number
  /** Currently pinned taxon for comparison (null = none) */
  pinnedTaxon: { taxid: string; taxon: TaxonRecord } | null
  onPin: (payload: { taxid: string; taxon: TaxonRecord }) => void
  onUnpin: () => void
  onClose: () => void
  onExploreFrom: () => void
  onSelectAncestor: (ancestor: TaxonRecord) => void
}

export function TaxonomyDetailsPanel({
  selectedTaxon,
  isPanelTaxonCurrentRoot,
  currentRootTaxon,
  depthFromRoot,
  pinnedTaxon,
  onPin,
  onUnpin,
  onClose,
  onExploreFrom,
  onSelectAncestor,
}: TaxonomyDetailsPanelProps) {
  const router = useRouter()
  const setSelectedTaxons = useAnnotationsFiltersStore((state) => state.setSelectedTaxons)

  const flatNodes = useFlattenedTreeStore((s) => s.flatNodes)
  const getTaxonContext = useFlattenedTreeStore((s) => s.getTaxonContext)
  const treeContext = useMemo(
    () => getTaxonContext(selectedTaxon.taxid),
    [getTaxonContext, selectedTaxon.taxid, flatNodes]
  )
  const ancestors: TaxonRecord[] = useMemo(
    () => treeContext.ancestors.map(flatNodeToTaxonRecord),
    [treeContext.ancestors]
  )
  const childrenFromTree: TaxonRecord[] = useMemo(
    () => treeContext.children.map(flatNodeToTaxonRecord),
    [treeContext.children]
  )

  const theme = useUIStore((s) => s.theme)
  const isDark = theme === "dark"
  const geneColors = getTreeGeneColors(isDark)
  const transcriptColors = getTreeTranscriptColors(isDark)
  const buscoColors = getTreeBuscoColors(isDark)
  const highlightColor = TAXONOMY_HIGHLIGHT_COLOR[isDark ? "dark" : "light"]

  const geneCounts = useMemo((): { coding: number; non_coding: number; pseudogene: number } | null => {
    const node = treeContext.node
    if (!node) return null
    const coding = node.coding_count ?? 0
    const non_coding = node.non_coding_count ?? 0
    const pseudogene = node.pseudogene_count ?? 0
    if (coding === 0 && non_coding === 0 && pseudogene === 0) return null
    return { coding, non_coding, pseudogene }
  }, [treeContext.node])

  const transcriptCounts = useMemo((): { mRNA: number; lncRNA: number; tRNA: number; miRNA: number } | null => {
    const node = treeContext.node
    if (!node) return null
    const mRNA = node.mrna_count ?? 0
    const lncRNA = node.lncrna_count ?? 0
    const tRNA = node.trna_count ?? 0
    const miRNA = node.mirna_count ?? 0
    if (mRNA === 0 && lncRNA === 0 && tRNA === 0 && miRNA === 0) return null
    return { mRNA, lncRNA, tRNA, miRNA }
  }, [treeContext.node])

  const buscoCounts = useMemo((): { single_copy: number; duplicated: number; fragmented: number; missing: number } | null => {
    const node = treeContext.node
    if (!node) return null
    const single_copy = node.busco_single_copy_mean ?? 0
    const duplicated = node.busco_duplicated_mean ?? 0
    const fragmented = node.busco_fragmented_mean ?? 0
    const missing = node.busco_missing_mean ?? 0
    if (single_copy === 0 && duplicated === 0 && fragmented === 0 && missing === 0) return null
    return { single_copy, duplicated, fragmented, missing }
  }, [treeContext.node])

  const featureCategories: FeatureCountCategory[] = [
    ...(geneCounts ? (["genes"] as const) : []),
    ...(transcriptCounts ? (["transcripts"] as const) : []),
    ...(buscoCounts ? (["busco"] as const) : []),
  ]
  const stackMode = useTaxonomyGeneTypesStore((s) => s.stackMode)
  const setStackMode = useTaxonomyGeneTypesStore((s) => s.setStackMode)
  /** Default to bottom-strip selected category; fallback to first available. */
  const featureCategory: FeatureCountCategory =
    featureCategories.includes(stackMode) ? stackMode : (featureCategories[0] ?? "genes")

  const handleViewFullDetails = useCallback(() => {
    router.push(buildEntityDetailsUrl("taxon", selectedTaxon.taxid))
  }, [selectedTaxon.taxid, router])

  const handleViewRelatedAnnotations = useCallback(() => {
    setSelectedTaxons([selectedTaxon.taxon])
    router.push(buildAnnotationsListUrl({ taxids: [String(selectedTaxon.taxid)] }))
  }, [selectedTaxon.taxon, selectedTaxon.taxid, setSelectedTaxons, router])

  const hasChildren = childrenFromTree.length > 0
  const isLeaf = !hasChildren
  const isPinned = pinnedTaxon?.taxid === selectedTaxon.taxid

  // Immediate parent from ancestors list (last = direct parent)
  const directParent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null

  const currentRootTaxid = currentRootTaxon?.taxid ?? null

  // Direction for Navigate transition (current row slides in from parent or children)
  const [navigateDirection, setNavigateDirection] = useState<"up" | "down" | null>(null)
  const prevTaxidRef = useRef(selectedTaxon.taxid)
  useEffect(() => {
    if (navigateDirection == null) return
    const t = setTimeout(() => setNavigateDirection(null), 400)
    return () => clearTimeout(t)
  }, [navigateDirection])
  useEffect(() => {
    prevTaxidRef.current = selectedTaxon.taxid
  }, [selectedTaxon.taxid])

  return (
    <div
      className={cn(
        "flex flex-col h-full w-full min-w-0 animate-in fade-in duration-200 bg-background",
        isPanelTaxonCurrentRoot && "bg-primary/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-sm font-semibold truncate">Taxon details</span>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Navigate: compact tree (parent → current → children) with hierarchy padding and slide transitions. overflow-visible so row slide animation is not clipped. */}
      <div className="flex-shrink-0 border-b border-border/50 bg-muted/20">
        <div className="px-2.5 pt-2 pb-1.5">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90 mb-1.5 px-0.5">
            Navigate
          </h4>
          <div className="flex overflow-visible">
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Parent row — default padding */}
              {directParent && (
                <button
                  type="button"
                  onClick={() => {
                    setNavigateDirection("up")
                    onSelectAncestor(directParent)
                  }}
                  className={cn(
                    "flex items-center gap-1.5 w-full text-left pl-2 pr-2 py-1.5 min-h-0",
                    "text-[11px] hover:bg-muted/50 transition-colors duration-150 border-b border-border/30",
                    directParent.taxid === currentRootTaxid ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                  )}
                  title={`Select ${directParent.scientific_name}`}
                >
                  <ChevronUp className="h-3 w-3 shrink-0 opacity-70" />
                  <span className="truncate min-w-0">{directParent.scientific_name}</span>
                  {directParent.taxid === currentRootTaxid && (
                    <span className="shrink-0 text-[9px] uppercase tracking-wider text-primary/90">Root</span>
                  )}
                </button>
              )}
              {/* Current row — more left padding; animates from parent/children indent; same highlight as viz */}
              <div
                key={selectedTaxon.taxid}
                className={cn(
                  "flex items-center gap-1.5 pl-4 pr-2 py-1.5 min-h-0",
                  "border-y text-[11px] font-semibold",
                  navigateDirection === "up" && "navigate-current-in-up",
                  navigateDirection === "down" && "navigate-current-in-down"
                )}
                style={{
                  backgroundColor: `${highlightColor}20`,
                  color: highlightColor,
                  borderColor: `${highlightColor}40`,
                }}
                title={selectedTaxon.taxon.scientific_name ?? undefined}
              >
                <span
                  className="w-3 h-3 shrink-0 rounded-full border"
                  style={{
                    backgroundColor: `${highlightColor}66`,
                    borderColor: `${highlightColor}99`,
                  }}
                  aria-hidden
                />
                <span className="truncate min-w-0">{selectedTaxon.taxon.scientific_name}</span>
                {selectedTaxon.taxid === currentRootTaxid && (
                  <span className="shrink-0 text-[9px] uppercase tracking-wider opacity-90">Root</span>
                )}
              </div>
              {/* Children — even more left padding */}
              {childrenFromTree.length > 0 ? (
                <div className="max-h-28 overflow-y-auto overscroll-contain">
                  {childrenFromTree.map((child) => {
                    const isRoot = child.taxid === currentRootTaxid
                    return (
                      <button
                        key={child.taxid}
                        type="button"
                        onClick={() => {
                          setNavigateDirection("down")
                          onSelectAncestor(child)
                        }}
                        className={cn(
                          "flex items-center gap-1.5 w-full text-left pl-5 pr-2 py-1.5 min-h-0",
                          "text-[11px] hover:bg-muted/50 transition-colors duration-150 border-t border-border/20 first:border-t-0",
                          isRoot ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={`Select ${child.scientific_name}`}
                      >
                        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="truncate min-w-0">{child.scientific_name}</span>
                        {isRoot && (
                          <span className="shrink-0 text-[9px] uppercase tracking-wider text-primary/90">Root</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : !directParent ? (
                <p className="text-[10px] text-muted-foreground/80 pl-5 pr-2 py-1.5 border-t border-border/20">
                  No parent or children in this view.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 min-w-0 overflow-auto p-3 space-y-4">
        <>
          {/* 1. Identity: name + rank left, small link buttons right */}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-foreground truncate" title={selectedTaxon.taxon.scientific_name}>
                {selectedTaxon.taxon.scientific_name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                {selectedTaxon.taxon.rank && (
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 capitalize">{selectedTaxon.taxon.rank}</span>
                )}
                <span className="font-mono">TaxID {selectedTaxon.taxid}</span>
              </div>
            </div>
              <div className="flex items-baseline gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  onClick={handleViewFullDetails}
                  title="Full details"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  Details
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  onClick={handleViewRelatedAnnotations}
                  title="View annotations"
                >
                  <FileSearch className="h-3 w-3 shrink-0" />
                  Annotations
                </Button>
              </div>
            </div>

            {/* 2. Primary action: Set as root (or Compare if pinned) */}
            <div className="space-y-3">
              {isPanelTaxonCurrentRoot ? (
                  <Button
                    variant="secondary"
                    disabled
                    className="w-full h-10 font-semibold gap-2 bg-muted/80 text-muted-foreground cursor-not-allowed"
                  >
                    <Compass className="h-4 w-4" />
                    Already selected
                  </Button>
              ) : hasChildren ? (
                  <Button
                    onClick={onExploreFrom}
                    title="Set this taxon as the tree root and show only its lineage (descendants)"
                    className="w-full h-10 font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Compass className="h-4 w-4" />
                    Explore lineage
                  </Button>
              ) : null}

            </div>

            {/* 3. Counts: record counts + feature counts (Genes | Transcripts | BUSCO, one at a time) */}
            <div className="space-y-2.5 pt-2 border-t border-border/50">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                Record counts
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5 tabular-nums">
                <div className="flex justify-between gap-4">
                  <span>Annotations</span>
                  <span>{(selectedTaxon.taxon.annotations_count ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Assemblies</span>
                  <span>{(selectedTaxon.taxon.assemblies_count ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Organisms</span>
                  <span>{(selectedTaxon.taxon.organisms_count ?? 0).toLocaleString()}</span>
                </div>
              </div>
              {(geneCounts || transcriptCounts || buscoCounts) && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  {featureCategories.length > 1 ? (
                    <div className="flex gap-0.5">
                      {featureCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setStackMode(cat)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors",
                            featureCategory === cat ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                        >
                          {cat === "genes" ? "Genes" : cat === "transcripts" ? "Transcripts" : "BUSCO"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                      {featureCategory === "genes" ? "Gene counts" : featureCategory === "transcripts" ? "Transcript counts" : "BUSCO"}
                    </div>
                  )}
                  {featureCategory === "genes" && geneCounts && (() => {
                    const total = geneCounts.coding + geneCounts.non_coding + geneCounts.pseudogene
                    if (total <= 0) return null
                    const formatN = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1))
                    return (
                      <>
                        <div className="flex h-2.5 w-full min-w-32 rounded overflow-hidden bg-muted/50 border border-border/30">
                          {geneCounts.coding > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.coding / total) * 100}%`, backgroundColor: geneColors.coding }} />}
                          {geneCounts.non_coding > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.non_coding / total) * 100}%`, backgroundColor: geneColors.non_coding }} />}
                          {geneCounts.pseudogene > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(geneCounts.pseudogene / total) * 100}%`, backgroundColor: geneColors.pseudogene }} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.coding }} />{GENE_COUNT_LABELS.coding} <span>{formatN(geneCounts.coding)}</span></span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.non_coding }} />{GENE_COUNT_LABELS.non_coding} <span>{formatN(geneCounts.non_coding)}</span></span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: geneColors.pseudogene }} />{GENE_COUNT_LABELS.pseudogene} <span>{formatN(geneCounts.pseudogene)}</span></span>
                        </div>
                      </>
                    )
                  })()}
                  {featureCategory === "transcripts" && transcriptCounts && (() => {
                    const total = transcriptCounts.mRNA + transcriptCounts.lncRNA + transcriptCounts.tRNA + transcriptCounts.miRNA
                    if (total <= 0) return null
                    const formatN = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1))
                    return (
                      <>
                        <div className="flex h-2.5 w-full min-w-32 rounded overflow-hidden bg-muted/50 border border-border/30">
                          {transcriptCounts.mRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.mRNA / total) * 100}%`, backgroundColor: transcriptColors.mRNA }} />}
                          {transcriptCounts.lncRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.lncRNA / total) * 100}%`, backgroundColor: transcriptColors.lncRNA }} />}
                          {transcriptCounts.tRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.tRNA / total) * 100}%`, backgroundColor: transcriptColors.tRNA }} />}
                          {transcriptCounts.miRNA > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(transcriptCounts.miRNA / total) * 100}%`, backgroundColor: transcriptColors.miRNA }} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {transcriptCounts.mRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.mRNA }} />mRNA <span>{formatN(transcriptCounts.mRNA)}</span></span>}
                          {transcriptCounts.lncRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.lncRNA }} />lncRNA <span>{formatN(transcriptCounts.lncRNA)}</span></span>}
                          {transcriptCounts.tRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.tRNA }} />tRNA <span>{formatN(transcriptCounts.tRNA)}</span></span>}
                          {transcriptCounts.miRNA > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: transcriptColors.miRNA }} />miRNA <span>{formatN(transcriptCounts.miRNA)}</span></span>}
                        </div>
                      </>
                    )
                  })()}
                  {featureCategory === "busco" && buscoCounts && (() => {
                    const total = buscoCounts.single_copy + buscoCounts.duplicated + buscoCounts.fragmented + buscoCounts.missing
                    if (total <= 0) return null
                    const formatN = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1))
                    return (
                      <>
                        <div className="flex h-2.5 w-full min-w-32 rounded overflow-hidden bg-muted/50 border border-border/30">
                          {buscoCounts.single_copy > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.single_copy / total) * 100}%`, backgroundColor: buscoColors.single_copy }} />}
                          {buscoCounts.duplicated > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.duplicated / total) * 100}%`, backgroundColor: buscoColors.duplicated }} />}
                          {buscoCounts.fragmented > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.fragmented / total) * 100}%`, backgroundColor: buscoColors.fragmented }} />}
                          {buscoCounts.missing > 0 && <div className="h-full min-w-[2px] transition-colors" style={{ width: `${(buscoCounts.missing / total) * 100}%`, backgroundColor: buscoColors.missing }} />}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                          {buscoCounts.single_copy > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.single_copy }} />C+S <span>{formatN(buscoCounts.single_copy)}</span></span>}
                          {buscoCounts.duplicated > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.duplicated }} />C+D <span>{formatN(buscoCounts.duplicated)}</span></span>}
                          {buscoCounts.fragmented > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.fragmented }} />F <span>{formatN(buscoCounts.fragmented)}</span></span>}
                          {buscoCounts.missing > 0 && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: buscoColors.missing }} />M <span>{formatN(buscoCounts.missing)}</span></span>}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* 4. Lineage (full path); highlight node that is the current root */}
            {ancestors.length > 0 && (
              <div>
                <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 mb-1.5">Full path</h4>
                <div className="flex flex-wrap gap-1">
                  {ancestors.map((a) => {
                    const isCurrentRoot = currentRootTaxid != null && a.taxid === currentRootTaxid
                    return (
                      <button
                        key={a.taxid}
                        type="button"
                        onClick={() => onSelectAncestor(a)}
                        title={`Select ${a.scientific_name} as current taxon`}
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded transition-colors truncate max-w-[120px] hover:bg-muted/70",
                          isCurrentRoot
                            ? "bg-primary/15 border border-primary/40 text-primary font-medium"
                            : "bg-muted/40 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {a.scientific_name}
                      </button>
                    )
                  })}
                  <span
                    className={cn(
                      "text-[11px] px-2 py-0.5 truncate max-w-[120px] rounded",
                      currentRootTaxid != null && selectedTaxon.taxid === currentRootTaxid
                        ? "bg-primary/15 border border-primary/40 text-primary font-semibold"
                        : "font-semibold text-foreground"
                    )}
                    title="Current selected taxon"
                  >
                    {selectedTaxon.taxon.scientific_name}
                  </span>
                </div>
              </div>
            )}

            {/* 5. WikiSummary (learn more) */}
            <WikiSummary searchTerm={selectedTaxon.taxon.scientific_name || ""} />
        </>
      </div>

      {/* Footer: leaf note only (Details / Annotations are by the title) */}
      {isLeaf && (
        <div className="flex-shrink-0 border-t border-border p-3 bg-muted/20">
          <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-snug">
              Leaf taxon (no children). Use Details or Annotations above for more.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
