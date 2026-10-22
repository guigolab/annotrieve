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

/**
 * Sync genes URL with store state.
 * Panel stack changes (ann/gene) use push; other changes use replace.
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

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    const raw = parseGenesSearchParams(searchParams)
    const sources =
      raw.sources != null ? new Set(raw.sources) : null
    onHydrate({
      queryNames: raw.names,
      excluded: new Set(raw.exclude.map((n) => n.toLowerCase())),
      t: raw.t,
      g: raw.g,
      sources,
      coverage: null, // resolved later when termCount known
      annotationId: raw.ann,
      localId: raw.gene,
      includeTaxa: taxaFromIds(raw.includeTaxids),
      excludeTaxa: taxaFromIds(raw.excludeTaxids),
      viewRank: raw.viewRank,
      raw,
    })
  }, [searchParams, onHydrate])

  useEffect(() => {
    if (!state.ready || !hydratedRef.current) return
    const qs = buildGenesQueryString(state)
    const current = searchParams.toString()
    if (qs === current) return
    const href = qs ? `${pathname}?${qs}` : pathname
    const stackKey = `${state.ann ?? ""}|${state.gene ?? ""}`
    const stackChanged = stackKey !== prevStackRef.current
    prevStackRef.current = stackKey
    if (stackChanged && (state.ann || prevStackRef.current)) {
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
