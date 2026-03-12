"use client"

import { useEffect, useState, useRef, useMemo, useCallback } from "react"
import * as d3 from "d3"
import {
  useFlattenedTreeStore,
  useFilteredTreeByRootAndRank,
} from "@/lib/stores/flattened-tree"
import { useUIStore } from "@/lib/stores/ui"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { Loader2 } from "lucide-react"
import {
  TaxonomyTreeControls,
  getTreeGeneColors,
  type TreeRankOption,
} from "./taxonomy-tree-controls"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { NodeClickEvent } from "./taxonomy-types"

const ROW_HEIGHT = 28
const INDENT = 24
const LABEL_LEFT = 48
const LABEL_ZONE_WIDTH = 180
const GAP_BEFORE_BAR = 8
const BAR_WIDTH = 140
const BAR_HEIGHT = 20
const TRIANGLE_SIZE = 8
const MAX_CANVAS_DIM = 16384

interface LayoutNode {
  node: d3.HierarchyNode<FlatTreeNode>
  depth: number
  rowIndex: number
  x: number
  y: number
  childrenSpan: { y0: number; y1: number } | null
}

function buildLayoutNodes(
  root: d3.HierarchyNode<FlatTreeNode>,
  collapsedIds: Set<string>
): LayoutNode[] {
  const result: LayoutNode[] = []
  let rowIndex = 0

  function visit(n: d3.HierarchyNode<FlatTreeNode>, depth: number): number {
    const firstRow = rowIndex
    const y = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2
    result.push({
      node: n,
      depth,
      rowIndex,
      x: LABEL_LEFT + depth * INDENT,
      y,
      childrenSpan: null,
    })
    rowIndex++

    const isCollapsed = collapsedIds.has(n.data.id)
    const children = !isCollapsed && n.children ? n.children : []
    let lastChildRow = firstRow
    for (const child of children) {
      lastChildRow = visit(child, depth + 1)
    }

    const layoutNode = result[result.length - 1 - (rowIndex - 1 - firstRow)]
    if (children.length > 0) {
      const lastChildY = lastChildRow * ROW_HEIGHT + ROW_HEIGHT / 2
      layoutNode.childrenSpan = { y0: y, y1: lastChildY }
    }
    return lastChildRow
  }

  visit(root, 0)
  return result
}

function getHasChildrenIds(root: d3.HierarchyNode<FlatTreeNode>): Set<string> {
  const ids = new Set<string>()
  root.each((n) => {
    if (n.children && n.children.length > 0) ids.add(n.data.id)
  })
  return ids
}

interface TaxonomyTreeCanvasProps {
  rootTaxid?: string | null
  highlightTaxid?: string | null
  selectedTaxid?: string | null
  onNodeClick?: (event: NodeClickEvent) => void
  /** @deprecated use onNodeClick */
  onTaxonSelect?: (taxid: string, taxon: FlatTreeNode) => void
  onDoubleClick?: (taxid: string, taxon: FlatTreeNode) => void
  hideControls?: boolean
  controlledRank?: TreeRankOption | null
  scopeHint?: string
}

