"use client"

import { useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  getAnnotationIdParam,
  enrichFilterEntitiesFromPrimitives,
  getFilterSearchParamsHash,
  getStoreUrlHash,
  hasActiveSearchParams,
  normalizeSearchParams,
  parseSearchParamsToFiltersSync,
  parseSearchParamsToPrimitives,
  serializeFiltersToSearchParams,
  storeEntityIdsMatchPrimitives,
  stripUiParams,
  type AnnotationsUrlParams,
} from "@/lib/annotations-url"
import {
  getLiveAnnotationsSearchParams,
  patchFilterQuery,
  scheduleAnnotationsUrlPatch,
  syncLatestAnnotationsSearch,
} from "@/lib/annotations-url-writer"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"

const URL_COMMIT_DEBOUNCE_MS = 300

function buildSerializedQueryFromStore() {
  const state = useAnnotationsFiltersStore.getState()
  return serializeFiltersToSearchParams(
    {
      selectedTaxons: state.selectedTaxons,
      selectedOrganisms: state.selectedOrganisms,
      selectedAssemblies: state.selectedAssemblies,
      selectedBioprojects: state.selectedBioprojects,
      selectedAssemblyLevels: state.selectedAssemblyLevels,
      selectedAssemblyStatuses: state.selectedAssemblyStatuses,
      onlyRefGenomes: state.onlyRefGenomes,
      biotypes: state.biotypes,
      featureTypes: state.featureTypes,
      featureSources: state.featureSources,
      pipelines: state.pipelines,
      providers: state.providers,
      databaseSources: state.databaseSources,
      buscoCompleteFrom: state.buscoCompleteFrom,
      buscoCompleteTo: state.buscoCompleteTo,
    },
    { sortOption: state.sortOption }
  )
}

function needsEntityEnrichment(primitives: AnnotationsUrlParams): boolean {
  return (
    (primitives.taxids?.length ?? 0) > 0 ||
    (primitives.accessions?.length ?? 0) > 0 ||
    (primitives.bioprojects?.length ?? 0) > 0
  )
}

function getStoreFiltersSnapshot() {
  const state = useAnnotationsFiltersStore.getState()
  return {
    selectedTaxons: state.selectedTaxons,
    selectedOrganisms: state.selectedOrganisms,
    selectedAssemblies: state.selectedAssemblies,
    selectedBioprojects: state.selectedBioprojects,
    selectedAssemblyLevels: state.selectedAssemblyLevels,
    selectedAssemblyStatuses: state.selectedAssemblyStatuses,
    onlyRefGenomes: state.onlyRefGenomes,
    biotypes: state.biotypes,
    featureTypes: state.featureTypes,
    featureSources: state.featureSources,
    pipelines: state.pipelines,
    providers: state.providers,
    databaseSources: state.databaseSources,
    buscoCompleteFrom: state.buscoCompleteFrom,
    buscoCompleteTo: state.buscoCompleteTo,
  }
}

/**
 * Sync annotations filter state with URL search params on /annotations.
 * - Read: URL stubs → store (ready immediately) → background entity enrich
 * - Write: store setters → debounced single-flight URL patch
 */
