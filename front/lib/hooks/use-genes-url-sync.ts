"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type {
  AnnotationsSort,
  AnnotationsSortDir,
  GroupMode,
  KeepPolicy,
} from "@/lib/genes/annotations-controls"
import {
  DEFAULT_GROUP,
  DEFAULT_KEEP,
  DEFAULT_SORT,
  DEFAULT_SORT_DIR,
  primarySortDir,
} from "@/lib/genes/annotations-controls"
import type { CoverageRange } from "@/lib/genes/coverage"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { taxaFromIds } from "@/lib/genes/taxa"
import type { GenesListFilters } from "@/lib/genes/list-filters"
import {
  buildGenesQueryString,
  listFiltersFromUrlState,
  parseGenesSearchParams,
  resolveCoverageFromUrl,
  type GenesUrlState,
} from "@/lib/genes/url"
import {
  DEFAULT_COUNT_UNIT,
  resolveViewFromUrl,
  type CountUnit,
  type GenesView,
} from "@/lib/genes/view"

export type GenesHydratePayload = {
  queryNames: string[]
  excluded: Set<string>
  listFilters: GenesListFilters
  sources: Set<number> | null
  coverage: CoverageRange | null
  annotationId: string | null
  localId: number | null
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  viewRank: string | null
  view: GenesView
  unit: CountUnit
  keep: KeepPolicy
  group: GroupMode
  sort: AnnotationsSort | null
  sortDir: AnnotationsSortDir
  search: string
  raw: GenesUrlState
}

function payloadFromSearchParams(
  searchParams: URLSearchParams,
): GenesHydratePayload {
  const raw = parseGenesSearchParams(searchParams)
  const listFilters = listFiltersFromUrlState(raw)
  const sort =
    raw.sort === undefined ? DEFAULT_SORT : raw.sort
  const sortDir =
    raw.sortDir ??
    (sort != null ? primarySortDir(sort) : DEFAULT_SORT_DIR)
  return {
    queryNames: raw.names,
    excluded: new Set(raw.exclude.map((n) => n.toLowerCase())),
    listFilters,
    sources: raw.sources != null ? new Set(raw.sources) : null,
    coverage: null, // resolved later when termCount known
    annotationId: raw.ann,
    localId: raw.gene,
    includeTaxa: taxaFromIds(raw.includeTaxids),
    excludeTaxa: taxaFromIds(raw.excludeTaxids),
    viewRank: raw.viewRank,
    view: resolveViewFromUrl({ view: raw.view, ann: raw.ann }),
    unit: raw.unit ?? DEFAULT_COUNT_UNIT,
    keep: raw.keep ?? DEFAULT_KEEP,
    group: raw.group ?? DEFAULT_GROUP,
    sort,
    sortDir,
    search: raw.q ?? "",
    raw,
  }
}

function stackAnn(stackKey: string): string {
  return stackKey.split("|")[0] ?? ""
}

/**
 * Sync genes URL with store state.
 * Push only when opening the drawer (`ann` appears) or changing `view`.
 * Closing the drawer uses `history.back()` when that open was pushed;
 * otherwise replace. Gene expand/collapse always replaces.
 * External URL changes (Back/Forward) re-hydrate the store.
 */
export function useGenesUrlSync(
  state: {
    names: string[]
    exclude: string[]
    listFilters: GenesListFilters
    sources: Set<number>
    coverage: CoverageRange | null
    termCount: number
    ann: string | null
    gene: number | null
    includeTaxids: number[]
    excludeTaxids: number[]
    viewRank: string | null
    view: GenesView
    unit: CountUnit
    keep: KeepPolicy
    group: GroupMode
    sort: AnnotationsSort | null
    sortDir: AnnotationsSortDir
    search: string
    ready: boolean
  },
  onHydrate: (parsed: GenesHydratePayload) => void,
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hydratedRef = useRef(false)
  const prevStackRef = useRef<string>("")
  const prevViewRef = useRef<GenesView | null>(null)
  const lastWrittenQsRef = useRef<string | null>(null)
  /** True when the current history entry was created by opening the drawer. */
  const drawerPushedRef = useRef(false)

  // Initial hydrate + Back/Forward (external URL changes).
  useEffect(() => {
    const current = searchParams.toString()
    if (!hydratedRef.current) {
      hydratedRef.current = true
      lastWrittenQsRef.current = current
      onHydrate(payloadFromSearchParams(searchParams))
      return
    }
    // Ignore our own push/replace.
    if (current === lastWrittenQsRef.current) return
    lastWrittenQsRef.current = current
    onHydrate(payloadFromSearchParams(searchParams))
  }, [searchParams, onHydrate])

  // Store → URL.
  useEffect(() => {
    if (!state.ready || !hydratedRef.current) return
    const qs = buildGenesQueryString(state)
    const current = searchParams.toString()
    if (qs === current) {
      lastWrittenQsRef.current = qs
      prevViewRef.current = state.view
      prevStackRef.current = `${state.ann ?? ""}|${state.gene ?? ""}`
      return
    }
    const href = qs ? `${pathname}?${qs}` : pathname
    const stackKey = `${state.ann ?? ""}|${state.gene ?? ""}`
    const prevStack = prevStackRef.current
    const prevAnn = stackAnn(prevStack)
    const nextAnn = state.ann ?? ""
    const annOpened = Boolean(nextAnn) && !prevAnn
    const annClosed = Boolean(prevAnn) && !nextAnn
    const viewChanged =
      prevViewRef.current != null && prevViewRef.current !== state.view

    prevStackRef.current = stackKey
    prevViewRef.current = state.view

    // Closing after a pushed open → Back (restore URL without a new entry).
    if (annClosed && drawerPushedRef.current) {
      drawerPushedRef.current = false
      router.back()
      return
    }

    if (viewChanged) {
      drawerPushedRef.current = false
    }
    if (annOpened) {
      drawerPushedRef.current = true
    }

    lastWrittenQsRef.current = qs
    if (annOpened || viewChanged) {
      router.push(href, { scroll: false })
    } else {
      router.replace(href, { scroll: false })
    }
  }, [
    state.names,
    state.exclude,
    state.listFilters,
    state.sources,
    state.coverage,
    state.termCount,
    state.ann,
    state.gene,
    state.includeTaxids,
    state.excludeTaxids,
    state.viewRank,
    state.view,
    state.unit,
    state.keep,
    state.group,
    state.sort,
    state.sortDir,
    state.search,
    state.ready,
    pathname,
    router,
    searchParams,
  ])
}

export { resolveCoverageFromUrl }
