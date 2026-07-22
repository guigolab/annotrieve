/**
 * Single-flight URL writer for /annotations.
 * Coalesces filter + annotation_id patches and always composes from the live query.
 */

import {
  ANNOTATION_ID_PARAM,
  ANNOTATIONS_LIST_PATH,
  getAnnotationIdParam,
  normalizeSearchParams,
  stripUiParams,
  withAnnotationIdParam,
} from "@/lib/annotations-url"

export type AnnotationsRouter = {
  replace: (href: string, options?: { scroll?: boolean }) => void
}

export type AnnotationsUrlPatch = {
  /** Replace filter/sort params (UI params taken from live URL unless annotationId set). */
  filters?: URLSearchParams
  /** Set, clear (null), or leave unchanged (omit). */
  annotationId?: string | null
}

/** Last known query string (no leading ?), updated from React and after writes. */
let latestSearch = ""

let pendingPatch: AnnotationsUrlPatch | null = null
let flushScheduled = false
let routerRef: AnnotationsRouter | null = null

/** Suppress overview auto-open until URL clear settles (or user opens again). */
let suppressOverviewOpen = false

/** Notify writer of the current React searchParams (no leading ?). */
export function syncLatestAnnotationsSearch(search: string | URLSearchParams | null | undefined) {
  if (search == null) {
    latestSearch = ""
    return
  }
  const raw = typeof search === "string" ? search : search.toString()
  latestSearch = raw.startsWith("?") ? raw.slice(1) : raw
}

/** Live query: prefer tracked latest, fall back to window.location on /annotations. */
export function getLiveAnnotationsSearchParams(): URLSearchParams {
  if (latestSearch) {
    return new URLSearchParams(latestSearch)
  }
  if (typeof window !== "undefined") {
    const path = window.location.pathname
    if (path === "/annotations" || path === "/annotations/" || path.endsWith("/annotations/")) {
      return new URLSearchParams(window.location.search.slice(1))
    }
  }
  return new URLSearchParams()
}

function mergePatch(
  existing: AnnotationsUrlPatch | null,
  incoming: AnnotationsUrlPatch
): AnnotationsUrlPatch {
  return {
    filters: incoming.filters !== undefined ? incoming.filters : existing?.filters,
    annotationId:
      incoming.annotationId !== undefined ? incoming.annotationId : existing?.annotationId,
  }
}

function composePatchedUrl(patch: AnnotationsUrlPatch): string {
  const live = getLiveAnnotationsSearchParams()
  let next: URLSearchParams

  if (patch.filters !== undefined) {
    const filterOnly = stripUiParams(normalizeSearchParams(patch.filters))
    next = new URLSearchParams(filterOnly.toString())
    const id =
      patch.annotationId !== undefined ? patch.annotationId : getAnnotationIdParam(live)
    if (id) {
      next.set(ANNOTATION_ID_PARAM, id)
    } else {
      next.delete(ANNOTATION_ID_PARAM)
    }
  } else if (patch.annotationId !== undefined) {
    next = withAnnotationIdParam(live, patch.annotationId)
  } else {
    next = new URLSearchParams(live.toString())
  }

  const qs = next.toString()
  return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
}

function flushAnnotationsUrlPatch() {
  flushScheduled = false
  const patch = pendingPatch
  pendingPatch = null
  const router = routerRef
  if (!patch || !router) return
  if (patch.filters === undefined && patch.annotationId === undefined) return

  const href = composePatchedUrl(patch)
  const nextQs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : ""
  const liveQs = getLiveAnnotationsSearchParams().toString()

  // Optimistic: keep latest in sync even if replace is a no-op
  syncLatestAnnotationsSearch(nextQs)

  if (nextQs === liveQs) return

  router.replace(href, { scroll: false })
}

/**
 * Coalesce patches into one microtask flush so filter + overview writers
 * cannot interleave partial snapshots.
 */
export function scheduleAnnotationsUrlPatch(
  router: AnnotationsRouter,
  patch: AnnotationsUrlPatch
) {
  routerRef = router
  pendingPatch = mergePatch(pendingPatch, patch)
  if (!flushScheduled) {
    flushScheduled = true
    queueMicrotask(flushAnnotationsUrlPatch)
  }
}

/** Replace filter/sort query; preserves live annotation_id unless patched in the same tick. */
export function patchFilterQuery(router: AnnotationsRouter, filterParams: URLSearchParams) {
  scheduleAnnotationsUrlPatch(router, { filters: filterParams })
}

/** Set or clear annotation_id using the live filter query. */
export function patchAnnotationOverviewId(
  router: AnnotationsRouter,
  annotationId: string | null
) {
  scheduleAnnotationsUrlPatch(router, { annotationId })
}

/** User intentionally opened overview (Details / setAnnotationOverviewId). */
export function noteOverviewOpenIntent() {
  suppressOverviewOpen = false
}

/** User dismissed overview; block auto-reopen until URL clear settles. */
export function noteOverviewDismissIntent() {
  suppressOverviewOpen = true
}

/** Call when URL has no annotation_id (clear settled) or before intentional open. */
export function clearOverviewOpenSuppression() {
  suppressOverviewOpen = false
}

export function shouldSuppressOverviewOpen(): boolean {
  return suppressOverviewOpen
}

/** Cancel a queued patch without writing the URL (e.g. leaving /annotations). */
export function cancelPendingAnnotationsUrlPatches() {
  pendingPatch = null
  flushScheduled = false
}

/** Test helpers */
export function __resetAnnotationsUrlWriterForTests() {
  latestSearch = ""
  pendingPatch = null
  flushScheduled = false
  routerRef = null
  suppressOverviewOpen = false
}

export function __getPendingPatchForTests() {
  return pendingPatch
}

export function __flushAnnotationsUrlPatchForTests() {
  if (flushScheduled) {
    flushAnnotationsUrlPatch()
  }
}
