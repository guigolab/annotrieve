import { create } from 'zustand'
import { getTaxon, getTaxonChildren, getTaxonAncestors, getTaxonRankFrequencies, listTaxons } from '@/lib/api/taxons'
import type { TaxonRecord } from '@/lib/api/types'
import type { TaxonSearchResult } from "@/components/search/taxon-search-bar"

export interface TreeNode {
  taxid: string
  data: TaxonRecord
  children: TreeNode[]
  level: number
  parent?: TreeNode
  isRoot?: boolean
}

const defaultSortBy = "annotations_count"
const defaultSortOrder = "desc"

interface TaxonomicTreeState {
  // Tree state
  expandedNodes: Set<string>
  selectedNodes: Set<string>
  selectedTaxonsData: Map<string, TaxonRecord>
  childrenData: Map<string, TaxonRecord[]>
  fetchingNodes: Set<string>
  fetchedNodes: Set<string>
  
  // Selected taxon state
  selectedTaxonData: TaxonRecord | null
  selectedTaxonAncestors: TaxonRecord[]
  selectedTaxonChildren: TaxonRecord[]
  loadingSelectedTaxon: boolean
  
  // Search state
  searchQuery: string
  searchResults: TaxonRecord[]
  matchedTaxids: Set<string>
  isSearchingFromBar: boolean
  isSearchMode: boolean
  hasNoSearchResults: boolean
  
  // Rank filter state
  selectedRank: string | null
  rankFrequencies: Record<string, number>
  loadingRanks: boolean
  rankRoots: TaxonRecord[]
  loadingRankRoots: boolean
  rankRootsOffset: number
  hasMoreRankRoots: boolean
  totalRankRoots: number
  
  // Root node
  rootNode: TaxonRecord | null
  isLoadingRoot: boolean
  rootError: Error | null
  
  // Actions - Tree operations
  toggleExpand: (taxid: string) => void
  toggleSelect: (taxid: string, nodeData: TaxonRecord) => void
  removeSelected: (taxid: string) => void
  clearSelection: () => void
  
  // Actions - Data fetching
  fetchRootNode: (taxid: string) => Promise<void>
  fetchChildren: (taxid: string) => Promise<void>
  fetchSelectedTaxon: (taxid: string) => Promise<void>
  fetchRankFrequencies: () => Promise<void>
  fetchRankRoots: (rank: string, offset?: number) => Promise<void>
  loadMoreRankRoots: () => Promise<void>
  
  // Actions - Search
  setSearchQuery: (query: string) => void
  handleSearchResults: (results: TaxonSearchResult[]) => void
  handleNoSearchResults: () => void
  clearSearch: () => void
  
  // Actions - Filters
  setSelectedRank: (rank: string | null) => void
  setSearchingFromBar: (isSearching: boolean) => void
  
  // Actions - Initialize
  initializeFromStore: (taxons: TaxonRecord[]) => void
}

