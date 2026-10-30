"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  canonicalNameCsv,
  canonicalTaxidCsv,
  searchHits,
  XrefsApiError,
} from "@/lib/api/xrefs"
import { createClientHitsAdapter } from "@/lib/genes/adapter"
import {
  clampCoverageRange,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import { defaultSources, makeFilter } from "@/lib/genes/filters"
import {
  activeNames,
  effectiveCoverage,
  effectiveViewRank,
  excludeTaxids as excludeTaxidsOf,
  includeTaxids as includeTaxidsOf,
  useGenesStore,
} from "@/lib/genes/store"
import { runAnnotationsPipeline } from "@/lib/genes/annotations-pipeline"
import { buildTaxonIndex } from "@/lib/genes/taxon-index"
import { GENES_RANK_TAXON_CAP } from "@/components/genes/genes-overview-constants"
import {
  allowedGenesViewRanks,
  type HitRankStat,
} from "@/lib/genes/tree"
import { resolveCoverageFromUrl } from "@/lib/genes/url"
import {
  useGenesUrlSync,
  type GenesHydratePayload,
} from "@/lib/hooks/use-genes-url-sync"
import { useFlattenedTreeStore } from "@/lib/stores/flattened-tree"

function hitsRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false
  if (error instanceof XrefsApiError) {
    return error.status === 503
  }
  // Network / abort-style failures (no HTTP status).
  return true
}