export function useAnnotationsUrlSync() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isApplyingFromUrlRef = useRef(false)
  const pendingCommitRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastAppliedUrlHashRef = useRef<string>("")
  const lastEnrichedUrlHashRef = useRef<string>("")
  const enrichGenRef = useRef(0)
  const routerRef = useRef(router)
  routerRef.current = router

  const applyFiltersFromUrl = useAnnotationsFiltersStore((s) => s.applyFiltersFromUrl)
  const enrichFilterEntitiesFromUrl = useAnnotationsFiltersStore(
    (s) => s.enrichFilterEntitiesFromUrl
  )
  const setLastKnownSearchParams = useAnnotationsFiltersStore((s) => s.setLastKnownSearchParams)
  const setFiltersReady = useAnnotationsFiltersStore((s) => s.setFiltersReady)
  const setFilterEntitiesEnriching = useAnnotationsFiltersStore(
    (s) => s.setFilterEntitiesEnriching
  )
  const setUrlCommitHandler = useAnnotationsFiltersStore((s) => s.setUrlCommitHandler)

  const commitFiltersToUrlRef = useRef<() => void>(() => {})

  const flushPendingCommit = useCallback(() => {
    if (!pendingCommitRef.current) return
    if (isApplyingFromUrlRef.current) return
    pendingCommitRef.current = false
    commitFiltersToUrlRef.current()
  }, [])

  const commitFiltersToUrl = useCallback(() => {
    if (isApplyingFromUrlRef.current) {
      pendingCommitRef.current = true
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Gap D: optimistic lastKnown update before debounce (dialog accuracy)
    const optimisticParams = buildSerializedQueryFromStore()
    const optimisticHash = getFilterSearchParamsHash(optimisticParams)
    setLastKnownSearchParams(optimisticParams.toString())

    // Invalidate in-flight enrich immediately (do not wait for debounce).
    enrichGenRef.current += 1
    lastAppliedUrlHashRef.current = optimisticHash
    lastEnrichedUrlHashRef.current = optimisticHash
    setFilterEntitiesEnriching(false)

    debounceRef.current = setTimeout(() => {
      const params = buildSerializedQueryFromStore()
      const filterQs = stripUiParams(params).toString()
      const urlHash = getFilterSearchParamsHash(params)
      const live = normalizeSearchParams(getLiveAnnotationsSearchParams())
      const currentUrlHash = getFilterSearchParamsHash(live)

      lastAppliedUrlHashRef.current = urlHash
      lastEnrichedUrlHashRef.current = urlHash
      setLastKnownSearchParams(filterQs)

      if (urlHash === currentUrlHash) {
        return
      }

      patchFilterQuery(routerRef.current, params)
    }, URL_COMMIT_DEBOUNCE_MS)
  }, [setLastKnownSearchParams, setFilterEntitiesEnriching])

  commitFiltersToUrlRef.current = commitFiltersToUrl

  // Keep writer latestSearch in sync with React (UI-param changes must not rebuild commit handler).
  useEffect(() => {
    syncLatestAnnotationsSearch(searchParams?.toString() ?? "")
  }, [searchParams])

  useEffect(() => {
    setUrlCommitHandler(commitFiltersToUrl)
    return () => {
      setUrlCommitHandler(null)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // Stable commitFiltersToUrl — only unmount clears debounce (not searchParams churn).
  }, [commitFiltersToUrl, setUrlCommitHandler])

  useEffect(() => {
    const browserParams = new URLSearchParams(searchParams?.toString() ?? "")
    const rawParams = normalizeSearchParams(browserParams)
    const urlHash = getFilterSearchParamsHash(rawParams)
    const browserQs = browserParams.toString()
    const filterQs = stripUiParams(rawParams).toString()
    const canonicalQs = rawParams.toString()

    const runBackgroundEnrich = (forHash: string) => {
      if (lastEnrichedUrlHashRef.current === forHash) return

      const primitives = parseSearchParamsToPrimitives(rawParams)
      if (!needsEntityEnrichment(primitives)) {
        lastEnrichedUrlHashRef.current = forHash
        setFilterEntitiesEnriching(false)
        return
      }

      setFilterEntitiesEnriching(true)
      const gen = ++enrichGenRef.current
      void (async () => {
        try {
          const enriched = await enrichFilterEntitiesFromPrimitives(primitives)
          if (enrichGenRef.current !== gen) return
          if (lastAppliedUrlHashRef.current !== forHash) return

          const liveStore = useAnnotationsFiltersStore.getState()
          if (
            !storeEntityIdsMatchPrimitives(
              {
                selectedTaxons: liveStore.selectedTaxons,
                selectedAssemblies: liveStore.selectedAssemblies,
                selectedBioprojects: liveStore.selectedBioprojects,
              },
              primitives
            )
          ) {
            setFilterEntitiesEnriching(false)
            return
          }

          enrichFilterEntitiesFromUrl(enriched)
          lastEnrichedUrlHashRef.current = forHash
        } catch (error) {
          console.error("Error enriching filter entities from URL:", error)
          if (enrichGenRef.current === gen) {
            setFilterEntitiesEnriching(false)
          }
        }
      })()
    }

    if (!hasActiveSearchParams(rawParams)) {
      const liveState = useAnnotationsFiltersStore.getState()
      if (liveState.hasActiveFilters()) {
        const optimisticParams = buildSerializedQueryFromStore()
        lastAppliedUrlHashRef.current = getFilterSearchParamsHash(optimisticParams)
        commitFiltersToUrl()
        setFiltersReady(true)
        return
      }
    }

    const state = useAnnotationsFiltersStore.getState()
    const storeHash = getStoreUrlHash(getStoreFiltersSnapshot(), {
      sortOption: state.sortOption,
    })

    // Already applied this URL — still ensure labels enrich when store matches.
    if (urlHash === storeHash && urlHash === lastAppliedUrlHashRef.current) {
      setFiltersReady(true)
      setLastKnownSearchParams(filterQs)
      runBackgroundEnrich(urlHash)
      return
    }

    // URL hash unchanged and filters ready: enrich only if store still matches URL.
    if (urlHash === lastAppliedUrlHashRef.current && state.filtersReady) {
      if (storeHash === urlHash) {
        runBackgroundEnrich(urlHash)
      }
      return
    }

    // Sync apply flag only around stub apply (not across async enrich).
    isApplyingFromUrlRef.current = true
    try {
      const stubs = parseSearchParamsToFiltersSync(rawParams)
      applyFiltersFromUrl(stubs, { incrementGeneration: true })
      lastAppliedUrlHashRef.current = urlHash
      lastEnrichedUrlHashRef.current = ""
      setLastKnownSearchParams(filterQs)
      setFiltersReady(true)

      // Gap B: rewrite legacy/non-canonical URL keys via single-flight writer
      if (browserQs !== canonicalQs) {
        scheduleAnnotationsUrlPatch(routerRef.current, {
          filters: stripUiParams(rawParams),
          annotationId: getAnnotationIdParam(rawParams),
        })
      }

      runBackgroundEnrich(urlHash)
    } finally {
      queueMicrotask(() => {
        isApplyingFromUrlRef.current = false
        flushPendingCommit()
      })
    }

    return () => {
      enrichGenRef.current += 1
    }
  }, [
    searchParams,
    applyFiltersFromUrl,
    enrichFilterEntitiesFromUrl,
    setFiltersReady,
    setLastKnownSearchParams,
    commitFiltersToUrl,
    flushPendingCommit,
    setFilterEntitiesEnriching,
  ])
}
