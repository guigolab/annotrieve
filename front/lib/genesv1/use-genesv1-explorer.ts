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
  hitsToTsv,
  isDefaultCoverageRange,
} from "@/lib/genes/coverage"
import {
  ALL_SOURCE_CODES,
  defaultSources,
  makeFilter,
} from "@/lib/genes/filters"
import {
  activeNames,
  effectiveCoverage,
  excludeTaxids as excludeTaxidsOf,
  includeTaxids as includeTaxidsOf,
  useGenesV1Store,
} from "@/lib/genesv1/store"
import { buildTaxonIndex } from "@/lib/genes/taxon-index"
import { GENES_RANK_TAXON_CAP } from "@/components/genes/genes-overview-constants"
import {
  allowedGenesViewRanks,
  type HitRankStat,
} from "@/lib/genes/tree"
import { GENES_TSV_DOWNLOAD_CAP } from "@/lib/genes/ui"
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

export function useGenesV1Explorer() {
  const queryNames = useGenesV1Store((s) => s.queryNames)
  const excluded = useGenesV1Store((s) => s.excluded)
  const t = useGenesV1Store((s) => s.t)
  const g = useGenesV1Store((s) => s.g)
  const sources = useGenesV1Store((s) => s.sources)
  const coverage = useGenesV1Store((s) => s.coverage)
  const expanded = useGenesV1Store((s) => s.expanded)
  const panel = useGenesV1Store((s) => s.panel)
  const openPopover = useGenesV1Store((s) => s.openPopover)
  const includeTaxa = useGenesV1Store((s) => s.includeTaxa)
  const excludeTaxa = useGenesV1Store((s) => s.excludeTaxa)
  const viewRank = useGenesV1Store((s) => s.viewRank)
  const listAll = useGenesV1Store((s) => s.listAll)
  const urlReady = useGenesV1Store((s) => s.urlReady)

  const setCoverage = useGenesV1Store((s) => s.setCoverage)
  const clearCoverage = useGenesV1Store((s) => s.clearCoverage)
  const toggleSource = useGenesV1Store((s) => s.toggleSource)
  const selectTaxon = useGenesV1Store((s) => s.selectTaxon)
  const selectName = useGenesV1Store((s) => s.selectName)
  const selectCell = useGenesV1Store((s) => s.selectCell)
  const toggleExpanded = useGenesV1Store((s) => s.toggleExpanded)
  const setExpanded = useGenesV1Store((s) => s.setExpanded)
  const openAnnotation = useGenesV1Store((s) => s.openAnnotation)
  const openGene = useGenesV1Store((s) => s.openGene)
  const popPanel = useGenesV1Store((s) => s.popPanel)
  const resetPanel = useGenesV1Store((s) => s.resetPanel)
  const setPopover = useGenesV1Store((s) => s.setPopover)
  const setTaxa = useGenesV1Store((s) => s.setTaxa)
  const relabelTaxa = useGenesV1Store((s) => s.relabelTaxa)
  const setViewRank = useGenesV1Store((s) => s.setViewRank)
  const resetViewFilters = useGenesV1Store((s) => s.resetViewFilters)
  const setExcluded = useGenesV1Store((s) => s.setExcluded)
  const setListAll = useGenesV1Store((s) => s.setListAll)
  const hydrateFromUrl = useGenesV1Store((s) => s.hydrateFromUrl)
  const setUrlReady = useGenesV1Store((s) => s.setUrlReady)

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
        t: parsed.t,
        g: parsed.g,
        sources: parsed.sources ?? undefined,
        annotationId: parsed.annotationId,
        localId: parsed.localId,
        includeTaxa: parsed.includeTaxa,
        excludeTaxa: parsed.excludeTaxa,
        viewRank: parsed.viewRank,
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
    if (includeTaxids.length > 0) return
    if (viewRank == null) setViewRank("kingdom")
  }, [includeTaxids.length, viewRank, setViewRank])

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
        taxid: t,
        name: g,
        termCount,
      }),
    [sources, covMin, covMax, covSegments, excluded, t, g, termCount],
  )

  const tree = useMemo(
    () => (adapter ? adapter.tree(filter, viewRank) : null),
    [adapter, filter, viewRank],
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

  const coverageActive =
    coverage != null && !isDefaultCoverageRange(coverage, termCount)
  const sourcesActive = sources.size < ALL_SOURCE_CODES.length
  const hasSlice = Boolean(t || g || coverageActive || sourcesActive)
  const showList = hasSlice || listAll

  const overviewFilter = useMemo(
    () =>
      makeFilter({
        sources: defaultSources(),
        minMatched: termCount > 0 ? 1 : 0,
        maxMatched: termCount > 0 ? termCount : Number.MAX_SAFE_INTEGER,
        excludeTerms: excluded,
        taxid: null,
        name: null,
        termCount,
      }),
    [excluded, termCount],
  )

  const annotationTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(filter, { limit: 1, offset: 0 }).total
  }, [adapter, filter])

  const organismTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.organismCount(filter)
  }, [adapter, filter])

  const overviewAnnotationTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(overviewFilter, { limit: 1, offset: 0 }).total
  }, [adapter, overviewFilter])

  const overviewOrganismTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.organismCount(overviewFilter)
  }, [adapter, overviewFilter])

  const downloadAllTotal = useMemo(() => {
    if (!adapter) return 0
    const allFilter = makeFilter({
      sources: defaultSources(),
      minMatched: 1,
      maxMatched: Number.MAX_SAFE_INTEGER,
      excludeTerms: new Set(),
      taxid: null,
      name: null,
    })
    return adapter.annotations(allFilter, { limit: 1, offset: 0 }).total
  }, [adapter])

  const excludeList = useMemo(
    () => [...excluded].sort(),
    [excluded],
  )

  useGenesUrlSync(
    {
      names: queryNames,
      exclude: excludeList,
      t,
      g,
      sources,
      coverage,
      termCount,
      ann: panel.annotationId,
      gene: panel.localId,
      includeTaxids,
      excludeTaxids,
      viewRank,
      ready: urlReady,
    },
    onHydrate,
  )

  const downloadSelectionTsv = useCallback(() => {
    if (!adapter) return
    const page = adapter.annotations(filter, {
      limit: GENES_TSV_DOWNLOAD_CAP,
      offset: 0,
    })
    const tsv = hitsToTsv(page.results, adapter.terms, page.matched)
    const blob = new Blob([tsv], { type: "text/tab-separated-values" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "genes-hits-selection.tsv"
    a.click()
    URL.revokeObjectURL(url)
  }, [adapter, filter])

  const downloadAllTsv = useCallback(() => {
    if (!adapter) return
    const allFilter = makeFilter({
      sources: defaultSources(),
      minMatched: 1,
      maxMatched: Number.MAX_SAFE_INTEGER,
      excludeTerms: new Set(),
      taxid: null,
      name: null,
    })
    const page = adapter.annotations(allFilter, {
      limit: GENES_TSV_DOWNLOAD_CAP,
      offset: 0,
    })
    const tsv = hitsToTsv(page.results, adapter.terms, page.matched)
    const blob = new Blob([tsv], { type: "text/tab-separated-values" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "genes-hits.tsv"
    a.click()
    URL.revokeObjectURL(url)
  }, [adapter])

  const matchedNothing = (hits?.terms ?? []).filter((term) => term.n_hits === 0)
  const showResults = queryNames.length > 0
  const isLoading = hitsQuery.isLoading && !hits
  const isFetching = hitsQuery.isFetching
  const taxonLabel = t
    ? taxonIndex.get(t)?.scientific_name ?? t
    : null

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
    hits,
    hitsTerms: hits?.terms ?? [],
    adapter,
    adapterTerms,
    filter,
    tree,
    coverageData,
    sourceCounts,
    termCount,
    annotationTotal,
    organismTotal,
    overviewAnnotationTotal,
    overviewOrganismTotal,
    downloadAllTotal,
    hasSlice,
    showList,
    listAll,
    taxonIndex,
    taxonLabel,

    isLoading,
    isFetching,
    errorMessage,
    refetch: () => void hitsQuery.refetch(),

    t,
    g,
    sources,
    coverage,
    expanded,
    panel,
    openPopover,
    includeTaxa,
    excludeTaxa,
    includeTaxids,
    excludeTaxids,
    viewRank,
    rankOptions,
    hideAutoRank: includeTaxids.length === 0,
    rankSelectDisabled: rankAllowance.mixed,
    rankSelectDisabledReason: rankAllowance.mixed
      ? "Include taxa at different ranks"
      : null,

    setTaxa,
    setExcluded,
    setCoverage,
    clearCoverage,
    toggleSource,
    selectTaxon,
    selectName,
    selectCell,
    setViewRank,
    toggleExpanded,
    setExpanded: (ids: Set<string>) => setExpanded(ids),
    openAnnotation,
    openGene,
    popPanel,
    resetPanel,
    setPopover,
    resetViewFilters,
    setListAll,
    downloadAllTsv,
    downloadSelectionTsv,
  }
}

export type GenesV1Explorer = ReturnType<typeof useGenesV1Explorer>
