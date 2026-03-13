"use client"

import { useMemo } from "react"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useAnnotationSubsetsStore } from "@/lib/stores/annotation-subsets"
import { buildParamsFromFilters } from "@/lib/utils"

export type DataSource = "current" | "subsets"

export interface ParamsEntry {
  id: string
  name: string
  color?: string
  params: Record<string, any>
}

interface UseAnalyticsDataOptions {
  dataSource: DataSource
  selectedSubsetIds: string[]
}

/**
 * Returns a stable list of { id, name, color, params } entries for fetching stats.
 * - "current"  → single entry built from the active annotations-filters store.
 * - "subsets"  → one entry per selected saved subset.
 */
export function useAnalyticsData({
  dataSource,
  selectedSubsetIds,
}: UseAnalyticsDataOptions): ParamsEntry[] {
  const buildAnnotationsParams = useAnnotationsFiltersStore(
    (state) => state.buildAnnotationsParams
  )
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)

  return useMemo<ParamsEntry[]>(() => {
    if (dataSource === "current") {
      const params = buildAnnotationsParams(false, [])
      delete params.limit
      delete params.offset
      return [{ id: "current", name: "Current filters", params }]
    }

    return subsets
      .filter((s) => selectedSubsetIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        params: buildParamsFromFilters(s.filters),
      }))
  }, [dataSource, selectedSubsetIds, subsets, buildAnnotationsParams])
}
