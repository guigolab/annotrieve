"use client"

import { useState, useEffect, useMemo } from "react"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import {
  getGeneCategoryMetricValues,
  getTranscriptTypeMetricValues,
} from "@/lib/api/annotations"

export type EntityType = "genes" | "transcripts"

export interface FavoritesReferenceData {
  values: number[]
  mean: number | null
  median: number | null
  loading: boolean
  error: string | null
}

interface UseFavoritesReferenceDataOptions {
  enabled: boolean
  entityType: EntityType
  categoryOrType: string
  metric: string
}

/**
 * Fetches metric values for the user's starred (favorites) annotations so they
 * can be rendered as reference lines on the analytics charts.
 */
export function useFavoritesReferenceData({
  enabled,
  entityType,
  categoryOrType,
  metric,
}: UseFavoritesReferenceDataOptions): FavoritesReferenceData {
  const [values, setValues] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getSelectedIds = useSelectedAnnotationsStore((state) => state.getSelectedIds)
  const buildAnnotationsParams = useAnnotationsFiltersStore(
    (state) => state.buildAnnotationsParams
  )

  const favoriteIds = useMemo(() => {
    return Array.from(getSelectedIds())
  }, [getSelectedIds])

  useEffect(() => {
    if (!enabled || favoriteIds.length === 0 || !categoryOrType || !metric) {
      setValues([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchReference() {
      setLoading(true)
      setError(null)

      try {
        const params = buildAnnotationsParams(true, favoriteIds)
        delete params.limit
        delete params.offset

        let result: { values: number[] }
        if (entityType === "genes") {
          result = await getGeneCategoryMetricValues(categoryOrType, metric, params)
        } else {
          result = await getTranscriptTypeMetricValues(categoryOrType, metric, params)
        }

        if (!cancelled) {
          setValues(result.values.filter((v) => typeof v === "number" && isFinite(v)))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load favorites data")
          setValues([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchReference()
    return () => {
      cancelled = true
    }
  }, [enabled, entityType, categoryOrType, metric, favoriteIds.join(","), buildAnnotationsParams])

  const mean = useMemo(() => {
    if (values.length === 0) return null
    return values.reduce((a, b) => a + b, 0) / values.length
  }, [values])

  const median = useMemo(() => {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  }, [values])

  return { values, mean, median, loading, error }
}
