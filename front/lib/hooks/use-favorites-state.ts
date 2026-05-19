"use client"

import { useEffect, useMemo } from "react"
import {
  ensureAnnotationMap,
  useSelectedAnnotationsStore,
} from "@/lib/stores/selected-annotations"
import {
  ensureCustomMap,
  useCustomAnnotationsStore,
} from "@/lib/stores/custom-annotations"
import type { Annotation, CustomAnnotation } from "@/lib/types"

/** Reactive favorites cart (DB starred + custom in favorites). */
export function useFavoritesCart() {
  const annotationsCartRaw = useSelectedAnnotationsStore((s) => s.annotationsCart)

  const annotationsCart = useMemo(
    () => ensureAnnotationMap(annotationsCartRaw),
    [annotationsCartRaw],
  )

  const favoriteSelections = useMemo(
    () => Array.from(annotationsCart.values()),
    [annotationsCart],
  )

  const cartIds = useMemo(
    () => new Set(annotationsCart.keys()),
    [annotationsCart],
  )

  return { annotationsCart, favoriteSelections, cartIds }
}

/** All custom annotations persisted in the browser (may include orphans). */
export function useCustomAnnotationsList(): CustomAnnotation[] {
  const customMapRaw = useCustomAnnotationsStore((s) => s.customAnnotations)
  const customSize = useCustomAnnotationsStore(
    (s) => ensureCustomMap(s.customAnnotations).size,
  )

  return useMemo(() => {
    const map = ensureCustomMap(customMapRaw)
    return Array.from(map.values())
  }, [customMapRaw, customSize])
}

/** Custom annotations that are still in the favorites cart. */
export function useActiveCustomAnnotations(): CustomAnnotation[] {
  const { cartIds } = useFavoritesCart()
  const customList = useCustomAnnotationsList()

  return useMemo(
    () => customList.filter((a) => cartIds.has(a.annotation_id)),
    [customList, cartIds],
  )
}

/** Total favorites count (cart size: portal + custom). */
export function useFavoritesCount(): number {
  return useSelectedAnnotationsStore(
    (s) => ensureAnnotationMap(s.annotationsCart).size,
  )
}

/** Heal custom store entries that are no longer in the favorites cart. */
export function usePruneOrphanedCustomAnnotations(runOnMount = true) {
  const { cartIds } = useFavoritesCart()
  const prune = useCustomAnnotationsStore((s) => s.pruneOrphanedCustomAnnotations)

  useEffect(() => {
    if (!runOnMount) return
    prune(cartIds)
  }, [runOnMount, prune, cartIds])
}

/** Cart selections plus active custom list for merged favorites fetching. */
export function useFavoritesState(options?: { pruneOnMount?: boolean }) {
  const cart = useFavoritesCart()
  const activeCustomAnnotations = useActiveCustomAnnotations()
  usePruneOrphanedCustomAnnotations(options?.pruneOnMount ?? false)

  return {
    ...cart,
    activeCustomAnnotations,
    favoritesCount: cart.annotationsCart.size,
  }
}

export type { Annotation, CustomAnnotation }
