import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { CustomAnnotation } from "@/lib/types"
import { migrateToCustomAnnotation } from "@/lib/annotation-display"

interface JobStatus {
  state: string
  meta?: Record<string, any>
  result?: CustomAnnotation
  error?: string
}

export type UploadMode = "gff" | "json"

export interface UploadSession {
  mode: UploadMode
  customName: string
  jsonText: string
  gffFileName: string | null
  jobId: string | null
  jobState: string | null
  jobStep: string | null
  jobError: string | null
  result: CustomAnnotation | null
}

export const EMPTY_UPLOAD_SESSION: UploadSession = {
  mode: "gff",
  customName: "",
  jsonText: "",
  gffFileName: null,
  jobId: null,
  jobState: null,
  jobStep: null,
  jobError: null,
  result: null,
}

interface CustomAnnotationsState {
  customAnnotations: Map<string, CustomAnnotation>
  jobs: Record<string, JobStatus>
  uploadSession: UploadSession

  addCustom: (annotation: CustomAnnotation) => void
  removeCustom: (id: string) => void
  pruneOrphanedCustomAnnotations: (cartIds: Set<string>) => void
  hasNameClash: (name: string) => boolean
  findCustomByMd5: (md5: string) => CustomAnnotation | undefined

  setJobStatus: (taskId: string, status: JobStatus) => void
  clearJob: (taskId: string) => void

  setUploadSession: (patch: Partial<UploadSession>) => void
  clearUploadSession: () => void
}

export function ensureCustomMap(
  value: Map<string, CustomAnnotation> | [string, CustomAnnotation][] | unknown,
): Map<string, CustomAnnotation> {
  if (value instanceof Map) {
    const migrated = new Map<string, CustomAnnotation>()
    for (const [id, ann] of value.entries()) {
      const normalized =
        ann.kind === "custom"
          ? ann
          : migrateToCustomAnnotation(ann as unknown as Record<string, unknown>)
      if (normalized) migrated.set(id, normalized)
    }
    return migrated
  }
  if (Array.isArray(value)) {
    const migrated = new Map<string, CustomAnnotation>()
    for (const [id, ann] of value as [string, CustomAnnotation][]) {
      const normalized =
        ann.kind === "custom"
          ? ann
          : migrateToCustomAnnotation(ann as unknown as Record<string, unknown>)
      if (normalized) migrated.set(id, normalized)
    }
    return migrated
  }
  return new Map()
}

function migrateUploadSession(session: UploadSession | undefined): UploadSession {
  if (!session) return { ...EMPTY_UPLOAD_SESSION }
  const result =
    session.result?.kind === "custom"
      ? session.result
      : session.result
        ? migrateToCustomAnnotation(session.result as unknown as Record<string, unknown>)
        : null
  return { ...EMPTY_UPLOAD_SESSION, ...session, result: result ?? null }
}

export const useCustomAnnotationsStore = create<CustomAnnotationsState>()(
  persist(
    (set, get) => ({
      customAnnotations: new Map<string, CustomAnnotation>(),
      jobs: {},
      uploadSession: { ...EMPTY_UPLOAD_SESSION },

      addCustom: (annotation: CustomAnnotation) => {
        set((state: CustomAnnotationsState) => {
          const map = new Map(ensureCustomMap(state.customAnnotations))
          map.set(annotation.annotation_id, annotation)
          return { customAnnotations: map }
        })
      },

      removeCustom: (id: string) => {
        set((state: CustomAnnotationsState) => {
          const map = new Map(ensureCustomMap(state.customAnnotations))
          map.delete(id)
          return { customAnnotations: map }
        })
      },

      pruneOrphanedCustomAnnotations: (cartIds: Set<string>) => {
        set((state: CustomAnnotationsState) => {
          const map = new Map(ensureCustomMap(state.customAnnotations))
          let changed = false
          for (const id of map.keys()) {
            if (!cartIds.has(id)) {
              map.delete(id)
              changed = true
            }
          }
          return changed ? { customAnnotations: map } : state
        })
      },

      hasNameClash: (name: string) => {
        const trimmed = name.trim().toLowerCase()
        if (!trimmed) return false
        for (const ann of ensureCustomMap(get().customAnnotations).values()) {
          if (ann.custom_name.trim().toLowerCase() === trimmed) {
            return true
          }
        }
        return false
      },

      findCustomByMd5: (md5: string) => {
        if (!md5) return undefined
        for (const ann of ensureCustomMap(get().customAnnotations).values()) {
          if (ann.uploaded_md5 === md5 || ann.annotation_id === md5) {
            return ann
          }
        }
        return undefined
      },

      setJobStatus: (taskId: string, status: JobStatus) => {
        set((state: CustomAnnotationsState) => ({
          jobs: {
            ...state.jobs,
            [taskId]: status,
          },
        }))
      },

      clearJob: (taskId: string) => {
        set((state: CustomAnnotationsState) => {
          const { [taskId]: _, ...rest } = state.jobs
          return { jobs: rest }
        })
      },

      setUploadSession: (patch: Partial<UploadSession>) => {
        set((state: CustomAnnotationsState) => ({
          uploadSession: { ...state.uploadSession, ...patch },
        }))
      },

      clearUploadSession: () => {
        set({ uploadSession: { ...EMPTY_UPLOAD_SESSION } })
      },
    }),
    {
      name: "custom-annotations-storage",
      partialize: (state: CustomAnnotationsState) => ({
        customAnnotations: Array.from(ensureCustomMap(state.customAnnotations).entries()),
        uploadSession: state.uploadSession,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as {
          customAnnotations?: [string, CustomAnnotation][]
          uploadSession?: UploadSession
        } | undefined
        return {
          ...currentState,
          customAnnotations: ensureCustomMap(persisted?.customAnnotations ?? []),
          uploadSession: migrateUploadSession(persisted?.uploadSession),
        }
      },
    },
  ),
)
