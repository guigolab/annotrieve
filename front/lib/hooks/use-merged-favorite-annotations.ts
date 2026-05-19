"use client"

import { useState, useEffect, useMemo } from "react"
import { listAnnotationsByMd5Checksums } from "@/lib/api/annotations"
import { mergeFavoriteAnnotations, migrateToPortalAnnotation } from "@/lib/annotation-display"
import type { Annotation, CustomAnnotation, PortalAnnotation } from "@/lib/types"

export interface UseMergedFavoriteAnnotationsOptions {
  favoriteSelections: Annotation[]
  customAnnotations: CustomAnnotation[]
  /** Bump to force a refetch (e.g. after refresh on favorites page). */
  refreshToken?: number
}

/**
 * Loads portal favorites by MD5 via POST /annotations, then merges with cart and custom uploads.
 */
export function useMergedFavoriteAnnotations({
  favoriteSelections,
  customAnnotations,
  refreshToken = 0,
}: UseMergedFavoriteAnnotationsOptions) {
  const favoriteIds = useMemo(() => {
    const unique = new Set<string>()
    favoriteSelections.forEach((annotation) => {
      if (annotation?.annotation_id) unique.add(annotation.annotation_id)
    })
    return Array.from(unique)
  }, [favoriteSelections])

  const customIdsSet = useMemo(
    () => new Set(customAnnotations.map((a) => a.annotation_id)),
    [customAnnotations],
  )

  const remoteFavoriteIds = useMemo(
    () => favoriteIds.filter((id) => !customIdsSet.has(id)),
    [favoriteIds, customIdsSet],
  )

  const [favoriteAnnotations, setFavoriteAnnotations] = useState<Annotation[]>([])
  const [totalFavorites, setTotalFavorites] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchFavorites = async () => {
      if (favoriteIds.length === 0) {
        const merged = mergeFavoriteAnnotations(favoriteSelections, [], customAnnotations)
        setFavoriteAnnotations(merged)
        setTotalFavorites(merged.length)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        let remoteResults: PortalAnnotation[] = []
        if (remoteFavoriteIds.length > 0) {
          const res = await listAnnotationsByMd5Checksums(remoteFavoriteIds, {
            limit: remoteFavoriteIds.length + 1,
            offset: 0,
          })
          if (cancelled) return
          remoteResults = ((res as { results?: unknown[] })?.results || [])
            .map((r) => migrateToPortalAnnotation(r as Record<string, unknown>))
            .filter((r): r is NonNullable<typeof r> => r != null)
          setTotalFavorites((res as any)?.total ?? remoteResults.length)
        } else {
          setTotalFavorites(favoriteIds.length)
        }
        const merged = mergeFavoriteAnnotations(
          favoriteSelections,
          remoteResults,
          customAnnotations,
        )
        if (!cancelled) setFavoriteAnnotations(merged)
      } catch (err) {
        if (cancelled) return
        console.error("Error loading favorite annotations:", err)
        const fallback = mergeFavoriteAnnotations(favoriteSelections, [], customAnnotations)
        setFavoriteAnnotations(fallback)
        setTotalFavorites(fallback.length)
        setError("Unable to load favorite annotations. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchFavorites()
    return () => {
      cancelled = true
    }
  }, [favoriteIds, remoteFavoriteIds, favoriteSelections, customAnnotations, refreshToken])

  return {
    favoriteAnnotations,
    totalFavorites,
    loading,
    error,
    favoriteIds,
    remoteFavoriteIds,
  }
}
