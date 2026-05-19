import type { CustomAnnotation, FeaturesStatistics, FeaturesSummary } from "@/lib/types"
import type { UploadSession } from "@/lib/stores/custom-annotations"
import { migrateToCustomAnnotation } from "@/lib/annotation-display"

export const TERMINAL_JOB_STATES = new Set(["SUCCESS", "FAILURE", "REVOKED"])

export type UploadHeaderPhase = "idle" | "loading" | "confirm" | "error"

export function getUploadHeaderPhase(
  session: UploadSession,
  submitting: boolean,
): UploadHeaderPhase {
  if (session.result) return "confirm"
  if (submitting) return "loading"

  const state = (session.jobState || "").toUpperCase()
  if (session.jobId) {
    if (state === "FAILURE" || state === "REVOKED") return "error"
    if (state !== "SUCCESS") return "loading"
  }

  return "idle"
}

export function taskResultToAnnotation(
  payload: Record<string, unknown>,
  customName: string,
): CustomAnnotation {
  const indexed = payload.indexed_file_info as
    | { uncompressed_md5?: string; file_size?: number }
    | undefined
  const md5 =
    (payload.annotation_id as string) || indexed?.uncompressed_md5 || ""
  const displayName = customName.trim() || (payload.custom_name as string) || "Custom upload"

  return {
    kind: "custom",
    annotation_id: md5,
    custom_name: displayName,
    uploaded_md5: md5,
    uploaded_at: (payload.computed_at as string) ?? new Date().toISOString(),
    uploaded_file_size: indexed?.file_size ?? 0,
    features_summary: payload.features_summary as FeaturesSummary,
    features_statistics: payload.features_statistics as FeaturesStatistics | undefined,
  }
}

export function annotationFromJson(
  parsed: Record<string, unknown>,
  customName: string,
): CustomAnnotation {
  const migrated = migrateToCustomAnnotation(parsed)
  if (migrated) {
    const displayName = customName.trim() || migrated.custom_name
    return { ...migrated, custom_name: displayName }
  }

  const indexed = parsed.indexed_file_info as
    | { uncompressed_md5?: string; file_size?: number }
    | undefined
  const md5 = indexed?.uncompressed_md5 || (parsed.annotation_id as string)
  const displayName = customName.trim() || (parsed.custom_name as string) || "Custom upload"

  if (!md5 || !parsed.features_summary) {
    throw new Error("JSON must include features_summary and indexed_file_info.uncompressed_md5 (or annotation_id).")
  }

  return {
    kind: "custom",
    annotation_id: md5,
    custom_name: displayName,
    uploaded_md5: md5,
    uploaded_at: (parsed.computed_at as string) ?? new Date().toISOString(),
    uploaded_file_size: indexed?.file_size ?? (parsed.uploaded_file_size as number) ?? 0,
    features_summary: parsed.features_summary as FeaturesSummary,
    features_statistics: parsed.features_statistics as FeaturesStatistics | undefined,
  }
}

export function getLoadingLabel(session: UploadSession, submitting: boolean): string {
  if (submitting) return "Uploading…"
  const step = session.jobStep?.replace(/_/g, " ")
  if (step) return `Computing… (${step})`
  const state = session.jobState || "PENDING"
  return `Computing… (${state})`
}