export function useGenesExplorer() {
  const queryNames = useGenesStore((s) => s.queryNames)
  const excluded = useGenesStore((s) => s.excluded)
  const listFilters = useGenesStore((s) => s.listFilters)
  const sources = useGenesStore((s) => s.sources)
  const coverage = useGenesStore((s) => s.coverage)
  const expanded = useGenesStore((s) => s.expanded)
  const drawer = useGenesStore((s) => s.drawer)
  const openPopover = useGenesStore((s) => s.openPopover)
  const includeTaxa = useGenesStore((s) => s.includeTaxa)
  const excludeTaxa = useGenesStore((s) => s.excludeTaxa)
  const viewRank = useGenesStore((s) => s.viewRank)
  const view = useGenesStore((s) => s.view)
  const unit = useGenesStore((s) => s.unit)
  const keep = useGenesStore((s) => s.keep)
  const group = useGenesStore((s) => s.group)
  const sort = useGenesStore((s) => s.sort)
  const sortDir = useGenesStore((s) => s.sortDir)
  const search = useGenesStore((s) => s.search)
  const annotationsSelection = useGenesStore((s) => s.annotationsSelection)
  const annotationsSelectionAnchor = useGenesStore(
    (s) => s.annotationsSelectionAnchor,
  )
  const urlReady = useGenesStore((s) => s.urlReady)

  const setCoverage = useGenesStore((s) => s.setCoverage)
  const toggleSource = useGenesStore((s) => s.toggleSource)
  const setListFilters = useGenesStore((s) => s.setListFilters)
  const patchListFilters = useGenesStore((s) => s.patchListFilters)
  const dispatchAnnotationsSelection = useGenesStore(
    (s) => s.dispatchAnnotationsSelection,
  )
  const clearAnnotationsSelection = useGenesStore(
    (s) => s.clearAnnotationsSelection,
  )
  const setAnnotationsSelectionAnchor = useGenesStore(
    (s) => s.setAnnotationsSelectionAnchor,
  )
  const setKeep = useGenesStore((s) => s.setKeep)
  const setGroup = useGenesStore((s) => s.setGroup)
  const setSort = useGenesStore((s) => s.setSort)
  const setSearch = useGenesStore((s) => s.setSearch)
  const toggleExpanded = useGenesStore((s) => s.toggleExpanded)
  const setExpanded = useGenesStore((s) => s.setExpanded)
  const openDrawer = useGenesStore((s) => s.openDrawer)
  const setDrawerGene = useGenesStore((s) => s.setDrawerGene)
  const closeDrawer = useGenesStore((s) => s.closeDrawer)
  const setPopover = useGenesStore((s) => s.setPopover)
  const setTaxa = useGenesStore((s) => s.setTaxa)
  const relabelTaxa = useGenesStore((s) => s.relabelTaxa)
  const setViewRank = useGenesStore((s) => s.setViewRank)
  const setView = useGenesStore((s) => s.setView)
  const setUnit = useGenesStore((s) => s.setUnit)
  const resetViewFilters = useGenesStore((s) => s.resetViewFilters)
  const hydrateFromUrl = useGenesStore((s) => s.hydrateFromUrl)
  const setUrlReady = useGenesStore((s) => s.setUrlReady)

  const includeTaxids = useMemo(() => includeTaxidsOf({ includeTaxa }), [includeTaxa])
  const excludeTaxids = useMemo(() => excludeTaxidsOf({ excludeTaxa }), [excludeTaxa])

  const pendingUrl = useRef<GenesHydratePayload | null>(null)

  const flatNodes = useFlattenedTreeStore((s) => s.flatNodes)
  const fetchFlattenedTree = useFlattenedTreeStore((s) => s.fetchFlattenedTree)

  useEffect(() => {
    void fetchFlattenedTree()
  }, [fetchFlattenedTree])

  const taxonIndex = useMemo(() => buildTaxonIndex(flatNodes), [flatNodes])

  useEffect(() => {
    if (!taxonIndex.size) return
    if (!includeTaxa.length && !excludeTaxa.length) return
    relabelTaxa((taxid) => taxonIndex.get(String(taxid))?.scientific_name)
  }, [taxonIndex, includeTaxa.length, excludeTaxa.length, relabelTaxa])

  const onHydrate = useCallback(
    (parsed: GenesHydratePayload) => {
      pendingUrl.current = parsed
      hydrateFromUrl({
        queryNames: parsed.queryNames,
        excluded: parsed.excluded,
        listFilters: parsed.listFilters,
        sources: parsed.sources ?? undefined,
        annotationId: parsed.annotationId,
        localId: parsed.localId,
        includeTaxa: parsed.includeTaxa,
        excludeTaxa: parsed.excludeTaxa,
        viewRank: parsed.viewRank,
        view: parsed.view,
        unit: parsed.unit,
        keep: parsed.keep,
        group: parsed.group,
        sort: parsed.sort,
        sortDir: parsed.sortDir,
        search: parsed.search,
      })
      setUrlReady(true)
    },
    [hydrateFromUrl, setUrlReady],
  )

  const hitsQuery = useQuery({
    queryKey: [
      "genes-hits",
      canonicalNameCsv(queryNames),
      canonicalTaxidCsv(includeTaxids) ?? "",
      canonicalTaxidCsv(excludeTaxids) ?? "",
    ],
    enabled: queryNames.length > 0,
    placeholderData: keepPreviousData,
    structuralSharing: false,
    staleTime: 10 * 60 * 1000,
    retry: hitsRetry,
    queryFn: ({ signal }) =>
      searchHits(
        {
          names: queryNames,
          include_taxids: includeTaxids.length ? includeTaxids : null,
          exclude_taxids: excludeTaxids.length ? excludeTaxids : null,
        },
        { signal },
      ),
  })

  const hits = hitsQuery.data ?? null

  const resolvedNames = useMemo(() => {
    if (!hits) return [] as string[]
    return (hits.terms ?? [])
      .filter((t) => t.n_hits > 0)
      .map((t) => t.name)
  }, [hits])

  const adapter = useMemo(() => {
    if (!hits || !taxonIndex.size) return null
    return createClientHitsAdapter(hits, taxonIndex, includeTaxids)
  }, [hits, taxonIndex, includeTaxids])

  const termCount = adapter?.termCount(excluded) ?? 0
  const active = useMemo(
    () => activeNames(resolvedNames, excluded),
    [resolvedNames, excluded],
  )

  useEffect(() => {
    const pending = pendingUrl.current
    if (!pending || !termCount) return
    pendingUrl.current = null
    const range = resolveCoverageFromUrl(pending.raw, termCount)
    const def = effectiveCoverage(null, termCount)
    if (range.min === def.min && range.max === def.max) {
      setCoverage(null, termCount)
    } else {
      setCoverage(range, termCount)
    }
  }, [termCount, hits, setCoverage])

  // Re-clamp coverage when N changes (e.g. after excluding names).
  useEffect(() => {
    if (!coverage) return
    const next = clampCoverageRange(coverage, termCount)
    if (isDefaultCoverageRange(next, termCount)) {
      setCoverage(null, termCount)
      return
    }
    if (next.min !== coverage.min || next.max !== coverage.max) {
      setCoverage(next, termCount)
    }
  }, [termCount, excluded, coverage, setCoverage])

  const rankAllowance = useMemo(
    () => allowedGenesViewRanks(includeTaxids, taxonIndex),
    [includeTaxids, taxonIndex],
  )

  useEffect(() => {
    setExpanded(new Set())
  }, [queryNames, includeTaxids, excludeTaxids, viewRank, setExpanded])

  const covMin = coverage?.min ?? (termCount > 0 ? 1 : 0)
  const covMax = coverage?.max ?? termCount
  const covSegments = coverage?.segments ?? null
  const filter = useMemo(
    () =>
      makeFilter({
        sources,
        minMatched: covMin,
        maxMatched: covMax,
        matchedSegments: covSegments,
        excludeTerms: excluded,
        includeTaxids: listFilters.includeTaxids,
        includeNames: listFilters.includeNames,
        nameMatch: listFilters.nameMatch,
        includeCells: listFilters.includeCells,
        includeAnnotationIds: listFilters.includeAnnotationIds,
        termCount,
      }),
    [sources, covMin, covMax, covSegments, excluded, listFilters, termCount],
  )

  const effectiveRank = useMemo(
    () => effectiveViewRank(viewRank, includeTaxids.length),
    [viewRank, includeTaxids.length],
  )

  const tree = useMemo(
    () => (adapter ? adapter.tree(filter, effectiveRank) : null),
    [adapter, filter, effectiveRank],
  )

  const rankStats = useMemo(
    () => (adapter ? adapter.rankStats(excluded) : []),
    [adapter, excluded],
  )

  const rankOptions = useMemo(() => {
    const byRank = new Map(rankStats.map((s) => [s.rank, s]))
    return rankAllowance.ranks.map((rank) => {
      const stat: HitRankStat | undefined = byRank.get(rank)
      return {
        rank,
        taxonCount: stat?.taxonCount ?? 0,
      }
    })
  }, [rankAllowance.ranks, rankStats])

  useEffect(() => {
    if (!viewRank) return
    if (
      rankAllowance.mixed ||
      !(rankAllowance.ranks as readonly string[]).includes(viewRank)
    ) {
      setViewRank(null)
      return
    }
    const opt = rankOptions.find((o) => o.rank === viewRank)
    if (opt && opt.taxonCount > GENES_RANK_TAXON_CAP) {
      const fallback =
        rankOptions.find(
          (o) => o.taxonCount > 0 && o.taxonCount <= GENES_RANK_TAXON_CAP,
        )?.rank ?? null
      setViewRank(fallback)
    }
  }, [viewRank, rankAllowance, rankOptions, setViewRank])

  const annotationsPipeline = useMemo(() => {
    if (!adapter || view !== "annotations") return null
    return runAnnotationsPipeline({
      adapter,
      filter,
      taxonIndex,
      keep,
      group: "none",
      sort,
      sortDir,
      search,
    })
  }, [adapter, filter, taxonIndex, keep, sort, sortDir, search, view])

  const coverageData = useMemo(
    () =>
      adapter
        ? adapter.coverage(filter)
        : { bins: [], termCount: 0, matchedCounts: [] },
    [adapter, filter],
  )

  const sourceCounts = useMemo(
    () => (adapter ? adapter.sourceCounts(filter) : new Map<number, number>()),
    [adapter, filter],
  )

  const adapterTerms = useMemo(
    () => (adapter ? adapter.activeTerms(excluded) : []),
    [adapter, excluded],
  )

  const overviewFilter = useMemo(
    () =>
      makeFilter({
        sources: defaultSources(),
        minMatched: termCount > 0 ? 1 : 0,
        maxMatched: termCount > 0 ? termCount : Number.MAX_SAFE_INTEGER,
        excludeTerms: excluded,
        taxid: null,
        name: null,
        includeTaxids: [],
        includeNames: [],
        includeCells: [],
        termCount,
      }),
    [excluded, termCount],
  )

  const annotationTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(filter, { limit: 1, offset: 0 }).total
  }, [adapter, filter])

  const overviewAnnotationTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(overviewFilter, { limit: 1, offset: 0 }).total
  }, [adapter, overviewFilter])

  const overviewSpeciesTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.speciesCount(overviewFilter)
  }, [adapter, overviewFilter])

  const excludeList = useMemo(
    () => [...excluded].sort(),
    [excluded],
  )

  useGenesUrlSync(
    {
      names: queryNames,
      exclude: excludeList,
      listFilters,
      sources,
      coverage,
      termCount,
      ann: drawer?.annotationId ?? null,
      gene: drawer?.localId ?? null,
      includeTaxids,
      excludeTaxids,
      viewRank,
      view,
      unit,
      keep,
      group,
      sort,
      sortDir,
      search,
      ready: urlReady,
    },
    onHydrate,
  )

  const matchedNothing = (hits?.terms ?? []).filter((term) => term.n_hits === 0)
  const showResults = queryNames.length > 0
  const isLoading = hitsQuery.isLoading && !hits
  const isFetching = hitsQuery.isFetching

  const errorMessage =
    hitsQuery.error instanceof XrefsApiError
      ? hitsQuery.error.detail?.message ?? hitsQuery.error.message
      : hitsQuery.error
        ? String((hitsQuery.error as Error).message ?? hitsQuery.error)
        : null

  return {
    queryNames,
    resolvedNames,
    excluded,
    active,
    matchedNothing,
    showResults,
    hitsTerms: hits?.terms ?? [],
    adapter,
    adapterTerms,
    filter,
    tree,
    coverageData,
    sourceCounts,
    termCount,
    annotationTotal,
    overviewAnnotationTotal,
    overviewSpeciesTotal,
    taxonIndex,

    isLoading,
    isFetching,
    errorMessage,
    refetch: () => void hitsQuery.refetch(),

    listFilters,
    annotationsSelection,
    annotationsSelectionAnchor,
    annotationsPipeline,
    sources,
    coverage,
    keep,
    group,
    sort,
    sortDir,
    search,
    expanded,
    drawer,
    openPopover,
    includeTaxa,
    excludeTaxa,
    includeTaxids,
    excludeTaxids,
    viewRank,
    effectiveViewRank: effectiveRank,
    view,
    unit,
    rankOptions,
    hideAutoRank: includeTaxids.length === 0,
    rankSelectDisabled: rankAllowance.mixed,
    rankSelectDisabledReason: rankAllowance.mixed
      ? "Include taxa at different ranks"
      : null,

    setTaxa,
    setCoverage,
    toggleSource,
    setListFilters,
    patchListFilters,
    dispatchAnnotationsSelection,
    clearAnnotationsSelection,
    setAnnotationsSelectionAnchor,
    setKeep,
    setGroup,
    setSort,
    setSearch,
    setViewRank,
    setView,
    setUnit,
    toggleExpanded,
    openDrawer,
    setDrawerGene,
    closeDrawer,
    setPopover,
    resetViewFilters,
  }
}

export type GenesExplorer = ReturnType<typeof useGenesExplorer>
