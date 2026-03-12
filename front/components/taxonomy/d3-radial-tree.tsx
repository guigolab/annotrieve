"use client"

import { useEffect, useState, useRef } from "react"
import * as d3 from "d3"
import { Network } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useFilteredTreeByRootAndRank } from "@/lib/stores/flattened-tree"
import { useTaxonomyGeneTypesStore } from "@/lib/stores/taxonomy-gene-types"
import { getTreeGeneColors, type TreeRankOption } from "./taxonomy-tree-controls"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { NodeClickEvent } from "./taxonomy-types"
import { TaxonomyNodeTooltip } from "./taxonomy-node-tooltip"

// 30 colors for legend/domains; exclude amber/yellow (#fbbf24, #f59e0b) so selected highlight stays distinct
const LEGEND_PALETTE_DARK = [
  "#f87171", "#38bdf8", "#a3e635", "#fb923c", "#c084fc", "#22d3ee", "#f472b6", "#4ade80", "#a8a29e",
  "#f43f5e", "#0ea5e9", "#65a30d", "#ea580c", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#64748b",
  "#dc2626", "#2563eb", "#4d7c0f", "#c2410c", "#6d28d9", "#0e7490", "#be185d", "#15803d", "#475569",
  "#b91c1c", "#1d4ed8", "#3f6212",
]
const LEGEND_PALETTE_LIGHT = [
  "#ef4444", "#0ea5e9", "#84cc16", "#f97316", "#a855f7", "#06b6d4", "#ec4899", "#22c55e", "#78716c",
  "#e11d48", "#0284c7", "#65a30d", "#ea580c", "#7c3aed", "#0891b2", "#db2777", "#16a34a", "#64748b",
  "#b91c1c", "#2563eb", "#4d7c0f", "#c2410c", "#6d28d9", "#0e7490", "#be185d", "#15803d", "#475569",
  "#991b1b", "#1d4ed8", "#3f6212",
]

interface D3RadialTreeProps {
  rootTaxid?: string | null
  highlightTaxid?: string | null
  onNodeClick?: (event: NodeClickEvent) => void
  /** @deprecated use onNodeClick */
  onTaxonSelect?: (taxid: string, taxon: FlatTreeNode) => void
  controlledRank?: TreeRankOption | null
  controlledShowLabels?: boolean
}

