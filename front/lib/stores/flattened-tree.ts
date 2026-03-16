import { create } from 'zustand'
import { useMemo } from 'react'
import { getFlattenedTree, type FlatTreeNode } from '@/lib/api/taxons'
import * as d3 from 'd3'

// Rank hierarchy for filtering (domain first for horizontal tree filter). Export for UI.
export const RANK_ORDER = ['kingdom', 'phylum', 'class', 'order', 'family', 'genus', 'species'] as const

export type RankDistributionEntry = { rank: string; count: number }

/** Index in RANK_ORDER (0 = kingdom, 1 = phylum, …). -1 if unknown. */
export function getRankIndex(rank: string | null | undefined): number {
  if (!rank) return -1
  const index = (RANK_ORDER as readonly string[]).indexOf(rank.toLowerCase())
  return index >= 0 ? index : -1
}

/** Build flat node list from hierarchy for nodes in nodesToInclude; parentId is first included ancestor. */
function buildFlatNodesFromHierarchy(
  treeRoot: d3.HierarchyNode<FlatTreeNode>,
  nodesToInclude: Set<string>
): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  treeRoot.each((node) => {
    if (!node.data || !nodesToInclude.has(node.data.id)) return
    let parentId: string | null = null
    let current = node.parent
    while (current) {
      if (current.data && nodesToInclude.has(current.data.id)) {
        parentId = current.data.id
        break
      }
      current = current.parent
    }
    result.push({
      id: node.data.id,
      parentId,
      scientific_name: node.data.scientific_name,
      annotations_count: node.data.annotations_count,
      assemblies_count: node.data.assemblies_count,
      organisms_count: node.data.organisms_count,
      rank: node.data.rank,
      coding_count: node.data.coding_count,
      non_coding_count: node.data.non_coding_count,
      pseudogene_count: node.data.pseudogene_count,
      mrna_count: node.data.mrna_count ?? 0,
      lncrna_count: node.data.lncrna_count ?? 0,
      trna_count: node.data.trna_count ?? 0,
      mirna_count: node.data.mirna_count ?? 0,
      busco_single_copy_mean: node.data.busco_single_copy_mean ?? 0,
      busco_duplicated_mean: node.data.busco_duplicated_mean ?? 0,
      busco_fragmented_mean: node.data.busco_fragmented_mean ?? 0,
      busco_missing_mean: node.data.busco_missing_mean ?? 0,
    })
  })
  return result
}

/** Rebuild hierarchy from flat node list; returns null on failure. */
function stratifyFlatNodes(flatNodes: FlatTreeNode[]): d3.HierarchyNode<FlatTreeNode> | null {
  if (flatNodes.length === 0) return null
  try {
    const stratify = d3.stratify<FlatTreeNode>().id((d) => d.id).parentId((d) => d.parentId)
    const rebuilt = stratify(flatNodes)
    return rebuilt && rebuilt.data ? rebuilt : null
  } catch {
    return null
  }
}

/** Applies rank filter to any tree root (same logic as filterTreeByRank). Returns filtered tree or original if invalid. */
function applyRankFilterToTree(
  treeRoot: d3.HierarchyNode<FlatTreeNode>,
  rank: string
): d3.HierarchyNode<FlatTreeNode> {
  const maxRankIndex = getRankIndex(rank)
  if (maxRankIndex < 0) return treeRoot

  const nodesToInclude = new Set<string>()
  if (treeRoot.data?.id) nodesToInclude.add(treeRoot.data.id)

  treeRoot.each((node) => {
    if (!node.data) return
    const nodeRank = node.data.rank
    const rankIndex = getRankIndex(nodeRank)
    if (rankIndex >= 0 && rankIndex <= maxRankIndex) nodesToInclude.add(node.data.id)
    else if (!nodeRank) nodesToInclude.add(node.data.id)
  })

  treeRoot.each((node) => {
    if (!node.data || !nodesToInclude.has(node.data.id)) return
    let current = node.parent
    while (current && current.data) {
      nodesToInclude.add(current.data.id)
      current = current.parent
    }
  })

  const filteredFlatNodes = buildFlatNodesFromHierarchy(treeRoot, nodesToInclude)
  if (filteredFlatNodes.length === 0) return treeRoot
  const rebuilt = stratifyFlatNodes(filteredFlatNodes)
  return rebuilt ?? treeRoot
}

