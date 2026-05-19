"use client"

import { useEffect, useState, useRef } from "react"
import * as d3 from "d3"
import { Network } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"
import { useFlattenedTreeStore, useFilteredTreeByRootAndRank } from "@/lib/stores/flattened-tree"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { NodeClickEvent } from "./taxonomy-types"
import { getTreeGeneColors, getTreeTranscriptColors, getTreeBuscoColors } from "./taxonomy-tree-controls"
import { TaxonomyNodeTooltip } from "./taxonomy-node-tooltip"

interface D3CirclePackProps {
  rootTaxid?: string | null
  highlightTaxid?: string | null
  /** Currently selected taxon id — receives a selection ring on canvas */
  selectedTaxid?: string | null
  onNodeClick?: (event: NodeClickEvent) => void
  /** @deprecated use onNodeClick instead */
  onTaxonSelect?: (taxid: string, taxon: FlatTreeNode) => void
  /** When set, filters tree by rank (same as rank slider). */
  controlledRank?: string | null
}

export function D3CirclePack({
  rootTaxid = null,
  highlightTaxid = null,
  selectedTaxid = null,
  onNodeClick,
  onTaxonSelect,
  controlledRank,
}: D3CirclePackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<any>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
  const hoveredNodeRef = useRef<any>(null)
  const drawFunctionRef = useRef<((transform: d3.ZoomTransform) => void) | null>(null)
  const drawOrderProgressRef = useRef(1)
  const drawOrderFrameRef = useRef<number | null>(null)
  /** Avoid restarting the draw-order animation when the effect re-runs for the same logical tree (e.g. Strict Mode or tree reference churn). */
  const lastAnimatedTreeKeyRef = useRef<string | null>(null)
  const selectedTaxidRef = useRef<string | null>(selectedTaxid)
  selectedTaxidRef.current = selectedTaxid
  const highlightTaxidRef = useRef<string | null>(highlightTaxid ?? null)
  highlightTaxidRef.current = highlightTaxid ?? null
  const onNodeClickRef = useRef(onNodeClick)
  const onTaxonSelectRef = useRef(onTaxonSelect)
  onNodeClickRef.current = onNodeClick
  onTaxonSelectRef.current = onTaxonSelect

  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"

  const { isLoading: loading, error } = useFlattenedTreeStore()
  const treeStructure = useFilteredTreeByRootAndRank(rootTaxid, controlledRank ?? null)

  useEffect(() => {
    hoveredNodeRef.current = hoveredNode
  }, [hoveredNode])

  useEffect(() => {
    if (!treeStructure || !canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = container.clientWidth
    const height = Math.max(container.clientHeight, 400)

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const packLayout = d3.pack<FlatTreeNode>()
      .size([width - 40, height - 40])
      .padding(3)

    treeStructure.sum((d: any) => Math.max(d.annotations_count || 0, 1))
    const packNodes = packLayout(treeStructure)
    const allNodes = packNodes.descendants()

    const treeKey = `${rootTaxid ?? "full"}-${controlledRank ?? "all"}-${treeStructure.data?.id ?? "root"}-${allNodes.length}`
    const isSameTreeAsLastRun = lastAnimatedTreeKeyRef.current === treeKey
    if (isSameTreeAsLastRun) {
      drawOrderProgressRef.current = 1
    } else {
      lastAnimatedTreeKeyRef.current = treeKey
      drawOrderProgressRef.current = 0
    }

    const parentColor = isDark ? "#818cf8" : "#334155"
    const leafColor   = isDark ? "#34d399" : "#0f172a"
    const textColor   = "#ffffff"
    const hoverColor  = isDark ? "#fbbf24" : "#f59e0b"
    const strokeColor = isDark ? "#64748b" : "#cbd5e1"

    const nodesArray = allNodes.map((d: any) => ({
      node: d,
      x: d.x,
      y: d.y,
      radius: d.r,
    }))

    const isInView = (x: number, y: number, r: number, transform: d3.ZoomTransform, margin = 50) => {
      const sx = x * transform.k + transform.x
      const sy = y * transform.k + transform.y
      const sr = r * transform.k
      return (
        sx + sr > -margin &&
        sx - sr < width + margin &&
        sy + sr > -margin &&
        sy - sr < height + margin
      )
    }

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const draw = (transform: d3.ZoomTransform) => {
      ctx.save()
      ctx.clearRect(0, 0, width, height)
      ctx.translate(transform.x, transform.y)
      ctx.scale(transform.k, transform.k)

      // Draw largest circles first (parents before children) for correct layering
      const sortedNodes = [...nodesArray].sort((a, b) => b.radius - a.radius)
      const progress = drawOrderProgressRef.current
      const visibleCount = Math.floor(progress * sortedNodes.length)
      const nodesToDraw = sortedNodes.slice(0, visibleCount)

      for (const item of nodesToDraw) {
        const { x, y, radius } = item
        if (!isInView(x, y, radius, transform)) continue

        const d = item.node
        const isHovered =
          (hoveredNodeRef.current && hoveredNodeRef.current.data.id === d.data.id) ||
          (highlightTaxidRef.current != null && d.data.id === highlightTaxidRef.current)
        const isSelected = selectedTaxidRef.current != null && d.data.id === selectedTaxidRef.current
        const hasChildren = d.children && d.children.length > 0

        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        if (isHovered) {
          ctx.fillStyle = hoverColor
          ctx.globalAlpha = isDark ? 0.8 : 0.85
        } else if (hasChildren) {
          ctx.fillStyle = parentColor
          ctx.globalAlpha = (isDark ? 0.12 : 0.18) + (isDark ? 0.08 : 0.12) * Math.min(d.depth, 5)
        } else {
          ctx.fillStyle = leafColor
          ctx.globalAlpha = isDark ? 0.7 : 0.8
        }
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI)
        if (isHovered) {
          ctx.strokeStyle = hoverColor
          ctx.lineWidth = 2.5 / transform.k
          ctx.globalAlpha = isDark ? 0.9 : 0.95
        } else {
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = 1 / transform.k
          ctx.globalAlpha = isDark ? 0.35 : 0.5
        }
        ctx.stroke()
        ctx.globalAlpha = 1

        if (isSelected) {
          ctx.beginPath()
          ctx.arc(x, y, radius + 3 / transform.k, 0, 2 * Math.PI)
          ctx.strokeStyle = "#ffffff"
          ctx.lineWidth = 2 / transform.k
          ctx.globalAlpha = 0.9
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      // Labels rendered in screen space for crisp text at any zoom level (only for visible circles)
      if (transform.k > 0.5) {
        const labelCandidates = sortedNodes
          .slice(0, visibleCount)
          .filter((item) => item.radius * transform.k >= 20)

        const renderedLabels: Array<{ x: number; y: number; width: number; height: number }> = []

        ctx.save()
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.textBaseline = "middle"
        ctx.textAlign = "center"

        for (const item of labelCandidates) {
          const { x, y, radius } = item
          if (!isInView(x, y, radius, transform)) continue

          const d = item.node
          const screenRadius = radius * transform.k
          const screenX = x * transform.k + transform.x
          const screenY = y * transform.k + transform.y

          const name = d.data.scientific_name
          const maxChars = Math.max(8, Math.floor(screenRadius / 3.5))
          const displayName = name.length > maxChars ? name.substring(0, maxChars) + "…" : name

          const fontSize = Math.max(8, Math.min(14, screenRadius / 4.5))
          ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`

          const metrics = ctx.measureText(displayName)
          const textWidth = metrics.width
          const textHeight = fontSize

          const hasCollision = renderedLabels.some((label) => {
            const dx = Math.abs(screenX - label.x)
            const dy = Math.abs(screenY - label.y)
            return (
              dx < (textWidth + label.width) / 2 + 5 &&
              dy < (textHeight + label.height) / 2 + 5
            )
          })

          if (hasCollision) continue

          ctx.fillStyle = textColor
          ctx.fillText(displayName, screenX, screenY)
          renderedLabels.push({ x: screenX, y: screenY, width: textWidth, height: textHeight })

          if (renderedLabels.length > 100) break
        }

        ctx.restore()
      }

      ctx.restore()
    }

    drawFunctionRef.current = draw

    let animationFrameId: number | null = null
    const debouncedDraw = (transform: d3.ZoomTransform) => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(() => draw(transform))
    }

    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 50])
      .on("zoom", (event) => {
        currentTransformRef.current = event.transform
        debouncedDraw(event.transform)
      })

    d3.select(canvas).call(zoom as any)

    let mouseMoveTimeout: number | null = null
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const transform = currentTransformRef.current
      const canvasX = (mouseX - transform.x) / transform.k
      const canvasY = (mouseY - transform.y) / transform.k

      if (mouseMoveTimeout) return
      mouseMoveTimeout = window.setTimeout(() => {
        mouseMoveTimeout = null

        // Find the smallest circle under the cursor (most specific hit)
        let found = null
        let smallestRadius = Infinity
        for (const item of nodesArray) {
          const dx = canvasX - item.x
          const dy = canvasY - item.y
          if (Math.sqrt(dx * dx + dy * dy) <= item.radius && item.radius < smallestRadius) {
            found = item.node
            smallestRadius = item.radius
          }
        }

        const currentHovered = hoveredNodeRef.current
        if (found !== currentHovered) {
          hoveredNodeRef.current = found
          setHoveredNode(found)
          setTooltipPos(found ? { x: event.clientX, y: event.clientY } : null)
          debouncedDraw(transform)
        } else if (found) {
          setTooltipPos({ x: event.clientX, y: event.clientY })
        }

        canvas.style.cursor = found ? "pointer" : "default"
      }, 16) // ~60 fps
    }

    const handleClick = () => {
      const currentHovered = hoveredNodeRef.current
      if (!currentHovered) return

      const rect = canvas.getBoundingClientRect()
      const transform = currentTransformRef.current
      const screenX = currentHovered.x * transform.k + transform.x + rect.left
      const screenY = currentHovered.y * transform.k + transform.y + rect.top

      if (onNodeClickRef.current) {
        onNodeClickRef.current({ taxid: currentHovered.data.id, node: currentHovered.data, screenX, screenY })
      } else if (onTaxonSelectRef.current) {
        onTaxonSelectRef.current(currentHovered.data.id, currentHovered.data)
      }
    }

    const handleMouseLeave = () => {
      if (mouseMoveTimeout) {
        clearTimeout(mouseMoveTimeout)
        mouseMoveTimeout = null
      }
      if (hoveredNodeRef.current) {
        hoveredNodeRef.current = null
        setHoveredNode(null)
        setTooltipPos(null)
        debouncedDraw(currentTransformRef.current)
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("click", handleClick)
    canvas.addEventListener("mouseleave", handleMouseLeave)

    d3.select(canvas).call(zoom.transform as any, d3.zoomIdentity.translate(20, 20))

    const DRAW_ORDER_MS = 550
    if (!isSameTreeAsLastRun) {
      const startTime = performance.now()
      const runDrawOrderTransition = (time: number) => {
        const elapsed = time - startTime
        const progress = Math.min(elapsed / DRAW_ORDER_MS, 1)
        drawOrderProgressRef.current = easeInOutCubic(progress)
        drawFunctionRef.current?.(currentTransformRef.current)
        if (progress < 1) {
          drawOrderFrameRef.current = requestAnimationFrame(runDrawOrderTransition)
        } else {
          drawOrderFrameRef.current = null
          drawOrderProgressRef.current = 1
        }
      }
      drawOrderFrameRef.current = requestAnimationFrame(runDrawOrderTransition)
    } else {
      drawFunctionRef.current?.(currentTransformRef.current)
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      if (drawOrderFrameRef.current) {
        cancelAnimationFrame(drawOrderFrameRef.current)
        drawOrderFrameRef.current = null
      }
      if (mouseMoveTimeout) clearTimeout(mouseMoveTimeout)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("click", handleClick)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
    }
  }, [treeStructure, isDark])

  useEffect(() => {
    if (drawFunctionRef.current) {
      drawFunctionRef.current(currentTransformRef.current)
    }
  }, [selectedTaxid, highlightTaxid])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading tree data…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex items-center justify-center py-16">
        <div className="text-center space-y-4">
          <div className="rounded-full bg-destructive/10 px-4 py-4 w-fit mx-auto">
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
    <div ref={containerRef} className="relative w-full h-full min-h-0 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {hoveredNode && tooltipPos && (
        <TaxonomyNodeTooltip
          position={tooltipPos}
          payload={{
            title: hoveredNode.data.scientific_name,
            rank: hoveredNode.data.rank ?? undefined,
            organismsCount: hoveredNode.data.organisms_count,
            assembliesCount: hoveredNode.data.assemblies_count,
            annotationsCount: hoveredNode.data.annotations_count,
            geneCounts: {
              coding: hoveredNode.data.coding_count ?? 0,
              non_coding: hoveredNode.data.non_coding_count ?? 0,
              pseudogene: hoveredNode.data.pseudogene_count ?? 0,
            },
            geneColors: getTreeGeneColors(isDark),
            transcriptCounts: {
              mRNA: hoveredNode.data.mrna_count ?? 0,
              lncRNA: hoveredNode.data.lncrna_count ?? 0,
              tRNA: hoveredNode.data.trna_count ?? 0,
              miRNA: hoveredNode.data.mirna_count ?? 0,
            },
            transcriptColors: getTreeTranscriptColors(isDark),
            buscoCounts: {
              single_copy: hoveredNode.data.busco_single_copy_mean ?? 0,
              duplicated: hoveredNode.data.busco_duplicated_mean ?? 0,
              fragmented: hoveredNode.data.busco_fragmented_mean ?? 0,
              missing: hoveredNode.data.busco_missing_mean ?? 0,
            },
            buscoColors: getTreeBuscoColors(isDark),
          }}
        />
      )}
    </div>
  )
}
