'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { getTaxon, getTaxonChildren } from '@/lib/api/taxons'
import type { TaxonRecord } from '@/lib/api/types'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TreeNode {
  taxid: string
  data: TaxonRecord
  children: TreeNode[]
  level: number
}

interface CompactTaxonomicTreeProps {
  rootTaxid?: string
  rankRoots?: TaxonRecord[] // Multiple roots when rank is selected
  selectedTaxons: TaxonRecord[]
  onTaxonToggle: (taxon: TaxonRecord) => void
  maxHeight?: string
  loadingRankRoots?: boolean
  hasMoreRankRoots?: boolean
  onLoadMore?: () => void
}

function useTaxon(taxid: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['taxon', taxid],
    queryFn: () => getTaxon(taxid),
    staleTime: 5 * 60 * 1000,
    enabled: enabled && !!taxid,
  })
}

export function CompactTaxonomicTree({
  rootTaxid = '2759',
  rankRoots,
  selectedTaxons,
  onTaxonToggle,
  maxHeight = '400px',
  loadingRankRoots = false,
  hasMoreRankRoots = false,
  onLoadMore,
}: CompactTaxonomicTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [childrenData, setChildrenData] = useState<Map<string, TaxonRecord[]>>(new Map())
  const [fetchingNodes, setFetchingNodes] = useState<Set<string>>(new Set())
  const fetchedNodesRef = useRef<Set<string>>(new Set())
  const loadMoreObserverRef = useRef<HTMLDivElement>(null)

  // Use rank roots if provided, otherwise use single root
  const useRankRoots = rankRoots && rankRoots.length > 0
  const { data: rootNode, isLoading: isLoadingRoot } = useTaxon(rootTaxid, !useRankRoots)

  // Initialize root node as expanded (only for single root, not for rank roots)
  useEffect(() => {
    if (useRankRoots) {
      // Don't auto-expand rank roots - let users expand manually
      return
    } else if (rootNode) {
      setExpandedNodes((prev) => new Set([...prev, rootTaxid]))
    }
  }, [rootNode, rootTaxid, useRankRoots])

  // Fetch children for expanded nodes
  useEffect(() => {
    const expandedTaxids = Array.from(expandedNodes)
    const taxidsToFetch: string[] = []

    for (const taxid of expandedTaxids) {
      if (fetchedNodesRef.current.has(taxid)) continue
      const existingChildren = childrenData.get(taxid)
      if (existingChildren && existingChildren.length > 0) {
        fetchedNodesRef.current.add(taxid)
        continue
      }
      taxidsToFetch.push(taxid)
    }

    if (taxidsToFetch.length === 0) return

    setFetchingNodes((prev) => {
      const next = new Set(prev)
      taxidsToFetch.forEach((taxid) => next.add(taxid))
      return next
    })

    const fetchPromises = taxidsToFetch.map(async (taxid) => {
      try {
        const response = await getTaxonChildren(taxid)
        const children = (response.results || []).map((child: TaxonRecord) => ({
          ...child,
          organisms_count: child.organisms_count ?? 0,
          assemblies_count: child.assemblies_count ?? 0,
          annotations_count: child.annotations_count ?? 0,
        }))
        return { taxid, children }
      } catch (error) {
        console.error(`Error fetching children for taxid ${taxid}:`, error)
        return { taxid, children: [] }
      }
    })

    Promise.all(fetchPromises).then((results) => {
      setChildrenData((prev) => {
        const updated = new Map(prev)
        results.forEach(({ taxid, children }) => {
          // Always store children array (even if empty) to mark node as fetched
          updated.set(taxid, children)
          fetchedNodesRef.current.add(taxid)
        })
        return updated
      })

      setFetchingNodes((prev) => {
        const next = new Set(prev)
        taxidsToFetch.forEach((taxid) => next.delete(taxid))
        return next
      })
    })
  }, [expandedNodes, childrenData])

  // Build tree structure
  const buildTree = useCallback(
    (taxid: string, data: TaxonRecord, level: number = 0): TreeNode => {
      const children = childrenData.get(taxid) || []
      const expanded = expandedNodes.has(taxid)

      const node: TreeNode = {
        taxid,
        data: {
          ...data,
          organisms_count: data.organisms_count ?? 0,
          assemblies_count: data.assemblies_count ?? 0,
          annotations_count: data.annotations_count ?? 0,
        },
        children: [],
        level,
      }

      if (expanded && children.length > 0) {
        node.children = children.sort((a, b) => (b.annotations_count ?? 0) - (a.annotations_count ?? 0)).map((child) => buildTree(child.taxid, child, level + 1))
      }

      return node
    },
    [childrenData, expandedNodes]
  )

  // Build trees - either multiple roots from rank or single root
  const trees = useMemo(() => {
    if (useRankRoots && rankRoots) {
      return rankRoots.map(root => buildTree(root.taxid, root, 0))
    } else if (rootNode) {
      return [buildTree(rootTaxid, rootNode, 0)]
    }
    return []
  }, [useRankRoots, rankRoots, rootNode, rootTaxid, buildTree])

  // Flatten trees for rendering
  const flattenedNodes = useMemo(() => {
    if (trees.length === 0) return []

    const nodes: TreeNode[] = []
    const stack: TreeNode[] = [...trees].reverse()

    while (stack.length > 0) {
      const node = stack.pop()!
      nodes.push(node)
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i])
      }
    }

    return nodes
  }, [trees])

  // Intersection Observer for infinite scroll (rank roots)
  useEffect(() => {
    if (!hasMoreRankRoots || !onLoadMore || !useRankRoots) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRankRoots && !loadingRankRoots && onLoadMore) {
          onLoadMore()
        }
      },
      { 
        rootMargin: '50px',
        threshold: 0.1
      }
    )

    const currentTarget = loadMoreObserverRef.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMoreRankRoots, loadingRankRoots, onLoadMore, useRankRoots])

  const handleExpand = useCallback((taxid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(taxid)) {
        next.delete(taxid)
      } else {
        next.add(taxid)
      }
      return next
    })
  }, [])

  const isTaxonSelected = useCallback(
    (taxid: string) => {
      return selectedTaxons.some((t) => t.taxid === taxid)
    },
    [selectedTaxons]
  )

  if (isLoadingRoot && !useRankRoots) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="ml-2 text-xs text-muted-foreground">Loading tree...</span>
      </div>
    )
  }

  if (trees.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No tree data available
      </div>
    )
  }

  return (
    <div className="border overflow-x-auto" style={{ maxHeight }}>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        <div className="p-1.5 space-y-0.5 min-w-max">
          {flattenedNodes.map((node) => {
            // Check if node has children
            // If we've fetched it, check the actual children array length
            // If we haven't fetched it yet, optimistically assume it might have children
            const children = childrenData.get(node.taxid)
            const hasFetched = childrenData.has(node.taxid) // If in childrenData, we've fetched it
            const hasChildren = hasFetched 
              ? (children?.length ?? 0) > 0
              : !fetchedNodesRef.current.has(node.taxid) // Optimistic: show expand if not fetched yet
            const isExpanded = expandedNodes.has(node.taxid)
            const isFetching = fetchingNodes.has(node.taxid)
            const isSelected = isTaxonSelected(node.taxid)
            const indent = node.level * 10

            return (
              <div
                key={node.taxid}
                className={cn(
                  "flex items-center gap-1 py-0.5 px-1 rounded hover:bg-muted/50 transition-colors text-xs min-h-[20px]",
                  isSelected && "bg-primary/10"
                )}
                style={{ paddingLeft: `${indent + 2}px` }}
              >
                {/* Expand button */}
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExpand(node.taxid, e)
                    }}
                    className="h-3 w-3 flex items-center justify-center shrink-0 hover:bg-muted/80 rounded transition-colors"
                    disabled={isFetching}
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isFetching ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
                    ) : isExpanded ? (
                      <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
                    )}
                  </button>
                ) : (
                  <div className="w-3 shrink-0" />
                )}

                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    onTaxonToggle(node.data)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-3 w-3"
                />

                {/* Taxon name */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onTaxonToggle(node.data)
                  }}
                  className={cn(
                    "flex-1 truncate text-xs text-left hover:underline",
                    isSelected && "font-medium"
                  )}
                  title={`${node.data.scientific_name || node.taxid} (${node.data.rank})`}
                >
                  {node.data.scientific_name || node.taxid}
                </button>

                {/* Annotation count badge (if available) */}
                {node.data.annotations_count !== undefined && node.data.annotations_count > 0 && (
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-1 font-mono">
                    {node.data.annotations_count.toLocaleString()}
                  </span>
                )}
              </div>
            )
          })}
          
          {/* Infinite scroll target for rank roots */}
          {useRankRoots && hasMoreRankRoots && (
            <div ref={loadMoreObserverRef} className="flex items-center justify-center py-2">
              {loadingRankRoots ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Loading more...</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Scroll for more</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