interface FlattenedTreeState {
  // Data
  flatNodes: FlatTreeNode[]
  
  // Loading state
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchFlattenedTree: () => Promise<void>
  getTreeStructure: () => d3.HierarchyNode<FlatTreeNode> | null
  getLeafNodes: () => FlatTreeNode[]
  searchNodes: (query: string, limit?: number) => FlatTreeNode[]
  filterTreeByRank: (rank: string | null) => d3.HierarchyNode<FlatTreeNode> | null
  filterTreeByRootTaxon: (rootTaxid: string | null) => d3.HierarchyNode<FlatTreeNode> | null
  /** Tree filtered by root (when set) and by rank (when set). Use this for unified rank + root filtering. */
  getFilteredTreeByRootAndRank: (rootTaxid: string | null, rank: string | null) => d3.HierarchyNode<FlatTreeNode> | null
  /** Returns ordered list of rank counts for nodes under the given root (null = full tree). */
  getRankDistribution: (rootTaxid: string | null) => RankDistributionEntry[]
  /** Number of leaf nodes (no children) under the given root (null = full tree). */
  getLeafCountUnderRoot: (rootTaxid: string | null) => number
  /** organisms_count of the root of the tree (subtree root when rootTaxid set, else full tree). Matches selected taxon's organisms_count. */
  getRootOrganismsCount: (rootTaxid: string | null) => number
  /** For a given taxid, return the node from the tree plus its children and ancestors (from flat data). Used by details panel. */
  getTaxonContext: (taxid: string) => {
    node: FlatTreeNode | null
    children: FlatTreeNode[]
    ancestors: FlatTreeNode[]
  }
}