export function TaxonomyTreeCanvas({
  rootTaxid = null,
  highlightTaxid = null,
  selectedTaxid = null,
  onNodeClick,
  onTaxonSelect,
  onDoubleClick,
  hideControls,
  controlledRank,
  scopeHint,
}: TaxonomyTreeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [internalRank, setInternalRank] = useState<TreeRankOption>("class")

  const selectedRank: TreeRankOption = controlledRank !== undefined
    ? (controlledRank === null ? "all" : controlledRank)
    : internalRank
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [hoveredLayoutNode, setHoveredLayoutNode] = useState<LayoutNode | null>(
    null
  )
  const [hoveredOnBar, setHoveredOnBar] = useState(false)
  const [hoveredExpandZone, setHoveredExpandZone] = useState(false)
  // Bar display mode: absolute counts vs percentage of max
  const [barMode, setBarMode] = useState<"absolute" | "percent">("absolute")
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  )
  const layoutNodesRef = useRef<LayoutNode[]>([])
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"
  const selectedGeneTypes = useTaxonomyGeneTypesStore((s) => s.selectedGeneTypes)

  const { isLoading, error, fetchFlattenedTree } = useFlattenedTreeStore()
  const rankForFilter: string | null =
    controlledRank !== undefined
      ? controlledRank === null || controlledRank === "all"
        ? null
        : controlledRank
      : selectedRank === "all"
        ? null
        : selectedRank
  const filteredTree = useFilteredTreeByRootAndRank(rootTaxid, rankForFilter)

  const hasChildrenIds = useMemo(
    () => (filteredTree ? getHasChildrenIds(filteredTree) : new Set<string>()),
    [filteredTree]
  )

  // Ancestor path IDs for glow stroke when a node is highlighted
  const ancestorPathIds = useMemo(() => {
    if (!highlightTaxid || !filteredTree) return new Set<string>()
    let target: d3.HierarchyNode<FlatTreeNode> | null = null
    filteredTree.each((n) => { if (n.data.id === highlightTaxid) target = n })
    if (!target) return new Set<string>()
    const ids = new Set<string>()
    let cur: d3.HierarchyNode<FlatTreeNode> | null = target as d3.HierarchyNode<FlatTreeNode>
    while (cur) {
      ids.add(cur.data.id)
      cur = cur.parent
    }
    return ids
  }, [highlightTaxid, filteredTree])

  const layoutNodes = useMemo(() => {
    if (!filteredTree) return []
    return buildLayoutNodes(filteredTree, collapsedIds)
  }, [filteredTree, collapsedIds])

  const totalHeight = layoutNodes.length * ROW_HEIGHT
  const geneColors = useMemo(() => getTreeGeneColors(isDark), [isDark])

  useEffect(() => {
    layoutNodesRef.current = layoutNodes
  }, [layoutNodes])

  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    ro.observe(el)
    setViewportHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [filteredTree])

  // When highlightTaxid is set: expand path to that node and scroll it into view
  useEffect(() => {
    if (!highlightTaxid || !filteredTree || !scrollRef.current) return
    let targetNode: d3.HierarchyNode<FlatTreeNode> | null = null
    filteredTree.each((n) => {
      if (n.data.id === highlightTaxid) targetNode = n
    })
    if (!targetNode) return
    const node = targetNode as d3.HierarchyNode<FlatTreeNode>
    const ancestorIds = node.ancestors().slice(1).map((a: d3.HierarchyNode<FlatTreeNode>) => a.data.id)
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      ancestorIds.forEach((id: string) => next.delete(id))
      return next
    })
  }, [highlightTaxid, filteredTree])

  // Scroll to highlighted node after layout updates (collapsedIds may have changed)
  const prevHighlightTaxidRef = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightTaxid) {
      prevHighlightTaxidRef.current = null
      return
    }
    if (!scrollRef.current) return
    const layout = layoutNodesRef.current.find(
      (ln) => ln.node.data.id === highlightTaxid
    )
    if (!layout) return
    const rowY = layout.rowIndex * ROW_HEIGHT
    const vh = scrollRef.current.clientHeight
    const desiredScrollTop = Math.max(0, rowY - vh / 2 + ROW_HEIGHT / 2)
    if (prevHighlightTaxidRef.current !== highlightTaxid) {
      prevHighlightTaxidRef.current = highlightTaxid
      scrollRef.current.scrollTop = desiredScrollTop
    }
  }, [highlightTaxid, layoutNodes, collapsedIds])

  const getMaxGeneSum = useCallback(() => {
    let max = 0
    for (const { node } of layoutNodesRef.current) {
      const d = node.data
      let sum = 0
      if (selectedGeneTypes.has("coding")) sum += d.coding_count ?? 0
      if (selectedGeneTypes.has("non_coding")) sum += d.non_coding_count ?? 0
      if (selectedGeneTypes.has("pseudogene")) sum += d.pseudogene_count ?? 0
      if (sum > max) max = sum
    }
    return max || 1
  }, [selectedGeneTypes])

  useEffect(() => {
    if (!filteredTree || !canvasRef.current || !scrollRef.current || isLoading)
      return

    const canvas = canvasRef.current
    const scrollEl = scrollRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = scrollEl.clientWidth
    const height = viewportHeight

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      MAX_CANVAS_DIM / width,
      MAX_CANVAS_DIM / height
    )
    const cw = Math.min(Math.round(width * dpr), MAX_CANVAS_DIM)
    const ch = Math.min(Math.round(height * dpr), MAX_CANVAS_DIM)
    canvas.width = cw
    canvas.height = ch
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.translate(0, -scrollTop)

    const textColor = isDark ? "#e2e8f0" : "#1e293b"
    const lineColor = isDark ? "#475569" : "#cbd5e1"
    const hoverBg = isDark ? "rgba(248,250,252,0.08)" : "rgba(15,23,42,0.04)"

    const maxGeneSum = getMaxGeneSum()

    ctx.font = "12px system-ui, sans-serif"
    ctx.textBaseline = "middle"

    const visibleTop = scrollTop
    const visibleBottom = scrollTop + height
    const startRow = Math.max(0, Math.floor(visibleTop / ROW_HEIGHT))
    const endRow = Math.min(
      layoutNodesRef.current.length - 1,
      Math.ceil(visibleBottom / ROW_HEIGHT) - 1
    )

    const barTopBase = (ROW_HEIGHT - BAR_HEIGHT) / 2

    for (let i = startRow; i <= endRow; i++) {
      const layout = layoutNodesRef.current[i]
      if (!layout) continue
      const { node, depth, rowIndex, x, y, childrenSpan } = layout
      const data = node.data
      const rowY = rowIndex * ROW_HEIGHT
      const isHovered =
        hoveredLayoutNode === layout ||
        (highlightTaxid != null && data.id === highlightTaxid)
      const labelMaxWidth = LABEL_ZONE_WIDTH
      const hasChildren = hasChildrenIds.has(data.id)
      const isCollapsed = collapsedIds.has(data.id)

      if (isHovered) {
        ctx.fillStyle = hoverBg
        ctx.fillRect(0, rowY, width, ROW_HEIGHT)
      }

      if (depth > 0) {
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1
        const parentVx = LABEL_LEFT + (depth - 1) * INDENT + INDENT / 2
        ctx.beginPath()
        ctx.moveTo(parentVx, y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }

      if (hasChildren) {
        const tx = x - INDENT / 2 - TRIANGLE_SIZE / 2
        const ty = rowY + ROW_HEIGHT / 2
        ctx.fillStyle = textColor
        ctx.beginPath()
        if (isCollapsed) {
          ctx.moveTo(tx, ty - TRIANGLE_SIZE / 2)
          ctx.lineTo(tx, ty + TRIANGLE_SIZE / 2)
          ctx.lineTo(tx + TRIANGLE_SIZE, ty)
        } else {
          ctx.moveTo(tx, ty - TRIANGLE_SIZE / 2)
          ctx.lineTo(tx + TRIANGLE_SIZE, ty)
          ctx.lineTo(tx, ty + TRIANGLE_SIZE / 2)
        }
        ctx.closePath()
        ctx.fill()
      }

      const label = data.scientific_name || data.id || "—"
      let drawLabel = label
      for (let w = ctx.measureText(drawLabel).width; w > labelMaxWidth && drawLabel.length > 2; ) {
        drawLabel = drawLabel.slice(0, -1)
        w = ctx.measureText(drawLabel + "…").width
      }
      if (drawLabel.length < label.length) drawLabel += "…"
      ctx.fillStyle = textColor
      ctx.fillText(drawLabel, x, rowY + ROW_HEIGHT / 2)

      const coding = data.coding_count ?? 0
      const nonCoding = data.non_coding_count ?? 0
      const pseudo = data.pseudogene_count ?? 0
      const total =
        (selectedGeneTypes.has("coding") ? coding : 0) +
        (selectedGeneTypes.has("non_coding") ? nonCoding : 0) +
        (selectedGeneTypes.has("pseudogene") ? pseudo : 0)

      const barTop = rowY + barTopBase
      const isBarHovered = isHovered && hoveredOnBar
      const rowBarLeft = x + LABEL_ZONE_WIDTH + GAP_BEFORE_BAR

      if (total > 0) {
        const scale = barMode === "percent" ? BAR_WIDTH / total : BAR_WIDTH / maxGeneSum
        let offset = 0
        if (selectedGeneTypes.has("coding") && coding > 0) {
          const w = coding * scale
          ctx.fillStyle = geneColors.coding
          ctx.fillRect(rowBarLeft + offset, barTop, w, BAR_HEIGHT)
          offset += w
        }
        if (selectedGeneTypes.has("non_coding") && nonCoding > 0) {
          const w = nonCoding * scale
          ctx.fillStyle = geneColors.non_coding
          ctx.fillRect(rowBarLeft + offset, barTop, w, BAR_HEIGHT)
          offset += w
        }
        if (selectedGeneTypes.has("pseudogene") && pseudo > 0) {
          const w = pseudo * scale
          ctx.fillStyle = geneColors.pseudogene
          ctx.fillRect(rowBarLeft + offset, barTop, w, BAR_HEIGHT)
        }
        if (isBarHovered) {
          ctx.strokeStyle = isDark ? "#94a3b8" : "#64748b"
          ctx.lineWidth = 1.5
          ctx.strokeRect(rowBarLeft, barTop, BAR_WIDTH, BAR_HEIGHT)
        }
      }

      // Ancestor path glow: highlight the entire row with a glowing left border
      if (ancestorPathIds.has(data.id) && data.id !== highlightTaxid) {
        ctx.fillStyle = isDark ? "rgba(251,191,36,0.07)" : "rgba(245,158,11,0.07)"
        ctx.fillRect(0, rowY, width, ROW_HEIGHT)
        ctx.fillStyle = isDark ? "#fbbf24" : "#f59e0b"
        ctx.fillRect(0, rowY + 2, 3, ROW_HEIGHT - 4)
      }
    }

    for (const layout of layoutNodesRef.current) {
      const { depth, childrenSpan } = layout
      if (!childrenSpan) continue
      const clipTop = Math.max(childrenSpan.y0, visibleTop)
      const clipBottom = Math.min(childrenSpan.y1, visibleBottom)
      if (clipTop >= clipBottom) continue
      const vx = LABEL_LEFT + depth * INDENT + INDENT / 2
      ctx.strokeStyle = lineColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(vx, clipTop)
      ctx.lineTo(vx, clipBottom)
      ctx.stroke()
    }
  }, [
    filteredTree,
    isLoading,
    totalHeight,
    geneColors,
    isDark,
    hoveredLayoutNode,
    hoveredOnBar,
    getMaxGeneSum,
    scrollTop,
    viewportHeight,
    hasChildrenIds,
    collapsedIds,
    selectedGeneTypes,
    highlightTaxid,
    barMode,
    ancestorPathIds,
  ])

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop)
  }, [])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollRef.current) return
      const rect = scrollRef.current.getBoundingClientRect()
      const st = scrollRef.current.scrollTop
      const mouseY = e.clientY - rect.top + st
      const mouseX = e.clientX - rect.left
      const rowIndex = Math.floor(mouseY / ROW_HEIGHT)
      const layoutNodes = layoutNodesRef.current
      const layout = layoutNodes[rowIndex] ?? null
      setHoveredLayoutNode(layout ?? null)
      setHoveredOnBar(
        !!(
          layout &&
          mouseX >= layout.x + LABEL_ZONE_WIDTH + GAP_BEFORE_BAR &&
          mouseX <= layout.x + LABEL_ZONE_WIDTH + GAP_BEFORE_BAR + BAR_WIDTH
        )
      )
      setHoveredExpandZone(
        !!(
          layout &&
          hasChildrenIds.has(layout.node.data.id) &&
          mouseX >= layout.x - INDENT &&
          mouseX <= layout.x
        )
      )
      setTooltipPos(layout ? { x: e.clientX, y: e.clientY } : null)
    },
    [hasChildrenIds]
  )

  const handleMouseLeave = useCallback(() => {
    setHoveredLayoutNode(null)
    setHoveredOnBar(false)
    setHoveredExpandZone(false)
    setTooltipPos(null)
  }, [])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollRef.current) return
      const rect = scrollRef.current.getBoundingClientRect()
      const st = scrollRef.current.scrollTop
      const mouseY = e.clientY - rect.top + st
      const mouseX = e.clientX - rect.left
      const rowIndex = Math.floor(mouseY / ROW_HEIGHT)
      const layoutNodes = layoutNodesRef.current
      const layout = layoutNodes[rowIndex] ?? null
      if (!layout) return
      const data = layout.node.data
      const hasChildren = hasChildrenIds.has(data.id)
      const expandZoneLeft = layout.x - INDENT
      const expandZoneRight = layout.x
      if (
        hasChildren &&
        mouseX >= expandZoneLeft &&
        mouseX <= expandZoneRight
      ) {
        e.preventDefault()
        setCollapsedIds((prev) => {
          const next = new Set(prev)
          if (next.has(data.id)) next.delete(data.id)
          else next.add(data.id)
          return next
        })
      } else if (onNodeClick) {
        onNodeClick({ taxid: data.id, node: data, screenX: e.clientX, screenY: e.clientY })
      } else if (onTaxonSelect) {
        onTaxonSelect(data.id, data)
      }
    },
    [hasChildrenIds, onNodeClick, onTaxonSelect]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollRef.current || !onDoubleClick) return
      const rect = scrollRef.current.getBoundingClientRect()
      const st = scrollRef.current.scrollTop
      const mouseY = e.clientY - rect.top + st
      const rowIndex = Math.floor(mouseY / ROW_HEIGHT)
      const layout = layoutNodesRef.current[rowIndex] ?? null
      if (!layout) return
      onDoubleClick(layout.node.data.id, layout.node.data)
    },
    [onDoubleClick]
  )

  if (isLoading && layoutNodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (!filteredTree || layoutNodes.length === 0) {
    return (
      <div className="rounded-lg border border-border p-3 text-center text-sm text-muted-foreground">
        No taxonomy data. Load the flattened tree first.
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      {!hideControls && (
        <>
          <p className="text-xs text-muted-foreground">
            {scopeHint
              ? `Tree under ${scopeHint}. Click to select · Double-click to re-root · Toggle bars between absolute counts and % share.`
              : "Expandable tree. Click to select · Double-click to re-root · Toggle bars between absolute counts and % share."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <TaxonomyTreeControls
              rootTaxid={rootTaxid}
              selectedRank={selectedRank}
              onRankChange={setInternalRank}
              geneColors={geneColors}
            />
            {/* Absolute / % toggle */}
            <div className="flex items-center gap-1 rounded-md border border-border overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setBarMode("absolute")}
                className={`px-2.5 py-1 transition-colors ${barMode === "absolute" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
              >
                Abs
              </button>
              <button
                type="button"
                onClick={() => setBarMode("percent")}
                className={`px-2.5 py-1 transition-colors ${barMode === "percent" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
              >
                %
              </button>
            </div>
          </div>
        </>
      )}

      <div
        ref={scrollRef}
        className={`w-full overflow-y-auto overflow-x-auto ${hoveredExpandZone ? "cursor-pointer" : "cursor-default"}`}
        style={{ maxHeight: "80vh" }}
        onScroll={handleScroll}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{
              position: "sticky",
              top: 0,
              left: 0,
              display: "block",
            }}
          />
        </div>
      </div>

      {hoveredLayoutNode && tooltipPos && (
        <div
          className="fixed z-50 pointer-events-none rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 8,
          }}
        >
          {hoveredOnBar ? (
            <div className="font-medium text-foreground space-y-1">
              <div className="font-medium text-foreground">
                {hoveredLayoutNode.node.data.scientific_name || hoveredLayoutNode.node.data.id}
              </div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide pt-0.5">
                Record counts
              </div>
              <div className="text-muted-foreground">
                Organisms: {(hoveredLayoutNode.node.data.organisms_count ?? 0).toLocaleString()} · Assemblies: {(hoveredLayoutNode.node.data.assemblies_count ?? 0).toLocaleString()} · Annotations: {(hoveredLayoutNode.node.data.annotations_count ?? 0).toLocaleString()}
              </div>
              <div className="text-muted-foreground text-[10px] uppercase tracking-wide pt-0.5">
                Gene counts
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                <span>
                  <span className="text-muted-foreground">Coding: </span>
                  <span className="tabular-nums">{(hoveredLayoutNode.node.data.coding_count ?? 0).toLocaleString()}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Non-coding: </span>
                  <span className="tabular-nums">{(hoveredLayoutNode.node.data.non_coding_count ?? 0).toLocaleString()}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Pseudogene: </span>
                  <span className="tabular-nums">{(hoveredLayoutNode.node.data.pseudogene_count ?? 0).toLocaleString()}</span>
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="font-medium text-foreground">
                {hoveredLayoutNode.node.data.scientific_name ||
                  hoveredLayoutNode.node.data.id}
              </div>
              {hoveredLayoutNode.node.data.rank && (
                <div className="text-muted-foreground capitalize">
                  {hoveredLayoutNode.node.data.rank}
                </div>
              )}
              <div className="mt-1 pt-1 border-t border-border/50 text-muted-foreground">
                Organisms: {(hoveredLayoutNode.node.data.organisms_count ?? 0).toLocaleString()} · Assemblies: {(hoveredLayoutNode.node.data.assemblies_count ?? 0).toLocaleString()} · Annotations: {(hoveredLayoutNode.node.data.annotations_count ?? 0).toLocaleString()}
              </div>
              <div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-0.5 text-muted-foreground">
                <span>Coding: {(hoveredLayoutNode.node.data.coding_count ?? 0).toLocaleString()}</span>
                <span>Non-coding: {(hoveredLayoutNode.node.data.non_coding_count ?? 0).toLocaleString()}</span>
                <span>Pseudogene: {(hoveredLayoutNode.node.data.pseudogene_count ?? 0).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