export function D3RadialTree({
  rootTaxid = null,
  highlightTaxid = null,
  onNodeClick,
  onTaxonSelect,
  controlledRank,
  controlledShowLabels,
}: D3RadialTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<d3.HierarchyNode<FlatTreeNode> | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const selectedRank: TreeRankOption =
    controlledRank === undefined || controlledRank === null ? "all" : controlledRank
  const showLabels = controlledShowLabels ?? false
  const selectedGeneTypes = useTaxonomyGeneTypesStore((s) => s.selectedGeneTypes)
  const [animationProgress, setAnimationProgress] = useState(1)
  const previousGeneTypesRef = useRef<Set<"coding" | "non_coding" | "pseudogene">>(
    new Set(["coding", "non_coding", "pseudogene"])
  )
  const animationFrameRef = useRef<number | null>(null)
  const hoveredNodeRef = useRef<d3.HierarchyNode<FlatTreeNode> | null>(null)
  const nodesArrayRef = useRef<
    Array<{
      node: d3.HierarchyNode<FlatTreeNode>
      barBounds: {
        innerRadius: number
        outerRadius: number
        startAngle: number
        endAngle: number
      }
    }>
  >([])
  const labelsArrayRef = useRef<
    Array<{
      node: d3.HierarchyNode<FlatTreeNode>
      x: number
      y: number
      text: string
      angle: number
      radius: number
    }>
  >([])
  const previousRankLayoutRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const previousRankRef = useRef<string | null>(null)
  const rankTransitionProgressRef = useRef(1)
  const rankAnimationFrameRef = useRef<number | null>(null)
  const previousRootRef = useRef<string | null>(null)
  const previousRootTreeRef = useRef<d3.HierarchyNode<FlatTreeNode> | null>(null)
  const rootTransitionProgressRef = useRef(1)
  const rootTransitionFrameRef = useRef<number | null>(null)
  const initialDrawProgressRef = useRef(0)
  const initialDrawFrameRef = useRef<number | null>(null)
  const drawRef = useRef<(() => void) | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"
  const geneColors = getTreeGeneColors(isDark)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setContainerSize({ width, height })
      }
    })
    ro.observe(el)
    setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const {
    isLoading: loading,
    error,
    fetchFlattenedTree,
  } = useFlattenedTreeStore()

  const rankForFilter: string | null = selectedRank === "all" ? null : selectedRank
  const filteredTree = useFilteredTreeByRootAndRank(rootTaxid, rankForFilter)

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])

  useEffect(() => {
    const typesChanged =
      selectedGeneTypes.size !== previousGeneTypesRef.current.size ||
      Array.from(selectedGeneTypes).some((type) => !previousGeneTypesRef.current.has(type)) ||
      Array.from(previousGeneTypesRef.current).some((type) => !selectedGeneTypes.has(type))

    if (typesChanged) {
      setAnimationProgress(0)
      const startTime = performance.now()
      const duration = 300

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased =
          progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
        setAnimationProgress(eased)
        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate)
        } else {
          animationFrameRef.current = null
          setAnimationProgress(1)
          previousGeneTypesRef.current = new Set(selectedGeneTypes)
        }
      }
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [selectedGeneTypes])

  useEffect(() => {
    fetchFlattenedTree()
  }, [fetchFlattenedTree])

  useEffect(() => {
    if (!filteredTree || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const root = filteredTree
    const width = containerSize.width || container.clientWidth || 600
    const availHeight = containerSize.height || container.clientHeight || 600
    const height = Math.min(width, Math.max(availHeight, 520), 1150)
    const outerRadius = height / 2
    const innerRadius = outerRadius - 140

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const domainChildren = root.children ?? []
    const domainTaxids = domainChildren.map((c) => c.data.id)
    const domainPalette = isDark ? LEGEND_PALETTE_DARK : LEGEND_PALETTE_LIGHT

    const color = d3.scaleOrdinal<string>().domain(domainTaxids).range(domainPalette)

    const cluster = d3
      .cluster<FlatTreeNode>()
      .size([360, innerRadius])
      .separation(() => 1)
    cluster(root)

    const getDomainTaxidForNode = (d: d3.HierarchyNode<FlatTreeNode>): string | null => {
      if (d === root) return null
      let current: d3.HierarchyNode<FlatTreeNode> | undefined = d
      while (current?.parent && current.parent !== root) {
        current = current.parent
      }
      return current?.parent === root ? current.data.id : null
    }

    const setColor = (d: d3.HierarchyNode<FlatTreeNode>) => {
      const domainTaxid = getDomainTaxidForNode(d)
      ;(d as unknown as { color: string | null }).color = domainTaxid
        ? color(domainTaxid)
        : (d.parent ? (d.parent as unknown as { color: string }).color : null)
      if (d.children) {
        d.children.forEach(setColor)
      }
    }
    setColor(root)

    const toRadians = (deg: number) => ((deg - 90) / 180) * Math.PI

    const leafNodes = root.leaves()

    const RANK_TRANSITION_MS = 350
    const ROOT_TRANSITION_MS = 550
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const getInterp = (node: d3.HierarchyNode<FlatTreeNode>, useInterp: boolean) => {
      if (!useInterp) {
        const currX = node.x ?? 0
        const currY = node.y ?? innerRadius
        return { x: currX, y: currY }
      }
      const progress = rankTransitionProgressRef.current
      const prev = previousRankLayoutRef.current.get(node.data.id)
      const currX = node.x ?? 0
      const currY = node.y ?? innerRadius
      if (prev !== undefined) {
        return {
          x: prev.x + (currX - prev.x) * progress,
          y: prev.y + (currY - prev.y) * progress,
        }
      }
      return {
        x: currX,
        y: innerRadius + (currY - innerRadius) * progress,
      }
    }

    const getTotalForSelectedTypes = (node: d3.HierarchyNode<FlatTreeNode>) => {
      let total = 0
      if (selectedGeneTypes.has("coding")) total += node.data.coding_count || 0
      if (selectedGeneTypes.has("non_coding")) total += node.data.non_coding_count || 0
      if (selectedGeneTypes.has("pseudogene")) total += node.data.pseudogene_count || 0
      return total
    }

    const getPreviousTotalForSelectedTypes = (node: d3.HierarchyNode<FlatTreeNode>) => {
      let total = 0
      if (previousGeneTypesRef.current.has("coding")) total += node.data.coding_count || 0
      if (previousGeneTypesRef.current.has("non_coding"))
        total += node.data.non_coding_count || 0
      if (previousGeneTypesRef.current.has("pseudogene"))
        total += node.data.pseudogene_count || 0
      return total
    }

    const maxTotalGenes = Math.max(
      1,
      d3.max(leafNodes, (d) => getTotalForSelectedTypes(d)) || 1
    )
    const maxPreviousGenes = Math.max(
      1,
      d3.max(leafNodes, (d) => getPreviousTotalForSelectedTypes(d)) || 1
    )
    const animatedMaxGenes =
      maxPreviousGenes + (maxTotalGenes - maxPreviousGenes) * animationProgress

    const BAR_MAX_RADIUS = 50
    const BAR_GAP = 4
    const LABEL_SPACING = 5
    const nodeGeneColors = getTreeGeneColors(isDark)

    const drawTreeLayer = (
      treeRoot: d3.HierarchyNode<FlatTreeNode>,
      useRankInterp: boolean,
      opts: {
        drawLegend: boolean
        alpha: number
        radialScale?: number
      }
    ): {
      nodesArray: Array<{
        node: d3.HierarchyNode<FlatTreeNode>
        barBounds: {
          innerRadius: number
          outerRadius: number
          startAngle: number
          endAngle: number
        }
      }>;
      labelsArray: Array<{
        node: d3.HierarchyNode<FlatTreeNode>
        x: number
        y: number
        text: string
        angle: number
        radius: number
      }>
    } => {
      const radialScale = opts.radialScale ?? 1
      const MIN_RADIUS = 1
      const scaledR = (r: number) =>
        Math.max(MIN_RADIUS, innerRadius + (r - innerRadius) * radialScale)
      const treeLinks = treeRoot.links()
      const treeLeafLinks = treeLinks.filter((d) => !d.target.children)
      const treeLeafNodes = treeRoot.leaves()
      const treeDomainChildren = treeRoot.children ?? []
      const treeDomainTaxids = treeDomainChildren.map((c) => c.data.id)
      const treeColor = d3.scaleOrdinal<string>().domain(treeDomainTaxids).range(domainPalette)
      const getDomainForNode = (d: d3.HierarchyNode<FlatTreeNode>) => {
        if (d === treeRoot) return null
        let cur: d3.HierarchyNode<FlatTreeNode> | undefined = d
        while (cur?.parent && cur.parent !== treeRoot) cur = cur.parent
        return cur?.parent === treeRoot ? cur.data.id : null
      }
      treeRoot.each((d) => {
        const domainTaxid = getDomainForNode(d)
        ;(d as unknown as { color: string | null }).color = domainTaxid
          ? treeColor(domainTaxid)
          : (d.parent ? (d.parent as unknown as { color: string }).color : null)
      })

      const treeNodesArray: Array<{
        node: d3.HierarchyNode<FlatTreeNode>
        barBounds: {
          innerRadius: number
          outerRadius: number
          startAngle: number
          endAngle: number
        }
      }> = []
      const treeLabelsArray: Array<{
        node: d3.HierarchyNode<FlatTreeNode>
        x: number
        y: number
        text: string
        angle: number
        radius: number
      }> = []

      // Use a single angular width for all leaf bars so they look uniform
      const leafCount = treeLeafNodes.length
      const constantAngularWidth = Math.min(
        (2 * Math.PI / leafCount) * 0.85,
        Math.PI / 90 // cap at 2° when there are few leaves
      )
      const halfAngularWidth = constantAngularWidth / 2

      treeLeafNodes.forEach((node) => {
        const total = getTotalForSelectedTypes(node)
        if (total === 0) return
        const pos = getInterp(node, useRankInterp)
        const branchEndRadius = scaledR(pos.y)
        const angleDegrees = pos.x
        const nodeAngle = toRadians(angleDegrees)
        const text = node.data.scientific_name.replace(/_/g, " ")
        const scale = total / animatedMaxGenes
        const barRadialLength = scale * BAR_MAX_RADIUS
        const barInnerRadius = branchEndRadius + BAR_GAP
        const barOuterRadius = barInnerRadius + barRadialLength
        const startAngle = nodeAngle - halfAngularWidth
        const endAngle = nodeAngle + halfAngularWidth
        treeNodesArray.push({
          node,
          barBounds: {
            innerRadius: barInnerRadius,
            outerRadius: barOuterRadius,
            startAngle,
            endAngle,
          },
        })
        const labelRadius = barOuterRadius + LABEL_SPACING
        treeLabelsArray.push({
          node,
          x: labelRadius * Math.cos(nodeAngle),
          y: labelRadius * Math.sin(nodeAngle),
          text,
          angle: nodeAngle,
          radius: labelRadius,
        })
      })

      const hovered = hoveredNodeRef.current
      let pathSource: d3.HierarchyNode<FlatTreeNode> | null = hovered
      if (!pathSource && highlightTaxid) {
        let found: d3.HierarchyNode<FlatTreeNode> | null = null
        treeRoot.each((n) => {
          if (n.data.id === highlightTaxid) found = n
        })
        pathSource = found
      }
      const highlightedPath: d3.HierarchyNode<FlatTreeNode>[] = []
      if (pathSource) {
        let cur: d3.HierarchyNode<FlatTreeNode> | null = pathSource
        while (cur) {
          highlightedPath.push(cur)
          cur = cur.parent
        }
      }
      const highlightedIds = new Set(highlightedPath.map((n) => n.data.id))

      ctx.globalAlpha = opts.alpha

      treeLeafLinks.forEach((link) => {
        const target = link.target
        const tPos = getInterp(target, useRankInterp)
        const angle = toRadians(tPos.x)
        const startRadius = scaledR(tPos.y)
        const nodeBarData = treeNodesArray.find((n) => n.node.data.id === target.data.id)
        const endRadius = nodeBarData
          ? nodeBarData.barBounds.outerRadius + LABEL_SPACING
          : innerRadius
        const sx = startRadius * Math.cos(angle)
        const sy = startRadius * Math.sin(angle)
        const ex = endRadius * Math.cos(angle)
        const ey = endRadius * Math.sin(angle)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = isDark ? "#64748b" : "#cbd5e1"
        ctx.globalAlpha = (highlightedIds.has(target.data.id) ? 0.6 : 0.25) * opts.alpha
        ctx.lineWidth = 1
        ctx.stroke()
      })
      ctx.globalAlpha = opts.alpha

      treeLinks.forEach((link) => {
        const source = link.source
        const target = link.target
        const sPos = getInterp(source, useRankInterp)
        const tPos = getInterp(target, useRankInterp)
        const startAngle = toRadians(sPos.x)
        const endAngle = toRadians(tPos.x)
        const startRadius = scaledR(sPos.y)
        const endRadius = scaledR(tPos.y)
        const sx = startRadius * Math.cos(startAngle)
        const sy = startRadius * Math.sin(startAngle)
        const ex = endRadius * Math.cos(endAngle)
        const ey = endRadius * Math.sin(endAngle)
        const isHighlighted =
          highlightedIds.has(source.data.id) && highlightedIds.has(target.data.id)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        if (endAngle !== startAngle)
          ctx.arc(0, 0, startRadius, startAngle, endAngle, endAngle < startAngle)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = isHighlighted
          ? isDark
            ? "#fbbf24"
            : "#f59e0b"
          : ((target as unknown as { color: string }).color ||
            (isDark ? "#64748b" : "#475569"))
        ctx.lineWidth = isHighlighted ? 2 : 1.5
        ctx.globalAlpha = opts.alpha
        ctx.stroke()
      })
      ctx.globalAlpha = opts.alpha

      treeNodesArray.forEach(({ node, barBounds }) => {
        const {
          innerRadius: barInnerRadius,
          outerRadius: barOuterRadius,
          startAngle,
          endAngle,
        } = barBounds
        const allSegments = [
          {
            type: "coding" as const,
            value: node.data.coding_count || 0,
            color: nodeGeneColors.coding,
          },
          {
            type: "non_coding" as const,
            value: node.data.non_coding_count || 0,
            color: nodeGeneColors.non_coding,
          },
          {
            type: "pseudogene" as const,
            value: node.data.pseudogene_count || 0,
            color: nodeGeneColors.pseudogene,
          },
        ]
        const visibleSegments = allSegments.filter(
          (s) => s.value > 0 && selectedGeneTypes.has(s.type)
        )
        if (visibleSegments.length === 0) return
        const totalVisibleGenes = visibleSegments.reduce((sum, s) => sum + s.value, 0)
        const targetBarLength =
          animatedMaxGenes > 0 ? (totalVisibleGenes / animatedMaxGenes) * BAR_MAX_RADIUS : 0
        const animatedBarOuterRadius = barInnerRadius + targetBarLength
        const isHovered =
          hovered?.data.id === node.data.id ||
          (highlightTaxid != null && node.data.id === highlightTaxid)
        let currentInnerRadius = barInnerRadius
        visibleSegments.forEach((segment) => {
          const segmentProportion =
            totalVisibleGenes > 0 ? segment.value / totalVisibleGenes : 0
          const barLength = animatedBarOuterRadius - barInnerRadius
          const segmentRadialLength = segmentProportion * barLength
          const segmentOuterRadius = currentInnerRadius + segmentRadialLength
          ctx.beginPath()
          ctx.arc(0, 0, currentInnerRadius, startAngle, endAngle)
          ctx.arc(0, 0, segmentOuterRadius, endAngle, startAngle, true)
          ctx.closePath()
          ctx.fillStyle = segment.color
          ctx.globalAlpha = (isHovered ? 0.9 : 0.7) * opts.alpha
          ctx.fill()
          ctx.strokeStyle = isHovered
            ? isDark
              ? "#fbbf24"
              : "#f59e0b"
            : isDark
              ? "#1e293b"
              : "#f1f5f9"
          ctx.lineWidth = isHovered ? 2 : 0.5
          ctx.globalAlpha = opts.alpha
          ctx.stroke()
          currentInnerRadius = segmentOuterRadius
        })
      })
      ctx.globalAlpha = opts.alpha

      if (showLabels) {
        ctx.font = "10px system-ui, -apple-system, sans-serif"
        ctx.fillStyle = isDark ? "#e2e8f0" : "#1e293b"
        treeLabelsArray.forEach(({ node, text, angle, radius }) => {
          const isHovered =
            hovered?.data.id === node.data.id ||
            (highlightTaxid != null && node.data.id === highlightTaxid)
          const angleDegrees = ((angle + Math.PI / 2) * 180) / Math.PI
          const normalizedAngleDegrees = ((angleDegrees % 360) + 360) % 360
          ctx.save()
          ctx.rotate(angle)
          ctx.translate(radius, 0)
          if (normalizedAngleDegrees > 180) {
            ctx.rotate(Math.PI)
            ctx.textAlign = "end"
          } else {
            ctx.textAlign = "start"
          }
          ctx.textBaseline = "middle"
          ctx.fillStyle = (isHovered
            ? isDark
              ? "#fbbf24"
              : "#f59e0b"
            : isDark
              ? "#e2e8f0"
              : "#1e293b") as string
          ctx.font = isHovered
            ? "bold 10px system-ui, -apple-system, sans-serif"
            : "10px system-ui, -apple-system, sans-serif"
          ctx.fillText(text, 0, 0)
          ctx.restore()
        })
      }
      ctx.globalAlpha = opts.alpha

      if (opts.drawLegend && treeDomainTaxids.length > 0) {
        const legendItems = treeDomainChildren.map((child) => ({
          name: child.data.scientific_name.replace(/_/g, " "),
          color: treeColor(child.data.id),
        }))
        const ROWS_PER_COLUMN = 15
        const ROW_HEIGHT = 20
        const COLUMN_WIDTH = 110
        const TITLE_HEIGHT = 28
        const numRows = Math.min(legendItems.length, ROWS_PER_COLUMN)
        const totalHeight = TITLE_HEIGHT + numRows * ROW_HEIGHT
        const rootName = treeRoot.data.scientific_name?.replace(/_/g, " ") ?? "selected taxon"
        ctx.save()
        ctx.translate(-width / 2 + 20, height / 2 - 20 - totalHeight)
        ctx.font = "bold 13px system-ui, -apple-system, sans-serif"
        ctx.textAlign = "left"
        ctx.textBaseline = "top"
        ctx.fillStyle = (isDark ? "#e2e8f0" : "#1e293b") as string
        ctx.fillText(`Children of ${rootName}`, 0, 0)
        ctx.font = "12px system-ui, -apple-system, sans-serif"
        ctx.textBaseline = "middle"
        legendItems.forEach((item, i) => {
          const col = Math.floor(i / ROWS_PER_COLUMN)
          const row = i % ROWS_PER_COLUMN
          const x = col * COLUMN_WIDTH
          const y = TITLE_HEIGHT + row * ROW_HEIGHT
          ctx.beginPath()
          ctx.arc(x + 8, y, 6, 0, 2 * Math.PI)
          ctx.fillStyle = item.color
          ctx.fill()
          ctx.fillStyle = (isDark ? "#e2e8f0" : "#1e293b") as string
          ctx.fillText(item.name, x + 20, y)
        })
        ctx.restore()
      }
      ctx.globalAlpha = 1
      return { nodesArray: treeNodesArray, labelsArray: treeLabelsArray }
    }

    const draw = () => {
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.translate(width / 2, height / 2)

      const rootT = rootTransitionProgressRef.current
      const prevRoot = previousRootTreeRef.current
      const doingRootTransition = rootT < 1 && prevRoot != null
      const initialT = initialDrawProgressRef.current
      const doingInitialDraw = !doingRootTransition && initialT < 1

      if (doingRootTransition) {
        const half = 0.5
        const oldScale = rootT < half ? 1 - rootT / half : 0
        const newScale = rootT < half ? 0 : (rootT - half) / half
        if (oldScale > 0.001) {
          drawTreeLayer(prevRoot, false, {
            drawLegend: false,
            alpha: 1,
            radialScale: oldScale,
          })
        }
        const curr = drawTreeLayer(root, true, {
          drawLegend: true,
          alpha: 1,
          radialScale: newScale,
        })
        nodesArrayRef.current = curr.nodesArray
        labelsArrayRef.current = curr.labelsArray
      } else if (doingInitialDraw) {
        const curr = drawTreeLayer(root, true, {
          drawLegend: true,
          alpha: 1,
          radialScale: initialT,
        })
        nodesArrayRef.current = curr.nodesArray
        labelsArrayRef.current = curr.labelsArray
      } else {
        const curr = drawTreeLayer(root, true, { drawLegend: true, alpha: 1 })
        nodesArrayRef.current = curr.nodesArray
        labelsArrayRef.current = curr.labelsArray
      }

      ctx.restore()
    }

    drawRef.current = draw

    const rankChanged = previousRankRef.current !== rankForFilter
    const rootChanged = rootTaxid !== previousRootRef.current

    if (rankChanged && previousRankLayoutRef.current.size > 0) {
      rankTransitionProgressRef.current = 0
      const startTime = performance.now()
      const runRankTransition = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / RANK_TRANSITION_MS, 1)
        rankTransitionProgressRef.current = easeInOutCubic(progress)
        drawRef.current?.()
        if (progress < 1) {
          rankAnimationFrameRef.current = requestAnimationFrame(runRankTransition)
        } else {
          rankAnimationFrameRef.current = null
          previousRankLayoutRef.current = new Map()
          root.each((n) =>
            previousRankLayoutRef.current.set(n.data.id, {
              x: n.x ?? 0,
              y: n.y ?? innerRadius,
            })
          )
          previousRankRef.current = rankForFilter
        }
      }
      rankAnimationFrameRef.current = requestAnimationFrame(runRankTransition)
    } else {
      if (rankChanged) previousRankRef.current = rankForFilter
      rankTransitionProgressRef.current = 1
      previousRankLayoutRef.current = new Map()
      root.each((n) =>
        previousRankLayoutRef.current.set(n.data.id, {
          x: n.x ?? 0,
          y: n.y ?? innerRadius,
        })
      )
    }

    if (rootChanged && previousRootTreeRef.current != null) {
      rootTransitionProgressRef.current = 0
      const startTime = performance.now()
      const runRootTransition = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / ROOT_TRANSITION_MS, 1)
        rootTransitionProgressRef.current = easeInOutCubic(progress)
        drawRef.current?.()
        if (progress < 1) {
          rootTransitionFrameRef.current = requestAnimationFrame(runRootTransition)
        } else {
          rootTransitionFrameRef.current = null
          rootTransitionProgressRef.current = 1
          previousRootRef.current = rootTaxid
          previousRootTreeRef.current = root
        }
      }
      rootTransitionFrameRef.current = requestAnimationFrame(runRootTransition)
    } else {
      if (rootChanged) {
        previousRootRef.current = rootTaxid
        previousRootTreeRef.current = root
      }
      rootTransitionProgressRef.current = 1
    }

    if (
      !(rootTransitionProgressRef.current < 1 && previousRootTreeRef.current != null) &&
      initialDrawProgressRef.current < 1 &&
      initialDrawFrameRef.current === null
    ) {
      initialDrawProgressRef.current = 0
      const startTime = performance.now()
      const runInitialDraw = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / ROOT_TRANSITION_MS, 1)
        initialDrawProgressRef.current = easeInOutCubic(progress)
        drawRef.current?.()
        if (progress < 1) {
          initialDrawFrameRef.current = requestAnimationFrame(runInitialDraw)
        } else {
          initialDrawFrameRef.current = null
          initialDrawProgressRef.current = 1
        }
      }
      initialDrawFrameRef.current = requestAnimationFrame(runInitialDraw)
    }

    draw()

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      // Tooltip is a sibling of canvas inside the container; use container-relative coords so it lines up with the cursor
      const containerRect = container.getBoundingClientRect()
      const tooltipX = event.clientX - containerRect.left + container.scrollLeft
      const tooltipY = event.clientY - containerRect.top + container.scrollTop
      const canvasX = mouseX - width / 2
      const canvasY = mouseY - height / 2
      const angle = Math.atan2(canvasY, canvasX)
      const distance = Math.sqrt(canvasX * canvasX + canvasY * canvasY)
      const normalizedAngle = (angle + 2 * Math.PI) % (2 * Math.PI)

      let foundNode: d3.HierarchyNode<FlatTreeNode> | null = null
      for (const { node, barBounds } of nodesArrayRef.current) {
        const {
          innerRadius: barInnerRadius,
          outerRadius: barOuterRadius,
          startAngle,
          endAngle,
        } = barBounds
        let normStart = ((startAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        let normEnd = ((endAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        let angleInRange = false
        if (normEnd > normStart) {
          angleInRange = normalizedAngle >= normStart && normalizedAngle <= normEnd
        } else {
          angleInRange = normalizedAngle >= normStart || normalizedAngle <= normEnd
        }
        if (
          angleInRange &&
          distance >= barInnerRadius &&
          distance <= barOuterRadius
        ) {
          foundNode = node
          break
        }
      }

      if (!foundNode && showLabels) {
        let closestDist = Infinity
        for (const { node, angle, radius, text } of labelsArrayRef.current) {
          const labelX = radius * Math.cos(angle)
          const labelY = radius * Math.sin(angle)
          const dx = canvasX - labelX
          const dy = canvasY - labelY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const hitRadius = Math.max(20, text.length * 4)
          if (dist < hitRadius && dist < closestDist) {
            closestDist = dist
            foundNode = node
          }
        }
      }

      if (foundNode !== hoveredNodeRef.current) {
        hoveredNodeRef.current = foundNode
        setHoveredNode(foundNode)
        if (foundNode) {
          setTooltipPos({ x: tooltipX, y: tooltipY })
        } else {
          setTooltipPos(null)
        }
        draw()
      } else if (foundNode) {
        setTooltipPos({ x: tooltipX, y: tooltipY })
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (!hoveredNodeRef.current) return
      const nodeData = hoveredNodeRef.current.data
      if (onNodeClick) {
        onNodeClick({
          taxid: nodeData.id,
          node: nodeData,
          screenX: e.clientX,
          screenY: e.clientY,
        })
      } else if (onTaxonSelect) {
        onTaxonSelect(nodeData.id, nodeData)
      } else {
        const openRightSidebar = useUIStore.getState().openRightSidebar
        openRightSidebar("taxon-details", { taxid: nodeData.id })
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("click", handleClick)
    canvas.style.cursor = "pointer"

    return () => {
      if (rankAnimationFrameRef.current !== null) {
        cancelAnimationFrame(rankAnimationFrameRef.current)
        rankAnimationFrameRef.current = null
      }
      if (rootTransitionFrameRef.current !== null) {
        cancelAnimationFrame(rootTransitionFrameRef.current)
        rootTransitionFrameRef.current = null
      }
      if (initialDrawFrameRef.current !== null) {
        cancelAnimationFrame(initialDrawFrameRef.current)
        initialDrawFrameRef.current = null
      }
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("click", handleClick)
    }
  }, [
    filteredTree,
    isDark,
    showLabels,
    selectedGeneTypes,
    animationProgress,
    onNodeClick,
    onTaxonSelect,
    containerSize,
    highlightTaxid,
    rootTaxid,
  ])

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading tree data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center space-y-4">
          <div className="rounded-full bg-destructive/10 p-4 w-fit mx-auto">
            <Network className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Unable to load tree data</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div
        ref={containerRef}
        className="relative w-full flex-1 min-h-0 overflow-auto flex items-center justify-center"
      >
        <canvas ref={canvasRef} className="w-full h-full" />
        {hoveredNode && tooltipPos && (
          <TaxonomyNodeTooltip
            position={tooltipPos}
            payload={{
              title: hoveredNode.data.scientific_name,
              rank: hoveredNode.data.rank ?? undefined,
              organismsCount: hoveredNode.data.organisms_count ?? 0,
              assembliesCount: hoveredNode.data.assemblies_count ?? 0,
              annotationsCount: hoveredNode.data.annotations_count ?? 0,
              geneCounts: {
                coding: hoveredNode.data.coding_count ?? 0,
                non_coding: hoveredNode.data.non_coding_count ?? 0,
                pseudogene: hoveredNode.data.pseudogene_count ?? 0,
              },
              geneColors,
            }}
          />
        )}
      </div>
    </div>
  )
}
