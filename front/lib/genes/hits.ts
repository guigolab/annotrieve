import type { HitsRow } from "@/lib/api/xrefs-types"
import type { DatabaseName } from "@/lib/constants/annotation-sources"
import { DATABASE_COLORS } from "@/lib/constants/annotation-sources"

export interface DecodedHitRow {
  annotationId: string
  taxid: number
  source: number
  /** Indexes into hits.terms. */
  matchedTerms: number[]
  /** Annotation source release date (ISO), when known. */
  releaseDate: string | null
  /** Assembly name from the annotation catalogue, when known. */
  assemblyName: string | null
}

export function decodeHitsRows(rows: HitsRow[]): DecodedHitRow[] {
  return rows.map(
    ([
      annotationId,
      taxid,
      source,
      matched,
      releaseDate,
      assemblyName,
    ]) => ({
      annotationId,
      taxid,
      source,
      matchedTerms: matched ?? [],
      releaseDate: normalizeOptionalText(releaseDate),
      assemblyName: normalizeOptionalText(assemblyName),
    }),
  )
}

function normalizeOptionalText(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  return trimmed || null
}

/** Locale date for list display; returns null when unset/unparseable. */
export function formatReleaseDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString()
}

const SOURCE_CODE_TO_DB: Record<number, DatabaseName> = {
  1: "Ensembl",
  2: "GenBank",
  3: "RefSeq",
}

export function sourceLabel(
  code: number,
  sources?: Record<string, { label: string }>,
): string {
  const fromPayload = sources?.[String(code)]?.label
  if (fromPayload) return fromPayload
  return SOURCE_CODE_TO_DB[code] ?? "Other"
}

export function sourceColor(code: number): string {
  const name = SOURCE_CODE_TO_DB[code]
  if (name) return DATABASE_COLORS[name]
  return "#94a3b8"
}
