"use client"

import { useCallback, useEffect, useState } from "react"
import { getUploadJobStatus, getUploadRateLimit, uploadCustomGff } from "@/lib/api/annotations"
import {
  annotationFromJson,
  getLoadingLabel,
  getUploadHeaderPhase,
  taskResultToAnnotation,
  TERMINAL_JOB_STATES,
} from "@/lib/custom-upload-session"
import {
  applyJsonlImportPreview,
  parseCustomAnnotationRecord,
  previewCustomAnnotationsJsonlFile,
  type JsonlDuplicateStrategy,
  type JsonlImportPreview,
} from "@/lib/custom-annotations-jsonl"
import { getAnnotationDisplayName } from "@/lib/annotation-display"
import { useCustomAnnotationsStore } from "@/lib/stores/custom-annotations"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import type { CustomAnnotation } from "@/lib/types"

export interface ImportCustomAnnotationsJsonlResult {
  imported: number
  overwritten: number
  skippedDuplicates: number
  errors: number
}

function buildExistingByMd5Map(): Map<string, CustomAnnotation> {
  const map = new Map<string, CustomAnnotation>()
  const storeMap = useCustomAnnotationsStore.getState().customAnnotations
  if (!(storeMap instanceof Map)) return map
  for (const [, ann] of storeMap.entries()) {
    const md5 = ann.uploaded_md5 || ann.annotation_id
    if (md5) map.set(md5, ann)
  }
  return map
}