export const useTaxonomicTreeStore = create<TaxonomicTreeState>((set, get) => ({
  // Initial state
  expandedNodes: new Set(),
  selectedNodes: new Set(),
  selectedTaxonsData: new Map(),
  childrenData: new Map(),
  fetchingNodes: new Set(),
  fetchedNodes: new Set(),
  
  selectedTaxonData: null,
  selectedTaxonAncestors: [],
  selectedTaxonChildren: [],
  loadingSelectedTaxon: false,
  
  searchQuery: '',
  searchResults: [],
  matchedTaxids: new Set(),
  isSearchingFromBar: false,
  isSearchMode: false,
  hasNoSearchResults: false,
  
  selectedRank: null,
  rankFrequencies: {},
  loadingRanks: false,
  rankRoots: [],
  loadingRankRoots: false,
  rankRootsOffset: 0,
  hasMoreRankRoots: false,
  totalRankRoots: 0,
  
  rootNode: null,
  isLoadingRoot: false,
  rootError: null,
  
  // Tree operations
  toggleExpand: (taxid: string) => {
    set((state) => {
      const next = new Set(state.expandedNodes)
      if (next.has(taxid)) {
        next.delete(taxid)
      } else {
        next.add(taxid)
      }
      return { expandedNodes: next }
    })
  },
  
  toggleSelect: (taxid: string, nodeData: TaxonRecord) => {
    set((state) => {
      const nextNodes = new Set(state.selectedNodes)
      const nextData = new Map(state.selectedTaxonsData)
      
      if (nextNodes.has(taxid)) {
        nextNodes.delete(taxid)
        nextData.delete(taxid)
      } else {
        nextNodes.add(taxid)
        nextData.set(taxid, nodeData)
      }
      
      return { selectedNodes: nextNodes, selectedTaxonsData: nextData }
    })
  },
  
  removeSelected: (taxid: string) => {
    set((state) => {
      const nextNodes = new Set(state.selectedNodes)
      nextNodes.delete(taxid)
      const nextData = new Map(state.selectedTaxonsData)
      nextData.delete(taxid)
      return { selectedNodes: nextNodes, selectedTaxonsData: nextData }
    })
  },
  
  clearSelection: () => {
    set({ selectedNodes: new Set(), selectedTaxonsData: new Map() })
  },
  
  // Data fetching
  fetchRootNode: async (taxid: string) => {
    set({ isLoadingRoot: true, rootError: null })
    try {
      const rootNode = await getTaxon(taxid)
      set({ rootNode, isLoadingRoot: false })
      // Auto-expand root
      set((state) => {
        const next = new Set(state.expandedNodes)
        next.add(taxid)
        return { expandedNodes: next }
      })
    } catch (error) {
      set({ rootError: error as Error, isLoadingRoot: false })
    }
  },
  
  fetchChildren: async (taxid: string) => {
    const state = get()
    if (state.fetchedNodes.has(taxid)) return
    if (state.childrenData.has(taxid) && state.childrenData.get(taxid)!.length > 0) {
      set((s) => {
        const next = new Set(s.fetchedNodes)
        next.add(taxid)
        return { fetchedNodes: next }
      })
      return
    }
    
    set((s) => {
      const next = new Set(s.fetchingNodes)
      next.add(taxid)
      return { fetchingNodes: next }
    })
    
    try {
      const response = await getTaxonChildren(taxid)
      const children = (response.results || []).sort((a: TaxonRecord, b: TaxonRecord) => (b.annotations_count ?? 0) - (a.annotations_count ?? 0)).map((child: TaxonRecord) => ({
        ...child,
        organisms_count: child.organisms_count ?? 0,
        assemblies_count: child.assemblies_count ?? 0,
        annotations_count: child.annotations_count ?? 0,
      }))
      
      set((s) => {
        const updated = new Map(s.childrenData)
        updated.set(taxid, children)
        const nextFetched = new Set(s.fetchedNodes)
        nextFetched.add(taxid)
        const nextFetching = new Set(s.fetchingNodes)
        nextFetching.delete(taxid)
        return { childrenData: updated, fetchedNodes: nextFetched, fetchingNodes: nextFetching }
      })
    } catch (error) {
      console.error(`Error fetching children for taxid ${taxid}:`, error)
      set((s) => {
        const next = new Set(s.fetchingNodes)
        next.delete(taxid)
        return { fetchingNodes: next }
      })
    }
  },
  
  fetchSelectedTaxon: async (taxid: string) => {
    set({ loadingSelectedTaxon: true })
    try {
      const [taxon, ancestorsRes, childrenRes] = await Promise.all([
        getTaxon(taxid),
        getTaxonAncestors(taxid),
        getTaxonChildren(taxid)
      ])
      
      const ancestors = (ancestorsRes as any).results || []
      const children = (childrenRes as any).results || []
      
      set({
        selectedTaxonData: taxon,
        selectedTaxonAncestors: ancestors,
        selectedTaxonChildren: children,
        loadingSelectedTaxon: false
      })
      
      // Expand ancestors and selected taxon
      set((s) => {
        const next = new Set(s.expandedNodes)
        ancestors.forEach((a: TaxonRecord) => next.add(a.taxid))
        next.add(taxid)
        return { expandedNodes: next }
      })
      
      // Add children to map
      set((s) => {
        const updated = new Map(s.childrenData)
        updated.set(taxid, children)
        const nextFetched = new Set(s.fetchedNodes)
        nextFetched.add(taxid)
        return { childrenData: updated, fetchedNodes: nextFetched }
      })
    } catch (error) {
      console.error('Error fetching selected taxon data:', error)
      set({
        selectedTaxonData: null,
        selectedTaxonAncestors: [],
        selectedTaxonChildren: [],
        loadingSelectedTaxon: false
      })
    }
  },
  
  fetchRankFrequencies: async () => {
    set({ loadingRanks: true })
    try {
      const data = await getTaxonRankFrequencies()
      set({ rankFrequencies: data || {}, loadingRanks: false })
    } catch (error) {
      console.error("Error loading rank frequencies:", error)
      set({ rankFrequencies: {}, loadingRanks: false })
    }
  },
  
  fetchRankRoots: async (rank: string, offset = 0) => {
    set({ loadingRankRoots: true })
    const limit = 50
    try {
      const response = await listTaxons({ rank, limit, offset, sort_by: defaultSortBy, sort_order: defaultSortOrder })
      const results = (response as any)?.results || []
      const total = (response as any)?.total || 0
      
      set({
        rankRoots: offset === 0 ? results : [...get().rankRoots, ...results],
        rankRootsOffset: offset + results.length,
        hasMoreRankRoots: offset + results.length < total,
        totalRankRoots: total,
        loadingRankRoots: false
      })
    } catch (error) {
      console.error("Error loading taxons by rank:", error)
      set({ rankRoots: [], hasMoreRankRoots: false, totalRankRoots: 0, loadingRankRoots: false })
    }
  },
  
  loadMoreRankRoots: async () => {
    const state = get()
    if (!state.selectedRank || state.loadingRankRoots || !state.hasMoreRankRoots) return
    await get().fetchRankRoots(state.selectedRank, state.rankRootsOffset)
  },
  
  // Search actions
  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
    if (!query.trim()) {
      set({
        searchResults: [],
        matchedTaxids: new Set(),
        isSearchMode: false,
        hasNoSearchResults: false
      })
    }
  },
  
  handleSearchResults: (results: TaxonSearchResult[]) => {
    if (results.length === 0) {
      set({
        searchResults: [],
        matchedTaxids: new Set(),
        isSearchMode: false,
        hasNoSearchResults: false
      })
      return
    }
    
    const taxonRecords = results.map((result) => result.data as TaxonRecord)
    const matched = new Set<string>(taxonRecords.map((r: TaxonRecord) => String(r.taxid)))
    
    set({
      searchResults: taxonRecords,
      matchedTaxids: matched,
      isSearchMode: true,
      hasNoSearchResults: false
    })
  },
  
  handleNoSearchResults: () => {
    const state = get()
    if (state.searchQuery.trim().length >= 2) {
      set({
        hasNoSearchResults: true,
        isSearchMode: true,
        searchResults: [],
        matchedTaxids: new Set()
      })
    }
  },
  
  clearSearch: () => {
    const state = get()
    const rootTaxid = state.rootNode?.taxid
    
    set({
      searchQuery: '',
      searchResults: [],
      matchedTaxids: new Set(),
      isSearchMode: false,
      hasNoSearchResults: false,
      selectedRank: null,
      // Clear rank filter data
      rankRoots: [],
      rankRootsOffset: 0,
      hasMoreRankRoots: false,
      totalRankRoots: 0,
      // Clear selected taxon data (from search selection)
      selectedTaxonData: null,
      selectedTaxonAncestors: [],
      selectedTaxonChildren: [],
      // Clear expanded nodes and children data to prevent old rows from showing
      expandedNodes: rootTaxid ? new Set([rootTaxid]) : new Set(),
      childrenData: new Map(),
      fetchedNodes: new Set(),
      fetchingNodes: new Set()
    })
  },
  
  // Filter actions
  setSelectedRank: (rank: string | null) => {
    set({ selectedRank: rank })
    if (rank) {
      get().fetchRankRoots(rank, 0)
    } else {
      const state = get()
      const rootTaxid = state.rootNode?.taxid
      set({
        rankRoots: [],
        rankRootsOffset: 0,
        hasMoreRankRoots: false,
        totalRankRoots: 0,
        // Clear expanded nodes and children data when clearing rank filter
        expandedNodes: rootTaxid ? new Set([rootTaxid]) : new Set(),
        childrenData: new Map(),
        fetchedNodes: new Set(),
        fetchingNodes: new Set()
      })
    }
  },
  
  setSearchingFromBar: (isSearching: boolean) => {
    set({ isSearchingFromBar: isSearching })
  },
  
  // Initialize from store
  initializeFromStore: (taxons: TaxonRecord[]) => {
    if (taxons.length === 0) return
    const taxids = new Set(taxons.map((t) => t.taxid))
    const taxonsMap = new Map(taxons.map((t) => [t.taxid, t]))
    set({ selectedNodes: taxids, selectedTaxonsData: taxonsMap })
  }
}))

