"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { CoverageRange } from "@/lib/genes/coverage"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { taxaFromIds } from "@/lib/genes/taxa"
import {
  buildGenesQueryString,
  parseGenesSearchParams,
  resolveCoverageFromUrl,
  type GenesUrlState,
} from "@/lib/genes/url"

export type GenesHydratePayload = {
  queryNames: string[]
  excluded: Set<string>
  t: string | null
  g: string | null
  sources: Set<number> | null
  coverage: CoverageRange | null
  annotationId: string | null
  localId: number | null
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  viewRank: string | null
  raw: GenesUrlState
}

function payloadFromSearchParams(
  searchParams: URLSearchParams,
): GenesHydratePayload {
  const raw = parseGenesSearchParams(searchParams)
  return {
    queryNames: raw.names,
    excluded: new Set(raw.exclude.map((n) => n.toLowerCase())),
    t: raw.t,
    g: raw.g,
    sources: raw.sources != null ? new Set(raw.sources) : null,
    coverage: null, // resolved later when termCount known
    annotationId: raw.ann,
    localId: raw.gene,
    includeTaxa: taxaFromIds(raw.includeTaxids),
    excludeTaxa: taxaFromIds(raw.excludeTaxids),
    viewRank: raw.viewRank,
    raw,
  }
}

/**
 * Sync genes URL with store state.
 * Panel stack changes (ann/gene) use push; other changes use replace.
 * External URL changes (Back/Forward) re-hydrate the store.
 */
export function useGenesUrlSync(
  state: {
    names: string[]
    exclude: string[]
    t: string | null
    g: string | null
    sources: Set<number>
    coverage: CoverageRange | null
    termCount: number
    ann: string | null
    gene: number | null
    includeTaxids: number[]
    excludeTaxids: number[]
    viewRank: string | null
    ready: boolean
  },
  onHydrate: (parsed: GenesHydratePayload) => void,
) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hydratedRef = useRef(false)
  const prevStackRef = useRef<string>("")
  const lastWrittenQsRef = useRef<string | null>(null)

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
      return
    }
    const href = qs ? `${pathname}?${qs}` : pathname
    const stackKey = `${state.ann ?? ""}|${state.gene ?? ""}`
    const prevStack = prevStackRef.current
    const stackChanged = stackKey !== prevStack
    prevStackRef.current = stackKey
    lastWrittenQsRef.current = qs
    if (stackChanged && (state.ann || prevStack)) {
      router.push(href, { scroll: false })
    } else {
      router.replace(href, { scroll: false })
    }
  }, [
    state.names,
    state.exclude,
    state.t,
    state.g,
    state.sources,
    state.coverage,
    state.termCount,
    state.ann,
    state.gene,
    state.includeTaxids,
    state.excludeTaxids,
    state.viewRank,
    state.ready,
    pathname,
    router,
    searchParams,
  ])
}

export { resolveCoverageFromUrl }