export const useFlattenedTreeStore = create<FlattenedTreeState>((set, get) => ({
  // Initial state
  flatNodes: [],
  isLoading: false,
  error: null,
  
  // Fetch flattened tree data
  fetchFlattenedTree: async () => {
    const state = get()
    if (state.flatNodes.length > 0) {
      // Already loaded, skip
      return
    }
    
    set({ isLoading: true, error: null })
    
    try {
      // Request TSV format for streaming; getFlattenedTree('tsv') returns FlatTreeNode[]
      const fetched = await getFlattenedTree('tsv') as FlatTreeNode[]
      
      // Find nodes without parents in the dataset
      const idsSet = new Set(fetched.map(n => n.id))
      const rootCandidates = fetched.filter(n =>
        !n.parentId || !idsSet.has(n.parentId)
      )

      let flatNodes: FlatTreeNode[]
      if (rootCandidates.length > 1) {
        // Build new array: root candidates get parentId 'root'; add synthetic root (no mutation of fetched)
        flatNodes = fetched.map(node => {
          if (!node.parentId || !idsSet.has(node.parentId)) {
            return { ...node, parentId: 'root' as string | null }
          }
          return node
        })
        flatNodes.push({
          id: 'root',
          parentId: null,
          scientific_name: 'Tree of Life',
          annotations_count: rootCandidates.reduce((sum, n) => sum + n.annotations_count, 0),
          assemblies_count: rootCandidates.reduce((sum, n) => sum + n.assemblies_count, 0),
          organisms_count: rootCandidates.reduce((sum, n) => sum + n.organisms_count, 0),
          rank: null,
          coding_count: rootCandidates.reduce((sum, n) => sum + n.coding_count, 0),
          non_coding_count: rootCandidates.reduce((sum, n) => sum + n.non_coding_count, 0),
          pseudogene_count: rootCandidates.reduce((sum, n) => sum + n.pseudogene_count, 0),
          mrna_count: rootCandidates.reduce((sum, n) => sum + (n.mrna_count ?? 0), 0),
          lncrna_count: rootCandidates.reduce((sum, n) => sum + (n.lncrna_count ?? 0), 0),
          trna_count: rootCandidates.reduce((sum, n) => sum + (n.trna_count ?? 0), 0),
          mirna_count: rootCandidates.reduce((sum, n) => sum + (n.mirna_count ?? 0), 0),
          busco_single_copy_mean: 0,
          busco_duplicated_mean: 0,
          busco_fragmented_mean: 0,
          busco_missing_mean: 0,
        })
      } else {
        flatNodes = fetched
      }

      set({
        flatNodes,
        isLoading: false,
        error: null
      })
    } catch (err) {
      console.error('Error fetching flattened tree:', err)
      set({ 
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load tree data'
      })
    }
  },
  
  // Get tree structure (computed on-demand using d3.stratify, similar to tree-of-life-d3.tsx)
  getTreeStructure: () => {
    const { flatNodes } = get()
    if (flatNodes.length === 0) return null

    // Use d3.stratify to convert flat data to hierarchy
    const stratify = d3.stratify<FlatTreeNode>()
      .id((d) => d.id)
      .parentId((d) => d.parentId)

    try {
      return stratify(flatNodes)
    } catch (err) {
      console.error('Error creating hierarchy:', err)
      return null
    }
  },
  
  // Get leaf nodes (nodes without children). Calls getTreeStructure() once and uses it for the "nodes with children" set.
  getLeafNodes: () => {
    const { flatNodes, getTreeStructure } = get()
    const treeStructure = getTreeStructure()
    if (!treeStructure) return []
    const nodesWithChildren = new Set<string>()
    treeStructure.each((node) => {
      if (node.children && node.children.length > 0) nodesWithChildren.add(node.data.id)
    })
    return flatNodes.filter((node) => !nodesWithChildren.has(node.id))
  },
  
  // Search nodes by query (name or ID)
  searchNodes: (query: string, limit: number = 10) => {
    const { flatNodes } = get()
    if (!query.trim()) return []
    
    const lowerQuery = query.toLowerCase().trim()
    return flatNodes
      .filter(node => {
        const nameMatch = node.scientific_name.toLowerCase().includes(lowerQuery)
        const idMatch = node.id.toLowerCase().includes(lowerQuery)
        return nameMatch || idMatch
      })
      .slice(0, limit)
  },
  
  // Filter tree structure by rank (returns filtered tree structure)
  filterTreeByRank: (rank: string | null) => {
    const { getTreeStructure } = get()
    const treeStructure = getTreeStructure()
    if (!treeStructure) return null

    try {
      const maxRankIndex = getRankIndex(rank)
      if (maxRankIndex < 0) return treeStructure

      const nodesToInclude = new Set<string>()
      if (treeStructure.data?.id) nodesToInclude.add(treeStructure.data.id)

      treeStructure.each((node) => {
        if (!node.data) return
        const nodeRank = node.data.rank
        const rankIndex = getRankIndex(nodeRank)
        if (rankIndex >= 0 && rankIndex <= maxRankIndex) nodesToInclude.add(node.data.id)
        else if (!nodeRank) nodesToInclude.add(node.data.id)
      })

      treeStructure.each((node) => {
        if (!node.data || !nodesToInclude.has(node.data.id)) return
        let current = node.parent
        while (current && current.data) {
          nodesToInclude.add(current.data.id)
          current = current.parent
        }
      })

      const filteredFlatNodes = buildFlatNodesFromHierarchy(treeStructure, nodesToInclude)
      if (filteredFlatNodes.length === 0) {
        console.warn('No nodes found after filtering')
        return treeStructure
      }
      const rebuilt = stratifyFlatNodes(filteredFlatNodes)
      if (!rebuilt?.data) {
        console.warn('Rebuilt root is invalid, returning original')
        return treeStructure
      }
      return rebuilt
    } catch (error) {
      console.error('Error filtering tree structure:', error)
      return treeStructure
    }
  },
  
  // Filter tree structure by root taxon (returns subtree starting from rootTaxid)
  filterTreeByRootTaxon: (rootTaxid: string | null) => {
    const { getTreeStructure } = get()
    const treeStructure = getTreeStructure()
    if (!treeStructure || !rootTaxid) return treeStructure

    try {
      let rootNode: d3.HierarchyNode<FlatTreeNode> | null = null
      treeStructure.each((node) => {
        if (node.data && node.data.id === rootTaxid) rootNode = node
      })
      if (!rootNode) {
        console.warn(`Root taxon ${rootTaxid} not found in tree`)
        return treeStructure
      }

      const subtreeRoot: d3.HierarchyNode<FlatTreeNode> = rootNode
      const nodesToInclude = new Set<string>()
      subtreeRoot.each((node) => {
        if (node.data) nodesToInclude.add(node.data.id)
      })
      const filteredFlatNodes = buildFlatNodesFromHierarchy(subtreeRoot, nodesToInclude)
      if (filteredFlatNodes.length === 0) {
        console.warn('No nodes found after filtering by root taxon')
        return treeStructure
      }
      const rebuilt = stratifyFlatNodes(filteredFlatNodes)
      if (!rebuilt?.data) {
        console.warn('Rebuilt root is invalid, returning original')
        return treeStructure
      }
      return rebuilt
    } catch (error) {
      console.error('Error filtering tree by root taxon:', error)
      return treeStructure
    }
  },

  getFilteredTreeByRootAndRank: (rootTaxid: string | null, rank: string | null) => {
    const { getTreeStructure, filterTreeByRootTaxon } = get()
    const baseTree = rootTaxid
      ? filterTreeByRootTaxon(rootTaxid)
      : getTreeStructure()
    if (!baseTree) return null
    if (!rank) return baseTree
    return applyRankFilterToTree(baseTree, rank)
  },

  // Rank distribution under a root: ordered list of { rank, count }
  getRankDistribution: (rootTaxid: string | null) => {
    const { getTreeStructure, filterTreeByRootTaxon } = get()
    const tree = rootTaxid
      ? filterTreeByRootTaxon(rootTaxid)
      : getTreeStructure()
    if (!tree) return []

    const countByRank = new Map<string, number>()
    tree.each((node) => {
      if (!node.data?.rank) return
      const r = node.data.rank.toLowerCase().trim()
      if (!r) return
      countByRank.set(r, (countByRank.get(r) ?? 0) + 1)
    })

    const entries: RankDistributionEntry[] = Array.from(countByRank.entries()).map(([rank, count]) => ({ rank, count }))
    entries.sort((a, b) => {
      const i = getRankIndex(a.rank)
      const j = getRankIndex(b.rank)
      if (i >= 0 && j >= 0) return i - j
      if (i >= 0) return -1
      if (j >= 0) return 1
      return a.rank.localeCompare(b.rank)
    })
    return entries
  },

  getLeafCountUnderRoot: (rootTaxid: string | null) => {
    const { getTreeStructure, filterTreeByRootTaxon } = get()
    const tree = rootTaxid
      ? filterTreeByRootTaxon(rootTaxid)
      : getTreeStructure()
    if (!tree) return 0
    let count = 0
    tree.each((node) => {
      // Leaf = node with no children in this tree (d3: leaf has .children undefined or empty)
      if (!node.data) return
      if (!node.children || node.children.length === 0) count += 1
    })
    return count
  },

  getRootOrganismsCount: (rootTaxid: string | null) => {
    const { getTreeStructure, filterTreeByRootTaxon } = get()
    const tree = rootTaxid
      ? filterTreeByRootTaxon(rootTaxid)
      : getTreeStructure()
    if (!tree?.data) return 0
    return tree.data.organisms_count ?? 0
  },

  getTaxonContext: (taxid: string) => {
    const { flatNodes } = get()
    const node = flatNodes.find((n) => n.id === taxid) ?? null
    const children = flatNodes
      .filter((n) => n.parentId === taxid)
      .sort((a, b) => (b.annotations_count ?? 0) - (a.annotations_count ?? 0))
    const ancestors: FlatTreeNode[] = []
    let currentId: string | null = node?.parentId ?? null
    const excludeIds = new Set(['root', '131567'])
    while (currentId && !excludeIds.has(currentId)) {
      const ancestor = flatNodes.find((n) => n.id === currentId)
      if (ancestor) {
        ancestors.push(ancestor)
        currentId = ancestor.parentId
      } else {
        break
      }
    }
    ancestors.reverse()
    return { node: node ?? null, children, ancestors }
  },
}))

