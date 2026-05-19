import { migrateToCustomAnnotation } from "@/lib/annotation-display"
import type { CustomAnnotation, FeaturesSummary } from "@/lib/types"

const JSONL_MIME = "application/x-ndjson"

export function serializeCustomAnnotationsToJsonl(
  annotations: CustomAnnotation[],
): string {
  return annotations.map((ann) => JSON.stringify(ann)).join("\n")
}

export function downloadCustomAnnotationsJsonl(
  annotations: CustomAnnotation[],
  filename?: string,
): void {
  if (annotations.length === 0) return
  const body = serializeCustomAnnotationsToJsonl(annotations)
  const blob = new Blob([body], { type: JSONL_MIME })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  const date = new Date().toISOString().slice(0, 10)
  link.download = filename ?? `annotrieve-custom-annotations-${date}.jsonl`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export interface JsonlLineError {
  line: number
  message: string
}

export interface JsonlDuplicateConflict {
  line: number
  incoming: CustomAnnotation
  existing: CustomAnnotation
}

export type JsonlDuplicateStrategy = "skip" | "overwrite"

export interface JsonlImportPreview {
  totalNonEmptyLines: number
  newAnnotations: CustomAnnotation[]
  duplicates: JsonlDuplicateConflict[]
  errors: JsonlLineError[]
}

export type ParseCustomAnnotationResult =
  | { ok: true; annotation: CustomAnnotation }
  | { ok: false; errors: string[] }

function hasFeaturesSummary(value: unknown): value is FeaturesSummary {
  if (!value || typeof value !== "object") return false
  const s = value as FeaturesSummary
  return Array.isArray(s.types) && Array.isArray(s.sources)
}

export function parseCustomAnnotationRecord(
  parsed: Record<string, unknown>,
): ParseCustomAnnotationResult {
  const errors: string[] = []

  const migrated = migrateToCustomAnnotation(parsed)
  if (!migrated) {
    if (!parsed.features_summary) {
      errors.push("missing features_summary")
    } else if (!hasFeaturesSummary(parsed.features_summary)) {
      errors.push("features_summary must include types and sources arrays")
    }
    if (!parsed.custom_name && !parsed.organism_name) {
      errors.push("missing custom_name")
    }
    const md5 =
      (parsed.uploaded_md5 as string) ||
      (parsed.annotation_id as string) ||
      (parsed.indexed_file_info as { uncompressed_md5?: string } | undefined)?.uncompressed_md5
    if (!md5) {
      errors.push("missing uploaded_md5 or annotation_id")
    }
    if (errors.length === 0) {
      errors.push("not a valid custom annotation object")
    }
    return { ok: false, errors }
  }

  const ann = migrated
  if (!ann.custom_name?.trim()) errors.push("custom_name cannot be empty")
  if (!ann.uploaded_md5?.trim()) errors.push("uploaded_md5 cannot be empty")
  if (!hasFeaturesSummary(ann.features_summary)) {
    errors.push("features_summary must include types and sources")
  }
  if (ann.uploaded_file_size == null || Number.isNaN(Number(ann.uploaded_file_size))) {
    errors.push("uploaded_file_size must be a number")
  }
  if (!ann.uploaded_at?.trim()) errors.push("uploaded_at is required")

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, annotation: ann }
}

export function parseCustomAnnotationsJsonl(text: string): {
  annotations: CustomAnnotation[]
  errors: JsonlLineError[]
} {
  const preview = previewCustomAnnotationsJsonlImport(text, new Map())
  return {
    annotations: [
      ...preview.newAnnotations,
      ...preview.duplicates.map((d) => d.incoming),
    ],
    errors: preview.errors,
  }
}

export function previewCustomAnnotationsJsonlImport(
  text: string,
  existingByMd5: Map<string, CustomAnnotation>,
): JsonlImportPreview {
  const newAnnotations: CustomAnnotation[] = []
  const duplicates: JsonlDuplicateConflict[] = []
  const errors: JsonlLineError[] = []
  const seenInFile = new Map<string, number>()
  const lines = text.split(/\r?\n/)
  let totalNonEmptyLines = 0

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return
    totalNonEmptyLines++
    const lineNumber = index + 1

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      errors.push({ line: lineNumber, message: "Invalid JSON on this line." })
      return
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      errors.push({ line: lineNumber, message: "Each line must be a JSON object." })
      return
    }

    const result = parseCustomAnnotationRecord(parsed)
    if (!result.ok) {
      errors.push({
        line: lineNumber,
        message: result.errors.join("; "),
      })
      return
    }

    const ann = result.annotation
    const md5 = ann.uploaded_md5 || ann.annotation_id

    const firstLine = seenInFile.get(md5)
    if (firstLine != null) {
      errors.push({
        line: lineNumber,
        message: `Duplicate of line ${firstLine} (same file content / MD5).`,
      })
      return
    }
    seenInFile.set(md5, lineNumber)

    const existing = existingByMd5.get(md5)
    if (existing) {
      duplicates.push({ line: lineNumber, incoming: ann, existing })
    } else {
      newAnnotations.push(ann)
    }
  })

  return { totalNonEmptyLines, newAnnotations, duplicates, errors }
}

export async function previewCustomAnnotationsJsonlFile(
  file: File,
  existingByMd5: Map<string, CustomAnnotation>,
): Promise<JsonlImportPreview> {
  const text = await file.text()
  return previewCustomAnnotationsJsonlImport(text, existingByMd5)
}

export interface ApplyJsonlImportResult {
  imported: number
  overwritten: number
  skippedDuplicates: number
}

export function applyJsonlImportPreview(
  preview: JsonlImportPreview,
  strategy: JsonlDuplicateStrategy,
  addAnnotation: (ann: CustomAnnotation) => void,
): ApplyJsonlImportResult {
  let imported = 0
  let overwritten = 0
  let skippedDuplicates = 0

  for (const ann of preview.newAnnotations) {
    addAnnotation(ann)
    imported++
  }

  for (const { incoming } of preview.duplicates) {
    if (strategy === "overwrite") {
      addAnnotation(incoming)
      overwritten++
    } else {
      skippedDuplicates++
    }
  }

  return { imported, overwritten, skippedDuplicates }
}
