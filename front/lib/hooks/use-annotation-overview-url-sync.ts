"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ANNOTATIONS_LIST_PATH,
  getAnnotationIdParam,
} from "@/lib/annotations-url"
import {
  clearOverviewOpenSuppression,
  noteOverviewDismissIntent,
  noteOverviewOpenIntent,
  patchAnnotationOverviewId,
  shouldSuppressOverviewOpen,
  syncLatestAnnotationsSearch,
} from "@/lib/annotations-url-writer"
import { getAnnotation } from "@/lib/api/annotations"
import {
  isPortalAnnotation,
  migrateToPortalAnnotation,
  normalizeAnnotation,
} from "@/lib/annotation-display"
import type { PortalAnnotation } from "@/lib/types"
import { useUIStore } from "@/lib/stores/ui"

type AppRouter = ReturnType<typeof useRouter>

function toPortalAnnotation(raw: unknown): PortalAnnotation | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  const migrated = migrateToPortalAnnotation(record) ?? normalizeAnnotation(record)
  if (migrated && isPortalAnnotation(migrated)) return migrated
  if (record.annotation_id && record.features_summary && record.organism_name) {
    return {
      ...record,
      kind: "portal",
    } as PortalAnnotation
  }
  return null
}

function getShownOverviewAnnotationId(): string | null {
  const { rightSidebar } = useUIStore.getState()
  if (
    !rightSidebar.isOpen ||
    rightSidebar.view !== "file-overview" ||
    !rightSidebar.data.annotation?.annotation_id
  ) {
    return null
  }
  return String(rightSidebar.data.annotation.annotation_id)
}

function canAutoOpenOverview(): boolean {
  if (shouldSuppressOverviewOpen()) return false
  const { rightSidebar } = useUIStore.getState()
  // Never steal assemblies-list or other non-overview views
  if (rightSidebar.isOpen && rightSidebar.view && rightSidebar.view !== "file-overview") {
    return false
  }
  return true
}

/** Set annotation_id in the annotations list URL (source of truth for open). */
export function setAnnotationOverviewId(
  router: AppRouter,
  _searchParams: URLSearchParams | string | null | undefined,
  annotationId: string
) {
  noteOverviewOpenIntent()
  patchAnnotationOverviewId(router, annotationId)
}

/** Clear annotation_id from the annotations list URL (source of truth for closed). */
export function clearAnnotationOverviewId(
  router: AppRouter,
  _searchParams?: URLSearchParams | string | null | undefined
) {
  noteOverviewDismissIntent()
  patchAnnotationOverviewId(router, null)
}

/**
 * Mirror `annotation_id` URL param → file-overview sidebar.
 * URL drives open/close; dismiss intent suppresses racy reopen until clear settles.
 */
export function useAnnotationOverviewUrlSync() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const openRightSidebar = useUIStore((s) => s.openRightSidebar)
  const closeRightSidebar = useUIStore((s) => s.closeRightSidebar)

  const urlAnnotationId = getAnnotationIdParam(searchParams?.toString() ?? "")
  const fetchGenRef = useRef(0)
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    syncLatestAnnotationsSearch(searchParams?.toString() ?? "")
  }, [searchParams])

  useEffect(() => {
    const gen = ++fetchGenRef.current

    if (!urlAnnotationId) {
      clearOverviewOpenSuppression()
      const { rightSidebar } = useUIStore.getState()
      if (rightSidebar.isOpen && rightSidebar.view === "file-overview") {
        closeRightSidebar()
      }
      return
    }

    if (getShownOverviewAnnotationId() === urlAnnotationId) {
      return
    }

    if (!canAutoOpenOverview()) {
      return
    }

    const requestedId = urlAnnotationId

    ;(async () => {
      try {
        const record = await getAnnotation(requestedId)
        if (fetchGenRef.current !== gen) return
        if (shouldSuppressOverviewOpen()) return
        if (!canAutoOpenOverview()) return

        const annotation = toPortalAnnotation(record)
        if (!annotation) {
          console.error(
            "Annotation overview deep-link: could not normalize annotation",
            requestedId
          )
          if (fetchGenRef.current === gen) {
            clearAnnotationOverviewId(routerRef.current)
          }
          return
        }

        openRightSidebar("file-overview", { annotation })
      } catch (error) {
        if (fetchGenRef.current !== gen) return
        console.error("Annotation overview deep-link: failed to load annotation", error)
        clearAnnotationOverviewId(routerRef.current)
      }
    })()

    return () => {
      if (fetchGenRef.current === gen) {
        fetchGenRef.current++
      }
    }
  }, [urlAnnotationId, openRightSidebar, closeRightSidebar])
}

/** True when pathname is the annotations list (not favorites/compare/details). */
export function isAnnotationsListPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const normalized = pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname
  return normalized === "/annotations" || pathname === ANNOTATIONS_LIST_PATH
}
