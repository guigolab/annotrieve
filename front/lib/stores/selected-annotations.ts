import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeAnnotation } from '@/lib/annotation-display'
import {
  ensureCustomMap,
  useCustomAnnotationsStore,
} from '@/lib/stores/custom-annotations'
import type { Annotation, PortalAnnotation } from '@/lib/types'

interface SelectedAnnotationsState {
  // Store annotations in a Map for efficient lookup and persistence
  annotationsCart: Map<string, Annotation>
  
  // Actions
  toggleSelection: (annotation: Annotation) => void
  addToCart: (annotation: Annotation) => void
  removeFromCart: (id: string) => void
  selectAll: (annotations: Annotation[]) => void
  selectMostRecent: (annotations: PortalAnnotation[]) => void
  clearSelection: () => void
  
  // Computed values
  isSelected: (id: string) => boolean
  getSelectedAnnotations: () => Annotation[]
  getSelectedIds: () => Set<string>
  getSelectionCount: () => number
  allSelected: (annotations: Annotation[]) => boolean
  someSelected: (annotations: Annotation[]) => boolean
}

export function ensureAnnotationMap(
  value: Map<string, Annotation> | [string, Annotation][] | unknown,
): Map<string, Annotation> {
  if (value instanceof Map) return value
  if (Array.isArray(value)) return new Map(value as [string, Annotation][])
  return new Map()
}

function removeCustomIfPresent(id: string) {
  const customMap = ensureCustomMap(useCustomAnnotationsStore.getState().customAnnotations)
  if (customMap.has(id)) {
    useCustomAnnotationsStore.getState().removeCustom(id)
  }
}

export const useSelectedAnnotationsStore = create<SelectedAnnotationsState>()(
  persist(
    (set, get) => ({
      annotationsCart: new Map<string, Annotation>(),

      toggleSelection: (annotation: Annotation) => {
        const id = annotation.annotation_id
        const wasSelected = ensureAnnotationMap(get().annotationsCart).has(id)
        set((state) => {
          const newCart = new Map(ensureAnnotationMap(state.annotationsCart))

          if (newCart.has(id)) {
            newCart.delete(id)
          } else {
            newCart.set(id, annotation)
          }

          return { annotationsCart: newCart }
        })
        if (wasSelected) {
          removeCustomIfPresent(id)
        }
      },

      addToCart: (annotation: Annotation) => {
        set((state) => {
          const newCart = new Map(ensureAnnotationMap(state.annotationsCart))
          newCart.set(annotation.annotation_id, annotation)
          return { annotationsCart: newCart }
        })
      },

      removeFromCart: (id: string) => {
        set((state) => {
          const newCart = new Map(ensureAnnotationMap(state.annotationsCart))
          newCart.delete(id)
          return { annotationsCart: newCart }
        })
        removeCustomIfPresent(id)
      },

      selectAll: (annotations: Annotation[]) => {
        set((state) => {
          const newCart = new Map(ensureAnnotationMap(state.annotationsCart))
          annotations.forEach((annotation) => {
            newCart.set(annotation.annotation_id, annotation)
          })
          return { annotationsCart: newCart }
        })
      },

      selectMostRecent: (annotations: PortalAnnotation[]) => {
        // Group by organism and select most recent (last modified) per organism
        const byOrganism = new Map<string, PortalAnnotation>()
        annotations.forEach((annotation) => {
          const existing = byOrganism.get(annotation.organism_name)
          if (!existing || new Date(annotation.source_file_info.last_modified) > new Date(existing.source_file_info.last_modified)) {
            byOrganism.set(annotation.organism_name, annotation)
          }
        })
        
        set((state) => {
          const newCart = new Map(ensureAnnotationMap(state.annotationsCart))
          byOrganism.forEach((annotation) => {
            newCart.set(annotation.annotation_id, annotation)
          })
          return { annotationsCart: newCart }
        })
      },

      clearSelection: () => {
        set({ annotationsCart: new Map() })
        useCustomAnnotationsStore.getState().pruneOrphanedCustomAnnotations(new Set())
      },

      // Computed values
      isSelected: (id: string) => {
        return ensureAnnotationMap(get().annotationsCart).has(id)
      },

      getSelectedAnnotations: () => {
        return Array.from(ensureAnnotationMap(get().annotationsCart).values())
      },

      getSelectedIds: () => {
        return new Set(ensureAnnotationMap(get().annotationsCart).keys())
      },

      getSelectionCount: () => {
        return ensureAnnotationMap(get().annotationsCart).size
      },

      allSelected: (annotations: Annotation[]) => {
        const cart = ensureAnnotationMap(get().annotationsCart)
        if (annotations.length === 0) return false
        return annotations.every(annotation => cart.has(annotation.annotation_id))
      },

      someSelected: (annotations: Annotation[]) => {
        const cart = ensureAnnotationMap(get().annotationsCart)
        const selectedOnPage = annotations.filter(annotation => cart.has(annotation.annotation_id)).length
        return selectedOnPage > 0 && selectedOnPage < annotations.length
      }
    }),
    {
      name: 'selected-annotations-storage',
      // Persist the cart as an array of annotations
      partialize: (state) => ({
        annotationsCart: Array.from(ensureAnnotationMap(state.annotationsCart).entries()),
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { annotationsCart?: [string, Annotation][] } | undefined
        const migrated = new Map<string, Annotation>()
        for (const [id, ann] of persisted?.annotationsCart ?? []) {
          const normalized = normalizeAnnotation(ann) ?? ann
          migrated.set(id, normalized)
        }
        return {
          ...currentState,
          annotationsCart: migrated,
        }
      },
    }
  )
)
