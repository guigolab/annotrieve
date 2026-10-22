"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { searchHits, XrefsApiError } from "@/lib/api/xrefs"
import { createClientHitsAdapter } from "@/lib/genes/adapter"
import { hitsToTsv } from "@/lib/genes/coverage"
import { makeFilter } from "@/lib/genes/filters"
import {
  activeNames,
  effectiveCoverage,
  excludeTaxids as excludeTaxidsOf,
  includeTaxids as includeTaxidsOf,
  useGenesStore,
} from "@/lib/genes/store"
import { buildTaxonIndex } from "@/lib/genes/taxon-index"
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

export function useGenesExplorer() {
  const queryNames = useGenesStore((s) => s.queryNames)
  const resolvedNames = useGenesStore((s) => s.resolvedNames)
  const prefixExpansions = useGenesStore((s) => s.prefixExpansions)
  const excluded = useGenesStore((s) => s.excluded)
  const t = useGenesStore((s) => s.t)
  const g = useGenesStore((s) => s.g)
  const sources = useGenesStore((s) => s.sources)
  const coverage = useGenesStore((s) => s.coverage)
  const expanded = useGenesStore((s) => s.expanded)
  const panel = useGenesStore((s) => s.panel)
  const openPopover = useGenesStore((s) => s.openPopover)
  const includeTaxa = useGenesStore((s) => s.includeTaxa)
  const excludeTaxa = useGenesStore((s) => s.excludeTaxa)
  const viewRank = useGenesStore((s) => s.viewRank)
  const urlReady = useGenesStore((s) => s.urlReady)

  const setResolvedNames = useGenesStore((s) => s.setResolvedNames)
  const setPrefixExpansions = useGenesStore((s) => s.setPrefixExpansions)
  const setCoverage = useGenesStore((s) => s.setCoverage)
  const clearCoverage = useGenesStore((s) => s.clearCoverage)
  const toggleSource = useGenesStore((s) => s.toggleSource)
  const selectTaxon = useGenesStore((s) => s.selectTaxon)
  const selectName = useGenesStore((s) => s.selectName)
  const selectCell = useGenesStore((s) => s.selectCell)
  const toggleExpanded = useGenesStore((s) => s.toggleExpanded)
  const setExpanded = useGenesStore((s) => s.setExpanded)
  const openAnnotation = useGenesStore((s) => s.openAnnotation)
  const openGene = useGenesStore((s) => s.openGene)
  const popPanel = useGenesStore((s) => s.popPanel)
  const resetPanel = useGenesStore((s) => s.resetPanel)
  const setPopover = useGenesStore((s) => s.setPopover)
  const setTaxa = useGenesStore((s) => s.setTaxa)
  const relabelTaxa = useGenesStore((s) => s.relabelTaxa)
  const setViewRank = useGenesStore((s) => s.setViewRank)
  const resetViewFilters = useGenesStore((s) => s.resetViewFilters)
  const setExcluded = useGenesStore((s) => s.setExcluded)
  const setQueryNames = useGenesStore((s) => s.setQueryNames)
  const setQueryText = useGenesStore((s) => s.setQueryText)
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

  // Relabel taxa once the flattened tree arrives (URL hydrate only has ids).
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
    queryKey: ["genes-hits", queryNames, includeTaxids, excludeTaxids],
    enabled: queryNames.length > 0,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      searchHits(
        {
          names: queryNames,
          match: "any",
          include_taxids: includeTaxids.length ? includeTaxids : null,
          exclude_taxids: excludeTaxids.length ? excludeTaxids : null,
        },
        { signal },
      ),
  })

  const hits = hitsQuery.data ?? null

  useEffect(() => {
    if (!hits) return
    const names: string[] = []
    const seen = new Set<string>()
    for (const key of hits.keys ?? []) {
      const id = key.name.toLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      names.push(key.name)
    }
    setResolvedNames(names)
    const expansions = (hits.terms ?? [])
      .filter((term) => term.expanded && term.expanded.length)
      .map((term) => ({
        prefix: term.input.endsWith("*") ? term.input : `${term.input}*`,
        count: term.expanded!.length,
      }))
    setPrefixExpansions(expansions)
  }, [hits, setResolvedNames, setPrefixExpansions])

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

  const rankAllowance = useMemo(
    () => allowedGenesViewRanks(includeTaxids, taxonIndex),
    [includeTaxids, taxonIndex],
  )

  // Default to kingdom when there are no include-taxids.
  useEffect(() => {
    if (includeTaxids.length > 0) return
    if (viewRank == null) setViewRank("kingdom")
  }, [includeTaxids.length, viewRank, setViewRank])

  // Clear viewRank when includes mix ranks or the selected rank is no longer allowed.
  useEffect(() => {
    if (!viewRank) return
    if (
      rankAllowance.mixed ||
      !(rankAllowance.ranks as readonly string[]).includes(viewRank)
    ) {
      setViewRank(null)
    }
  }, [viewRank, rankAllowance, setViewRank])

  // Keep the tree collapsed when the query / rank scope changes.
  useEffect(() => {
    setExpanded(new Set())
  }, [queryNames, includeTaxids, excludeTaxids, viewRank, setExpanded])

  const effCoverage = effectiveCoverage(coverage, termCount)
  const filter = useMemo(
    () =>
      makeFilter({
        sources,
        minMatched: effCoverage.min,
        maxMatched: effCoverage.max,
        excludeTerms: excluded,
        taxid: t,
        name: g,
        termCount,
      }),
    [sources, effCoverage, excluded, t, g, termCount],
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

  const annotationTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(filter, { limit: 1, offset: 0 }).total
  }, [adapter, filter])

  const organismTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.organismCount(filter)
  }, [adapter, filter])

  useGenesUrlSync(
    {
      names: queryNames,
      exclude: [...excluded],
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

  const downloadTsv = useCallback(() => {
    if (!adapter) return
    const page = adapter.annotations(filter, {
      limit: GENES_TSV_DOWNLOAD_CAP,
      offset: 0,
    })
    const tsv = hitsToTsv(page.results, adapter.keys)
    const blob = new Blob([tsv], { type: "text/tab-separated-values" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "genes-hits.tsv"
    a.click()
    URL.revokeObjectURL(url)
  }, [adapter, filter])

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

  const removeQueryName = useCallback(
    (name: string) => {
      const id = name.toLowerCase()
      const next = queryNames.filter((n) => n.toLowerCase() !== id)
      setQueryNames(next)
      setQueryText(next.join(", "))
    },
    [queryNames, setQueryNames, setQueryText],
  )

  return {
    // query / results
    queryNames,
    resolvedNames,
    prefixExpansions,
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
    taxonIndex,
    taxonLabel,

    // loading / error
    isLoading,
    isFetching,
    errorMessage,
    refetch: () => void hitsQuery.refetch(),

    // selection / filters
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

    // actions
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
    removeQueryName,
    downloadTsv,
  }
}

export type GenesExplorer = ReturnType<typeof useGenesExplorer>