export function useCustomUploadSession(
  onFavoritesChanged?: () => void,
  onAddedToFavorites?: () => void,
) {
  const uploadSession = useCustomAnnotationsStore((s) => s.uploadSession)
  const setUploadSession = useCustomAnnotationsStore((s) => s.setUploadSession)
  const clearUploadSession = useCustomAnnotationsStore((s) => s.clearUploadSession)
  const hasNameClash = useCustomAnnotationsStore((s) => s.hasNameClash)
  const findCustomByMd5 = useCustomAnnotationsStore((s) => s.findCustomByMd5)
  const addCustom = useCustomAnnotationsStore((s) => s.addCustom)
  const addToCart = useSelectedAnnotationsStore((s) => s.addToCart)

  const [submitting, setSubmitting] = useState(false)
  const [rateLimit, setRateLimit] = useState<{ used: number; remaining: number } | null>(null)
  const [duplicateExistingName, setDuplicateExistingName] = useState<string | null>(null)

  const [jsonlPreview, setJsonlPreview] = useState<JsonlImportPreview | null>(null)
  const [jsonlReviewOpen, setJsonlReviewOpen] = useState(false)
  const [jsonlFileName, setJsonlFileName] = useState<string | null>(null)
  const [jsonlImportSummary, setJsonlImportSummary] = useState<string | null>(null)
  const [jsonlParsing, setJsonlParsing] = useState(false)

  const phase = getUploadHeaderPhase(uploadSession, submitting)
  const canStartNewUpload = phase === "idle"
  const isSessionLocked = !canStartNewUpload

  useEffect(() => {
    getUploadRateLimit()
      .then((status) => setRateLimit(status))
      .catch(() => setRateLimit(null))
  }, [])

  useEffect(() => {
    const jobId = uploadSession.jobId
    if (!jobId || uploadSession.result) return

    const state = (uploadSession.jobState || "").toUpperCase()
    if (TERMINAL_JOB_STATES.has(state) && state !== "SUCCESS") return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const poll = async () => {
      if (cancelled) return
      try {
        const status = await getUploadJobStatus(jobId)
        if (cancelled) return

        const nextState = (status.state || "PENDING").toUpperCase()
        const patch: Parameters<typeof setUploadSession>[0] = { jobState: nextState }

        if (nextState === "PROGRESS") {
          const step = (status.meta as { step?: string } | undefined)?.step
          if (step) patch.jobStep = step
          patch.jobError = null
          setUploadSession(patch)
          return
        }

        if (nextState === "SUCCESS") {
          stopPolling()
          if (status.result) {
            const customName = useCustomAnnotationsStore.getState().uploadSession.customName
            patch.result = taskResultToAnnotation(
              status.result as Record<string, unknown>,
              customName,
            )
            patch.jobError = null
          } else {
            patch.jobError = "Job finished but returned no result."
          }
          setUploadSession(patch)
          return
        }

        if (TERMINAL_JOB_STATES.has(nextState)) {
          stopPolling()
          patch.jobError = status.error || "Job failed"
          setUploadSession(patch)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Error polling job status"
          setUploadSession({ jobError: message })
        }
      }
    }

    void poll()
    intervalId = setInterval(poll, 2000)

    return () => {
      cancelled = true
      stopPolling()
    }
  }, [uploadSession.jobId, uploadSession.result, setUploadSession])

  const discardSession = useCallback(() => {
    clearUploadSession()
    setSubmitting(false)
  }, [clearUploadSession])

  const finalizeAddToFavorites = useCallback(() => {
    const result = useCustomAnnotationsStore.getState().uploadSession.result
    if (!result) return
    addCustom(result)
    addToCart(result)
    clearUploadSession()
    setSubmitting(false)
    setDuplicateExistingName(null)
    onFavoritesChanged?.()
    onAddedToFavorites?.()
  }, [addCustom, addToCart, clearUploadSession, onFavoritesChanged, onAddedToFavorites])

  const confirmAddToFavorites = useCallback((): boolean => {
    const result = useCustomAnnotationsStore.getState().uploadSession.result
    if (!result) return false

    const md5 = result.uploaded_md5 || result.annotation_id
    const existing = findCustomByMd5(md5)
    if (existing) {
      const incomingName = (result.custom_name || "").trim()
      const existingName = (existing.custom_name || "").trim()
      if (incomingName.toLowerCase() !== existingName.toLowerCase()) {
        setDuplicateExistingName(getAnnotationDisplayName(existing))
        return false
      }
    }

    finalizeAddToFavorites()
    return true
  }, [findCustomByMd5, finalizeAddToFavorites])

  const confirmDuplicateOverwrite = useCallback(() => {
    finalizeAddToFavorites()
  }, [finalizeAddToFavorites])

  const dismissDuplicateDialog = useCallback(() => {
    setDuplicateExistingName(null)
  }, [])

  const submitGff = useCallback(
    async (file: File) => {
      const { customName } = useCustomAnnotationsStore.getState().uploadSession
      if (!customName.trim()) {
        setUploadSession({ jobError: "Display name is required." })
        return false
      }
      if (hasNameClash(customName)) {
        setUploadSession({ jobError: "You already have a custom annotation with this name." })
        return false
      }

      setSubmitting(true)
      setUploadSession({ jobError: null })
      try {
        const res = await uploadCustomGff(file, customName.trim())
        setUploadSession({
          jobId: res.task_id,
          jobState: "PENDING",
          jobStep: null,
          gffFileName: file.name,
        })
        if (rateLimit) {
          setRateLimit({ used: rateLimit.used + 1, remaining: res.remaining_quota })
        }
        return true
      } catch (err: unknown) {
        setUploadSession({
          jobError: err instanceof Error ? err.message : "Upload failed",
        })
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [hasNameClash, rateLimit, setUploadSession],
  )

  const submitJson = useCallback(() => {
    const { customName, jsonText } = useCustomAnnotationsStore.getState().uploadSession
    if (!customName.trim()) {
      setUploadSession({ jobError: "Display name is required." })
      return false
    }
    if (hasNameClash(customName)) {
      setUploadSession({ jobError: "You already have a custom annotation with this name." })
      return false
    }
    if (!jsonText.trim()) {
      setUploadSession({ jobError: "Please paste or upload a JSON payload." })
      return false
    }
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("JSON must be a single object.")
      }
      const result = parseCustomAnnotationRecord(parsed)
      if (!result.ok) {
        throw new Error(result.errors.join("; "))
      }
      const ann = annotationFromJson(
        { ...parsed, custom_name: customName.trim() || result.annotation.custom_name },
        customName.trim(),
      )
      setUploadSession({
        result: ann,
        jobId: null,
        jobState: null,
        jobStep: null,
        jobError: null,
      })
      return true
    } catch (err: unknown) {
      setUploadSession({
        jobError: err instanceof Error ? err.message : "Invalid JSON payload.",
      })
      return false
    }
  }, [hasNameClash, setUploadSession])

  const previewJsonlImport = useCallback(async (file: File): Promise<JsonlImportPreview> => {
    setJsonlParsing(true)
    setJsonlImportSummary(null)
    try {
      const existingByMd5 = buildExistingByMd5Map()
      const preview = await previewCustomAnnotationsJsonlFile(file, existingByMd5)
      setJsonlFileName(file.name)
      setJsonlPreview(preview)
      setJsonlReviewOpen(true)
      return preview
    } finally {
      setJsonlParsing(false)
    }
  }, [])

  const dismissJsonlReview = useCallback(() => {
    setJsonlReviewOpen(false)
    setJsonlPreview(null)
    setJsonlFileName(null)
  }, [])

  const commitJsonlImport = useCallback(
    (strategy: JsonlDuplicateStrategy): ImportCustomAnnotationsJsonlResult | null => {
      if (!jsonlPreview) return null

      const addAnnotation = (ann: CustomAnnotation) => {
        addCustom(ann)
        addToCart(ann)
      }

      const { imported, overwritten, skippedDuplicates } = applyJsonlImportPreview(
        jsonlPreview,
        strategy,
        addAnnotation,
      )

      if (imported > 0 || overwritten > 0) {
        onFavoritesChanged?.()
      }

      const parts: string[] = []
      if (imported > 0) {
        parts.push(`Added ${imported} new annotation${imported !== 1 ? "s" : ""}`)
      }
      if (overwritten > 0) {
        parts.push(`Updated ${overwritten} duplicate${overwritten !== 1 ? "s" : ""}`)
      }
      if (skippedDuplicates > 0) {
        parts.push(`Skipped ${skippedDuplicates} duplicate${skippedDuplicates !== 1 ? "s" : ""}`)
      }
      if (jsonlPreview.errors.length > 0) {
        parts.push(`${jsonlPreview.errors.length} invalid line${jsonlPreview.errors.length !== 1 ? "s" : ""} ignored`)
      }
      setJsonlImportSummary(parts.length > 0 ? parts.join(". ") + "." : "Nothing was imported.")

      dismissJsonlReview()
      return {
        imported,
        overwritten,
        skippedDuplicates,
        errors: jsonlPreview.errors.length,
      }
    },
    [jsonlPreview, addCustom, addToCart, onFavoritesChanged, dismissJsonlReview],
  )

  const loadingLabel = getLoadingLabel(uploadSession, submitting)

  return {
    uploadSession,
    phase,
    submitting,
    rateLimit,
    canStartNewUpload,
    isSessionLocked,
    loadingLabel,
    setUploadSession,
    discardSession,
    confirmAddToFavorites,
    confirmDuplicateOverwrite,
    dismissDuplicateDialog,
    duplicateExistingName,
    submitGff,
    submitJson,
    previewJsonlImport,
    commitJsonlImport,
    dismissJsonlReview,
    jsonlPreview,
    jsonlReviewOpen,
    jsonlFileName,
    jsonlImportSummary,
    jsonlParsing,
    hasNameClash,
  }
}

export type CustomUploadSessionValue = ReturnType<typeof useCustomUploadSession>