// Selector hook for treeStructure (computed on-demand from flatNodes)
// Components can use this hook to get treeStructure that's computed from flatNodes
// This is similar to how tree-of-life-d3.tsx uses useMemo to compute treeStructure
export const useTreeStructure = () => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  
  return useMemo(() => {
    if (flatNodes.length === 0) return null
    
    // Use d3.stratify to convert flat data to hierarchy (same as tree-of-life-d3.tsx)
    const stratify = d3.stratify<FlatTreeNode>()
      .id((d) => d.id)
      .parentId((d) => d.parentId)
    
    try {
      return stratify(flatNodes)
    } catch (err) {
      console.error('Error creating hierarchy:', err)
      return null
    }
  }, [flatNodes])
}

// Selector hook for filtered tree structure by rank
export const useFilteredTreeByRank = (rank: string | null) => {
  const filterTreeByRank = useFlattenedTreeStore((state) => state.filterTreeByRank)
  
  return useMemo(() => {
    return filterTreeByRank(rank)
  }, [filterTreeByRank, rank])
}

// Selector hook for leaf nodes
export const useLeafNodes = () => {
  const getLeafNodes = useFlattenedTreeStore((state) => state.getLeafNodes)
  
  return useMemo(() => {
    return getLeafNodes()
  }, [getLeafNodes])
}

