import type {
  Annotation,
  AnnotationBase,
  CustomAnnotation,
  FeaturesStatistics,
  FeaturesSummary,
  PortalAnnotation,
} from "@/lib/types"

export function isCustomAnnotation(a: Annotation | AnnotationBase | Record<string, unknown>): a is CustomAnnotation {
  if (a && typeof a === "object" && "kind" in a) return a.kind === "custom"
  const legacy = a as { is_custom?: boolean }
  return Boolean(legacy.is_custom)
}

export function isPortalAnnotation(a: Annotation | AnnotationBase | Record<string, unknown>): a is PortalAnnotation {
  if (a && typeof a === "object" && "kind" in a) return a.kind === "portal"
  const legacy = a as { is_custom?: boolean; organism_name?: string }
  return !legacy.is_custom && Boolean(legacy.organism_name)
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return ""
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`
}

function formatUploadedDate(iso: string): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function migrateToCustomAnnotation(raw: Record<string, unknown>): CustomAnnotation | null {
  if (!raw?.annotation_id || !raw?.features_summary) return null

  if (raw.kind === "custom") {
    return raw as unknown as CustomAnnotation
  }

  const legacy = raw as {
    is_custom?: boolean
    custom_name?: string
    organism_name?: string
    computed_at?: string
    annotation_id?: string
    features_summary?: FeaturesSummary
    features_statistics?: FeaturesStatistics
    indexed_file_info?: { uncompressed_md5?: string; file_size?: number }
    source_file_info?: { last_modified?: string }
  }

  if (!legacy.is_custom && raw.kind !== "custom") return null

  const md5 =
    legacy.indexed_file_info?.uncompressed_md5 ||
    (raw.uploaded_md5 as string) ||
    legacy.annotation_id!
  const displayName =
    (legacy.custom_name as string)?.trim() ||
    (legacy.organism_name as string)?.trim() ||
    "Custom upload"

  return {
    kind: "custom",
    annotation_id: legacy.annotation_id!,
    custom_name: displayName,
    uploaded_md5: md5,
    uploaded_at:
      (raw.uploaded_at as string) ||
      legacy.computed_at ||
      legacy.source_file_info?.last_modified ||
      new Date().toISOString(),
    uploaded_file_size:
      (raw.uploaded_file_size as number) ??
      legacy.indexed_file_info?.file_size ??
      0,
    features_summary: legacy.features_summary as FeaturesSummary,
    features_statistics: legacy.features_statistics,
  }
}

export function migrateToPortalAnnotation(raw: Record<string, unknown>): PortalAnnotation | null {
  if (!raw?.annotation_id || !raw?.features_summary) return null
  if (isCustomAnnotation(raw)) return null

  if (raw.kind === "portal") {
    return raw as unknown as PortalAnnotation
  }

  const legacy = raw as {
    is_custom?: boolean
    taxid?: string
    taxon_lineage?: string[]
    organism_name?: string
    assembly_accession?: string
    assembly_name?: string
    busco?: PortalAnnotation["busco"]
    source_file_info?: PortalAnnotation["source_file_info"]
    indexed_file_info?: PortalAnnotation["indexed_file_info"]
    features_summary?: FeaturesSummary
    features_statistics?: FeaturesStatistics
  }

  if (legacy.is_custom || !legacy.organism_name || !legacy.source_file_info) return null

  return {
    kind: "portal",
    annotation_id: raw.annotation_id as string,
    taxid: legacy.taxid ?? "",
    taxon_lineage: legacy.taxon_lineage ?? [],
    organism_name: legacy.organism_name,
    assembly_accession: legacy.assembly_accession ?? "",
    assembly_name: legacy.assembly_name ?? "",
    busco: legacy.busco,
    source_file_info: legacy.source_file_info,
    indexed_file_info: legacy.indexed_file_info as PortalAnnotation["indexed_file_info"],
    features_summary: legacy.features_summary as FeaturesSummary,
    features_statistics: legacy.features_statistics,
  }
}

export function normalizeAnnotation(raw: unknown): Annotation | null {
  if (!raw || typeof raw !== "object") return null
  const record = raw as Record<string, unknown>
  return migrateToCustomAnnotation(record) ?? migrateToPortalAnnotation(record)
}

export function getAnnotationDisplayName(a: Annotation): string {
  if (isCustomAnnotation(a)) return a.custom_name.trim() || a.annotation_id
  return a.organism_name?.trim() || a.assembly_name || a.annotation_id
}

export function getAnnotationSubtitle(a: Annotation): string {
  if (isCustomAnnotation(a)) {
    const date = formatUploadedDate(a.uploaded_at)
    const size = formatFileSize(a.uploaded_file_size)
    return size ? `${date} · ${size}` : date
  }
  const db = a.source_file_info?.database ?? "—"
  return `${a.assembly_name || a.assembly_accession} · ${db}`
}

/** Custom uploads first; stable order within each group. */
export function sortAnnotationsCustomFirst(annotations: Annotation[]): Annotation[] {
  return [...annotations].sort((a, b) => {
    const aRank = isCustomAnnotation(a) ? 0 : 1
    const bRank = isCustomAnnotation(b) ? 0 : 1
    return aRank - bRank
  })
}

/**
 * Merge favorites from cart, API, and custom-annotations store (deduped by annotation_id).
 * Custom store entries are included only when still present in the cart.
 */
export function mergeFavoriteAnnotations(
  cart: Annotation[],
  remote: PortalAnnotation[],
  customs: CustomAnnotation[],
): Annotation[] {
  const map = new Map<string, Annotation>()
  const cartIds = new Set(cart.map((a) => a.annotation_id).filter(Boolean))

  for (const ann of remote) {
    if (ann?.annotation_id) map.set(ann.annotation_id, ann)
  }

  for (const ann of cart) {
    if (!ann?.annotation_id) continue
    const normalized = normalizeAnnotation(ann) ?? ann
    const existing = map.get(ann.annotation_id)
    if (isCustomAnnotation(normalized)) {
      map.set(ann.annotation_id, normalized)
    } else if (isPortalAnnotation(normalized)) {
      map.set(
        ann.annotation_id,
        existing && isPortalAnnotation(existing)
          ? { ...existing, ...normalized, kind: "portal" as const }
          : normalized,
      )
    }
  }

  for (const ann of customs) {
    if (!ann?.annotation_id || !cartIds.has(ann.annotation_id)) continue
    map.set(ann.annotation_id, ann)
  }

  return sortAnnotationsCustomFirst(Array.from(map.values()))
}
