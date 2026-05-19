"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { FileText, Loader2 } from "lucide-react"
import { AnnotationCard } from "./annotation-card"
import type { AnnotationRecord } from "@/lib/api/types"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"

interface AnnotationsListProps {
  annotations: AnnotationRecord[]
  totalAnnotations: number
  loading: boolean
}

export function AnnotationsList({ annotations, totalAnnotations, loading }: AnnotationsListProps) {
  const currentPage = useAnnotationsFiltersStore((state) => state.page)
  const setAnnotationsPage = useAnnotationsFiltersStore((state) => state.setAnnotationsPage)
  const { isSelected: isSelectedStore } = useSelectedAnnotationsStore()
  const isSelected = (id: string) => isSelectedStore(id)

  const [accumulatedAnnotations, setAccumulatedAnnotations] = useState<AnnotationRecord[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const allAnnotations = currentPage === 1 ? annotations : accumulatedAnnotations
  const hasMore = allAnnotations.length < totalAnnotations && totalAnnotations > 0

  // Accumulate annotations for infinite scroll (page > 1)
  useEffect(() => {
    if (currentPage === 1) {
      setAccumulatedAnnotations([])
      return
    }
    if (annotations && annotations.length > 0) {
      setAccumulatedAnnotations((prev) => {
        const existingIds = new Set(prev.map((a) => a.annotation_id || a.md5_checksum || ""))
        const newAnnotations = annotations.filter((a) => {
          const id = a.annotation_id || a.md5_checksum || ""
          return id && !existingIds.has(id)
        })
        return newAnnotations.length > 0 ? [...prev, ...newAnnotations] : prev
      })
    }
  }, [annotations, currentPage])

  // Infinite scroll: load more when reaching the bottom
  useEffect(() => {
    if (loading || loadingMore || !hasMore || allAnnotations.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          setLoadingMore(true)
          setAnnotationsPage(currentPage + 1)
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) observer.observe(currentRef)
    return () => { if (currentRef) observer.unobserve(currentRef) }
  }, [hasMore, loading, loadingMore, currentPage, setAnnotationsPage, allAnnotations.length])

  // Clear loadingMore when page data arrives
  useEffect(() => {
    if (currentPage > 1 && !loading) setLoadingMore(false)
  }, [currentPage, loading])

  return (
    <div className="px-4 sm:px-6 py-4">
      {allAnnotations.length === 0 && !loading && !loadingMore ? (
        <Card className="p-12 border-2 border-dashed">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 opacity-50 mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-foreground mb-2">No Annotations Found</h4>
            <p className="text-sm max-w-md mx-auto">
              No annotations match your current filter criteria.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4">
            {allAnnotations.map((annotation) => (
              <AnnotationCard
                isSelected={isSelected(annotation.annotation_id || annotation.md5_checksum || "")}
                key={annotation.annotation_id || annotation.md5_checksum || ""}
                annotation={annotation as any}
              />
            ))}
          </div>

          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {(loadingMore || (loading && currentPage > 1)) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading more annotations...</span>
                </div>
              )}
            </div>
          )}

          {!hasMore && allAnnotations.length > 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              All {totalAnnotations.toLocaleString()} annotations loaded
            </div>
          )}
        </div>
      )}
    </div>
  )
}