// Selector hook for filtered tree structure by root taxon. Getter is stable; we depend on flatNodes/rootTaxid for invalidation.
export const useFilteredTreeByRootTaxon = (rootTaxid: string | null) => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const filterTreeByRootTaxon = useFlattenedTreeStore((state) => state.filterTreeByRootTaxon)

  return useMemo(() => filterTreeByRootTaxon(rootTaxid), [flatNodes, filterTreeByRootTaxon, rootTaxid])
}

// Selector hook: tree filtered by root and optionally by rank. Getter is stable; we depend on flatNodes/rootTaxid/rank for invalidation.
export const useFilteredTreeByRootAndRank = (rootTaxid: string | null, rank: string | null) => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const getFilteredTreeByRootAndRank = useFlattenedTreeStore((state) => state.getFilteredTreeByRootAndRank)

  return useMemo(() => getFilteredTreeByRootAndRank(rootTaxid, rank), [flatNodes, getFilteredTreeByRootAndRank, rootTaxid, rank])
}

// Selector hook for leaf count under a root
export const useLeafCountUnderRoot = (rootTaxid: string | null) => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const getLeafCountUnderRoot = useFlattenedTreeStore((state) => state.getLeafCountUnderRoot)
  return useMemo(() => getLeafCountUnderRoot(rootTaxid), [flatNodes, getLeafCountUnderRoot, rootTaxid])
}

// Selector hook for root's organisms_count (matches selected taxon's organisms_count for "All leaves" display)
export const useRootOrganismsCount = (rootTaxid: string | null) => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const getRootOrganismsCount = useFlattenedTreeStore((state) => state.getRootOrganismsCount)
  return useMemo(() => getRootOrganismsCount(rootTaxid), [flatNodes, getRootOrganismsCount, rootTaxid])
}

// Selector hook for rank distribution under a root
export const useRankDistribution = (rootTaxid: string | null) => {
  const flatNodes = useFlattenedTreeStore((state) => state.flatNodes)
  const getRankDistribution = useFlattenedTreeStore((state) => state.getRankDistribution)

  return useMemo(() => {
    return getRankDistribution(rootTaxid)
  }, [flatNodes, getRankDistribution, rootTaxid])
}
