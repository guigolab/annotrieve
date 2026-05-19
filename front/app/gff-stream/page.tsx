"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react"

import {
  listAnnotations,
  fetchAnnotationReferenceOptions,
  streamAnnotationGff,
  downloadContigs,
} from "@/lib/api/annotations"
import { getAssembly } from "@/lib/api/assemblies"
import type { MappedRegion } from "@/lib/api/annotations"
import type { AnnotationRecord } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const DEFAULT_SITE_BASE = "https://genome.crg.es/annotrieve"
const DEFAULT_BASE_PATH = "/annotrieve"
const WINDOW_CHOICES = [100000, 250000, 500000]
const MAX_EMPTY_WINDOWS = 4
const MAX_RENDERED_FEATURES = 400
const ATTRIBUTE_DISPLAY_LIMIT = 12
const ANY_OPTION_VALUE = "__any__"
const FEATURE_GRID_TEMPLATE =
  "minmax(220px,1.6fr) minmax(160px,1fr) minmax(80px,0.5fr) minmax(70px,0.45fr) minmax(120px,0.6fr) minmax(220px,1.4fr)"
const featureGridStyle: CSSProperties = {
  gridTemplateColumns: FEATURE_GRID_TEMPLATE,
}

interface IndexedAnnotationRecord extends AnnotationRecord {
  indexed_file_info?: {
    bgzipped_path?: string
    csi_path?: string
    file_size?: number
    processed_at?: string
  }
}

type GffFeature = {
  id: string
  seqid: string
  source: string
  type: string
  start: number
  end: number
  score: string | null
  strand: string | null
  phase: string | null
  attributes: Record<string, string>
  attributeCount: number
  raw: string
  dedupeKey: string
}

type ReferenceOption = Pick<MappedRegion, "sequence_id" | "aliases">

type FilterControls = {
  start: string
  end: string
  featureType: string
  featureSource: string
  biotype: string
}

const numberFormatter = Intl.NumberFormat("en-US")

const normalizedBasePath =
  (process.env.NEXT_PUBLIC_BASE_PATH ?? DEFAULT_BASE_PATH) === "/"
    ? ""
    : process.env.NEXT_PUBLIC_BASE_PATH ?? DEFAULT_BASE_PATH

function joinUrl(base: string, path: string) {
  const trimmedBase = base.replace(/\/+$/, "")
  const trimmedPath = path.replace(/^\/+/, "")
  if (!trimmedBase) {
    return `/${trimmedPath}`
  }
  return `${trimmedBase}/${trimmedPath}`
}

function resolveFilesBase(): string {
  if (typeof window === "undefined") {
    return DEFAULT_SITE_BASE
  }
  return normalizedBasePath || ""
}

function buildFileUrl(path?: string | null): string | null {
  if (!path) return null
  const normalized = path.startsWith("/") ? path : `/${path}`
  const base = resolveFilesBase()
  return joinUrl(base, `files${normalized}`)
}

function dedupeReferenceOptions(options: ReferenceOption[]): ReferenceOption[] {
  const map = new Map<string, ReferenceOption>()
  for (const option of options) {
    if (!option.sequence_id) continue
    const existing = map.get(option.sequence_id)
    if (existing) {
      const combined = new Set([...(existing.aliases ?? []), ...(option.aliases ?? [])])
      existing.aliases = Array.from(combined).filter(Boolean)
    } else {
      map.set(option.sequence_id, {
        sequence_id: option.sequence_id,
        aliases: option.aliases?.filter(Boolean),
      })
    }
  }
  return Array.from(map.values())
}

function createEmptyFilters(): FilterControls {
  return {
    start: "",
    end: "",
    featureType: "",
    featureSource: "",
    biotype: "",
  }
}

function parseBoundaryValue(value: string): number | null {
  if (!value) return null
  const parsed = Number(value.replace(/,/g, ""))
  if (Number.isNaN(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

function parseAttributes(attributes: string): {
  entries: Record<string, string>
  total: number
  idValue?: string
  nameValue?: string
} {
  const entries: Record<string, string> = {}
  let total = 0
  let added = 0
  let idValue: string | undefined
  let nameValue: string | undefined
  for (const part of attributes.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    total += 1
    const [key, ...rest] = trimmed.split("=")
    if (!key) continue
    const rawValue = rest.join("=")
    const decoded = rawValue ? decodeURIComponent(rawValue) : ""
    if (key === "ID" && idValue === undefined) {
      idValue = decoded
    }
    if (key === "Name" && nameValue === undefined) {
      nameValue = decoded
    }
    const alreadyStored = Object.prototype.hasOwnProperty.call(entries, key)
    if (key === "ID" || key === "Name" || added < ATTRIBUTE_DISPLAY_LIMIT || alreadyStored) {
      if (!alreadyStored && key !== "ID" && key !== "Name") {
        added += 1
      }
      entries[key] = decoded
    }
  }
  return { entries, total, idValue, nameValue }
}

function buildFeatureDedupeKey(seqid: string, start: number, end: number, type: string) {
  return `${seqid}:${start}-${end}:${type}`
}

function parseGffLine(line: string): GffFeature | null {
  if (!line || line.startsWith("#")) return null
  const parts = line.split("\t")
  if (parts.length < 9) return null
  const [seqid, source, type, startStr, endStr, score, strand, phase, attributes] = parts
  const start = Number(startStr)
  const end = Number(endStr)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const { entries, total, idValue, nameValue } = parseAttributes(attributes)
  const dedupeKey = buildFeatureDedupeKey(seqid, start, end, type)
  const id = idValue || nameValue || dedupeKey
  return {
    id,
    seqid,
    source,
    type,
    start,
    end,
    score: score === "." ? null : score,
    strand: strand === "." ? null : strand,
    phase: phase === "." ? null : phase,
    attributes: entries,
    attributeCount: total,
    raw: line,
    dedupeKey,
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`
}

function FeatureListHeader() {
  return (
    <div
      className="sticky top-0 z-10 hidden bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm md:grid"
      style={featureGridStyle}
    >
      {["Coordinates", "Type • source", "Strand", "Score", "Length", "Attributes"].map((label) => (
        <span key={label} className="px-4 py-2">
          {label}
        </span>
      ))}
    </div>
  )
}

function FeatureRow({ feature }: { feature: GffFeature }) {
  const attributeEntries = Object.entries(feature.attributes || {})
  const attributePreview = attributeEntries.slice(0, 3)
  const extraAttributes = Math.max(0, feature.attributeCount - attributePreview.length)
  const coordinateLabel = `${feature.seqid}:${numberFormatter.format(feature.start)}-${numberFormatter.format(feature.end)}`

  return (
    <div
      className="grid items-center gap-3 px-4 py-3 text-xs text-muted-foreground transition hover:bg-muted/40 md:text-[13px]"
      style={featureGridStyle}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-sm text-foreground">{coordinateLabel}</span>
        <span className="truncate font-mono text-[11px]" title={feature.id}>
          {feature.id}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm text-foreground">{feature.type}</span>
        <span className="truncate text-[11px] uppercase tracking-wide">{feature.source}</span>
      </div>

      <div className="flex items-center gap-2 text-foreground">
        <span className="rounded border px-2 py-0.5 font-mono text-[11px] uppercase">
          {feature.strand ?? "•"}
        </span>
        {feature.phase && (
          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">
            {feature.phase}
          </span>
        )}
      </div>

      <div className="font-mono text-sm text-foreground">{feature.score ?? "—"}</div>

      <div className="font-mono text-sm text-foreground">
        {numberFormatter.format(Math.max(0, feature.end - feature.start + 1))}
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {attributePreview.length ? (
          attributePreview.map(([key, value]) => (
            <span
              key={`${feature.id}-${key}`}
              className="rounded-full border bg-background/40 px-2 py-0.5 font-mono text-[11px] text-foreground"
              title={`${key}=${value || "—"}`}
            >
              {key}:{value || "—"}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
        {extraAttributes > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-foreground">
            +{extraAttributes} more
          </span>
        )}
      </div>
    </div>
  )
}

type FormSectionProps = {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

function FormSection({ title, description, children, footer }: FormSectionProps) {
  return (
    <section className="border-b last:border-b-0">
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="px-4 pb-4">
        <div className="space-y-4">{children}</div>
      </div>
      {footer && (
        <div className="flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          {footer}
        </div>
      )}
    </section>
  )
}

export default function GffStreamPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const annotationId = useMemo(() => searchParams?.get("id")?.trim() ?? "", [searchParams])

  const [annotation, setAnnotation] = useState<IndexedAnnotationRecord | null>(null)
  const [annotationError, setAnnotationError] = useState<string | null>(null)
  const [isAnnotationLoading, setIsAnnotationLoading] = useState(false)

  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>([])
  const [selectedReference, setSelectedReference] = useState<string>("")
  const [referenceDraft, setReferenceDraft] = useState<string>("")
  const [windowSize, setWindowSize] = useState<number>(250000)

  const [features, setFeatures] = useState<GffFeature[]>([])
  const [lastWindow, setLastWindow] = useState<{ start: number; end: number } | null>(null)
  const [isFetchingWindow, setIsFetchingWindow] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [isReferencesLoading, setIsReferencesLoading] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<FilterControls>(() => createEmptyFilters())
  const [activeFilters, setActiveFilters] = useState<FilterControls>(() => createEmptyFilters())
  const [filterError, setFilterError] = useState<string | null>(null)
  const [downloadingContigs, setDownloadingContigs] = useState(false)
  const [regionLookupError, setRegionLookupError] = useState<string | null>(null)

  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const windowCursorRef = useRef<number>(0)
  const emptyWindowCounterRef = useRef<number>(0)
  const streamingGenerationRef = useRef(0)
  const fetchNextWindowRef = useRef<(() => Promise<void>) | null>(null)
  const seenFeatureKeysRef = useRef<Set<string>>(new Set())
  const referenceEditedRef = useRef(false)

  const activeStartValue = useMemo(
    () => parseBoundaryValue(activeFilters.start),
    [activeFilters.start],
  )
  const activeEndValue = useMemo(() => parseBoundaryValue(activeFilters.end), [activeFilters.end])
  const pendingStartValue = useMemo(
    () => parseBoundaryValue(pendingFilters.start),
    [pendingFilters.start],
  )
  const pendingEndValue = useMemo(
    () => parseBoundaryValue(pendingFilters.end),
    [pendingFilters.end],
  )

  const filtersDirty =
    pendingFilters.start !== activeFilters.start ||
    pendingFilters.end !== activeFilters.end ||
    pendingFilters.featureType !== activeFilters.featureType ||
    pendingFilters.featureSource !== activeFilters.featureSource ||
    pendingFilters.biotype !== activeFilters.biotype
  const hasActiveFilters = Object.values(activeFilters).some((value) => Boolean(value))
  const normalizedReference = selectedReference.trim()
  const normalizedDraftReference = referenceDraft.trim()
  const hasSelectedReference = normalizedReference.length > 0
  const hasDraftReference = normalizedDraftReference.length > 0
  const isReferenceKnown =
    hasDraftReference &&
    referenceOptions.some((option) => option.sequence_id === normalizedDraftReference)

  const featureTypes = ((annotation as any)?.features_summary?.types as string[]) ?? []
  const featureSources = ((annotation as any)?.features_summary?.sources as string[]) ?? []
  const biotypes = ((annotation as any)?.features_summary?.biotypes as string[]) ?? []

  const updateReference = useCallback(
    (value: string, options?: { immediate?: boolean; fromUser?: boolean }) => {
      const immediate = options?.immediate ?? false
      const fromUser = options?.fromUser ?? false
      if (fromUser) {
        referenceEditedRef.current = true
      }
      setReferenceDraft(value)
      if (immediate) {
        setSelectedReference(value)
      }
    },
    [],
  )

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSelectedReference(referenceDraft)
    }, 400)
    return () => {
      window.clearTimeout(handler)
    }
  }, [referenceDraft])

  const handleFilterChange = (key: keyof FilterControls, value: string) => {
    setFilterError(null)
    setPendingFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  const handleApplyFilters = () => {
    if (
      pendingStartValue !== null &&
      pendingEndValue !== null &&
      pendingStartValue > pendingEndValue
    ) {
      setFilterError("Start must be less than or equal to end.")
      return
    }
    setFilterError(null)
    setActiveFilters({ ...pendingFilters })
  }

  const handleResetFilters = () => {
    const empty = createEmptyFilters()
    setPendingFilters(empty)
    setActiveFilters(empty)
    setFilterError(null)
  }

  const handleDownloadContigs = async () => {
    if (!annotation?.annotation_id || downloadingContigs) return
    try {
      setDownloadingContigs(true)
      const response = await downloadContigs(annotation.annotation_id)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to download contigs file.")
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${annotation.annotation_id}_contigs.txt`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("[GFF stream] Failed to download contigs", err)
      setAnnotationError((prev) =>
        prev ?? (err instanceof Error ? err.message : "Failed to download contigs file."),
      )
    } finally {
      setDownloadingContigs(false)
    }
  }

  const resetStreamingBuffers = useCallback(() => {
    streamingGenerationRef.current += 1
    setFeatures([])
    setHasMore(true)
    setLastWindow(null)
    setIsFetchingWindow(false)
    windowCursorRef.current = 0
    emptyWindowCounterRef.current = 0
    seenFeatureKeysRef.current.clear()
  }, [])

  const bgzipUrl = useMemo(
    () => buildFileUrl(annotation?.indexed_file_info?.bgzipped_path ?? null),
    [annotation?.indexed_file_info?.bgzipped_path],
  )
  const csiUrl = useMemo(
    () => buildFileUrl(annotation?.indexed_file_info?.csi_path ?? null),
    [annotation?.indexed_file_info?.csi_path],
  )

  useEffect(() => {
    const empty = createEmptyFilters()
    setPendingFilters(empty)
    setActiveFilters(empty)
    setFilterError(null)
    setRegionLookupError(null)
    referenceEditedRef.current = false
  }, [annotationId])

  useEffect(() => {
    let cancelled = false

    async function fetchMetadata() {
      if (!annotationId) {
        setAnnotation(null)
        setAnnotationError(null)
        setIsAnnotationLoading(false)
        return
      }

      try {
        setIsAnnotationLoading(true)
        setAnnotationError(null)
        const record = await listAnnotations({md5_checksums: annotationId})
        if (cancelled) return
        setAnnotation(record.results[0] as unknown as IndexedAnnotationRecord)
      } catch (err) {
        if (!cancelled) {
          console.error("[GFF stream] Failed to load annotation", err)
          setAnnotationError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setIsAnnotationLoading(false)
        }
      }
    }

    fetchMetadata()
    return () => {
      cancelled = true
    }
  }, [annotationId])

  useEffect(() => {
    if (!annotationId || annotation == null || !annotation.annotation_id) {
      resetStreamingBuffers()
      setReferenceOptions([])
      referenceEditedRef.current = false
      updateReference("", { immediate: true })
      setIsReferencesLoading(false)
      return
    }

    const ann = annotation
    resetStreamingBuffers()
    const annotationMd5 = ann.annotation_id

    let cancelled = false

    async function fetchMappedRegions() {
      setIsReferencesLoading(true)
      setReferenceOptions([])
      referenceEditedRef.current = false
      updateReference("", { immediate: true })

      try {
        let pairedAccession: string | null | undefined
        if (ann.assembly_accession && ann.taxid) {
          try {
            const assembly = await getAssembly(ann.assembly_accession)
            pairedAccession = assembly.paired_assembly_accession
          } catch {
            pairedAccession = undefined
          }
        }
        if (cancelled) return

        const collected =
          ann.taxid && ann.assembly_accession
            ? await fetchAnnotationReferenceOptions(
                ann.taxid,
                ann.assembly_accession,
                annotationMd5,
                pairedAccession,
              )
            : []

        const normalized = dedupeReferenceOptions(
          collected.map((item) => ({
            sequence_id: item.sequence_id,
            aliases: item.aliases,
          })),
        )
        if (cancelled) return
        setReferenceOptions(normalized)
        if (!referenceEditedRef.current) {
          const defaultOption = normalized[0]?.sequence_id ?? ""
          if (defaultOption) {
            updateReference(defaultOption, { immediate: true })
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[GFF stream] Failed to load mapped regions", err)
          setAnnotationError((prev) =>
            prev ?? (err instanceof Error ? err.message : String(err)),
          )
          setReferenceOptions([])
        }
      } finally {
        if (!cancelled) {
          setIsReferencesLoading(false)
        }
      }
    }

    fetchMappedRegions()
    return () => {
      cancelled = true
    }
  }, [annotationId, annotation?.annotation_id, updateReference, resetStreamingBuffers])

  useEffect(() => {
    setRegionLookupError(null)
  }, [normalizedReference])

  const fetchNextWindow = useCallback(async () => {
    if (!annotationId || !hasSelectedReference) return
    if (isFetchingWindow || !hasMore) return

    const generation = streamingGenerationRef.current
    setIsFetchingWindow(true)
    const start = windowCursorRef.current

    if (activeEndValue !== null && start > activeEndValue) {
      setHasMore(false)
      setIsFetchingWindow(false)
      return
    }

    const windowEnd = activeEndValue !== null ? Math.min(start + windowSize, activeEndValue) : start + windowSize
    if (windowEnd < start) {
      setHasMore(false)
      setIsFetchingWindow(false)
      return
    }

    const featureTypeParam = activeFilters.featureType.trim()
    const featureSourceParam = activeFilters.featureSource.trim()
    const biotypeParam = activeFilters.biotype.trim()

    try {
      setRegionLookupError(null)
      const response = await streamAnnotationGff(annotationId, {
        region: normalizedReference,
        start,
        end: windowEnd,
        feature_type: featureTypeParam || undefined,
        feature_source: featureSourceParam || undefined,
        biotype: biotypeParam || undefined,
      })
      if (!response.ok) {
        const errorText = await response.text()
        if (response.status === 404) {
          setRegionLookupError(
            `Region "${normalizedReference}" was not found in this annotation.`,
          )
        }
        throw new Error(errorText || `Streaming request failed with status ${response.status}`)
      }
      setRegionLookupError(null)
      const text = await response.text()
      const chunk = text
        .split(/\r?\n/)
        .map((line) => parseGffLine(line))
        .filter((feature): feature is GffFeature => Boolean(feature))
      const seenKeys = seenFeatureKeysRef.current
      const dedupedChunk = chunk.filter((feature) => {
        if (seenKeys.has(feature.dedupeKey)) {
          return false
        }
        seenKeys.add(feature.dedupeKey)
        return true
      })

      if (streamingGenerationRef.current !== generation) {
        return
      }

      if (dedupedChunk.length === 0) {
        emptyWindowCounterRef.current += 1
        if (emptyWindowCounterRef.current >= MAX_EMPTY_WINDOWS) {
          setHasMore(false)
        }
      } else {
        emptyWindowCounterRef.current = 0
        setFeatures((prev) => {
          const next = [...prev, ...dedupedChunk]
          if (next.length > MAX_RENDERED_FEATURES) {
            return next.slice(next.length - MAX_RENDERED_FEATURES)
          }
          return next
        })
        setLastWindow({ start, end: windowEnd })
      }

      windowCursorRef.current = windowEnd + 1
      if (activeEndValue !== null && windowCursorRef.current > activeEndValue) {
        setHasMore(false)
      }
    } catch (err) {
      console.error("[GFF stream] Failed to fetch window", err)
      if (streamingGenerationRef.current === generation) {
        setAnnotationError(err instanceof Error ? err.message : String(err))
        setHasMore(false)
      }
    } finally {
      if (streamingGenerationRef.current === generation) {
        setIsFetchingWindow(false)
      }
    }
  }, [
    annotationId,
    hasMore,
    isFetchingWindow,
    hasSelectedReference,
    normalizedReference,
    windowSize,
    activeFilters.biotype,
    activeFilters.featureSource,
    activeFilters.featureType,
    activeEndValue,
  ])

  useEffect(() => {
    fetchNextWindowRef.current = fetchNextWindow
  }, [fetchNextWindow])

  useEffect(() => {
    resetStreamingBuffers()
    windowCursorRef.current = Math.max(0, activeStartValue ?? 0)
    if (!annotationId || !hasSelectedReference) {
      return
    }
    if (fetchNextWindowRef.current) {
      void fetchNextWindowRef.current()
    }
  }, [
    annotationId,
    hasSelectedReference,
    normalizedReference,
    windowSize,
    activeStartValue,
    activeEndValue,
    activeFilters.featureType,
    activeFilters.featureSource,
    activeFilters.biotype,
    resetStreamingBuffers,
  ])

  useEffect(() => {
    const sentinel = sentinelRef.current
    const scrollRoot = listContainerRef.current
    if (!hasMore || !sentinel || !scrollRoot) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && fetchNextWindowRef.current) {
          void fetchNextWindowRef.current()
        }
      },
      {
        root: scrollRoot,
        rootMargin: "200px 0px",
      },
    )
    observer.observe(sentinel)
    return () => {
      observer.disconnect()
    }
  }, [hasMore, features.length])

  const loadingState = isAnnotationLoading || !annotationId
  const missingFiles = !bgzipUrl || !csiUrl

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Badge variant="outline" className="font-mono text-xs">
            Annotation {annotationId || "—"}
          </Badge>
        </div>

        {!annotationId && (
          <Card className="p-6 text-sm text-muted-foreground">
            Provide an annotation identifier via `?id=` query parameter to initialize streaming.
          </Card>
        )}

        {annotation && (
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-foreground">{annotation.organism_name}</h1>
              {annotation.source_file_info?.database && (
                <Badge variant="secondary">{annotation.source_file_info.database}</Badge>
              )}
              {annotation.source_file_info?.provider && (
                <Badge variant="outline">{annotation.source_file_info.provider}</Badge>
              )}
            </div>
            <dl className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <div>
                <dt className="uppercase text-xs tracking-wide">Assembly</dt>
                <dd className="text-foreground">
                  {annotation.assembly_name ?? "—"} ({annotation.assembly_accession ?? "N/A"})
                </dd>
              </div>
              <div>
                <dt className="uppercase text-xs tracking-wide">BGZF Size</dt>
                <dd className="text-foreground">
                  {formatBytes(annotation.indexed_file_info?.file_size)}{" "}
                  {annotation.indexed_file_info?.processed_at && (
                    <span className="text-xs text-muted-foreground">
                      • processed{" "}
                      {new Date(annotation.indexed_file_info.processed_at).toLocaleDateString()}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="uppercase text-xs tracking-wide">Data source</dt>
                <dd className="text-foreground break-all">
                  {bgzipUrl ? (
                    <a
                      href={bgzipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {bgzipUrl}
                    </a>
                  ) : (
                    "Unavailable"
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        )}

        {(annotationError || missingFiles) && annotationId && (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Streaming unavailable</p>
                <p>
                  {annotationError
                    ? annotationError
                    : "This annotation does not expose a bgzipped GFF and CSI index."}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden border">
          <FormSection
            title="Region & window"
            description="Provide a contig (sequence ID) to begin streaming and choose how wide each request should be."
            footer={
              <>
                <span className="flex-1 min-w-[240px]">
                  Windows stream through the `/annotations/&lt;annotation_id&gt;/gff` API. Each request
                  respects the region and window size set above.
                </span>
                {annotation && (
                  <Button
                    className="gap-2"
                    variant="accent"
                    disabled={downloadingContigs}
                    onClick={handleDownloadContigs}
                  >
                    {downloadingContigs && <Loader2 className="h-4 w-4 animate-spin" />}
                    {downloadingContigs ? "Downloading contigs…" : "Download contigs"}
                  </Button>
                )}
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <div className="space-y-2">
                <Input
                  value={referenceDraft}
                  onChange={(event) => updateReference(event.target.value, { fromUser: true })}
                  placeholder="Enter a contig name (e.g. chr1, scaff_12)"
                  className="font-mono"
                  disabled={missingFiles || loadingState}
                  list={referenceOptions.length ? "reference-suggestions" : undefined}
                />
                {referenceOptions.length > 0 && (
                  <datalist id="reference-suggestions">
                    {referenceOptions.map((option) => (
                      <option key={option.sequence_id} value={option.sequence_id}>
                        {option.aliases?.join(", ")}
                      </option>
                    ))}
                  </datalist>
                )}
                {referenceOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {referenceOptions.slice(0, 8).map((option) => (
                      <button
                        key={option.sequence_id}
                        type="button"
                        className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-mono text-muted-foreground transition hover:border-border hover:text-foreground"
                        onClick={() =>
                          updateReference(option.sequence_id, { immediate: true, fromUser: true })
                        }
                      >
                        {option.sequence_id}
                      </button>
                    ))}
                    {referenceOptions.length > 8 && (
                      <span className="text-xs text-muted-foreground">
                        +{referenceOptions.length - 8} more
                      </span>
                    )}
                  </div>
                )}
                {annotationId && !referenceOptions.length && (
                  <p className="text-xs text-muted-foreground">
                    {isReferencesLoading
                      ? "Fetching mapped regions…"
                      : "No mapped regions were found. Enter the contig name manually or download the contigs file for this annotation."}
                  </p>
                )}
                {hasDraftReference && referenceOptions.length > 0 && !isReferenceKnown && (
                  <p className="text-xs text-amber-600">
                    This region is not listed among the mapped contigs. Streaming will still attempt to
                    fetch it directly.
                  </p>
                )}
                {regionLookupError && (
                  <p className="text-xs text-destructive">{regionLookupError}</p>
                )}
              </div>

              <div className="space-y-1">
                <Select
                  value={windowSize.toString()}
                  onValueChange={(value) => setWindowSize(Number(value))}
                  disabled={missingFiles || !hasDraftReference}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOW_CHOICES.map((choice) => (
                      <SelectItem key={choice} value={choice.toString()}>
                        {numberFormatter.format(choice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  Window size (bp)
                </label>
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Optional filters"
            description="Restrict streaming to a sub-interval or a specific subset of features. Leave blank to stream everything."
            footer={
              <>
                {hasActiveFilters && (
                  <span className="rounded-full bg-background/70 px-2 py-0.5 font-mono text-[11px] text-foreground">
                    {[
                      activeFilters.featureType && `type=${activeFilters.featureType}`,
                      activeFilters.featureSource && `source=${activeFilters.featureSource}`,
                      activeFilters.biotype && `biotype=${activeFilters.biotype}`,
                      activeStartValue !== null && `start≥${numberFormatter.format(activeStartValue)}`,
                      activeEndValue !== null && `end≤${numberFormatter.format(activeEndValue)}`,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleApplyFilters}
                    disabled={!filtersDirty || !hasDraftReference}
                  >
                    Apply filters
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleResetFilters}
                    disabled={!filtersDirty && !hasActiveFilters}
                  >
                    Reset
                  </Button>
                </div>
              </>
            }
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  Start boundary (bp)
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  placeholder="e.g. 1,000,000"
                  value={pendingFilters.start}
                  onChange={(event) => handleFilterChange("start", event.target.value)}
                  disabled={!hasDraftReference}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  End boundary (bp)
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  placeholder="e.g. 1,200,000"
                  value={pendingFilters.end}
                  onChange={(event) => handleFilterChange("end", event.target.value)}
                  disabled={!hasDraftReference}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  Feature type filter
                </label>
                {featureTypes.length ? (
                  <Select
                    value={pendingFilters.featureType || ANY_OPTION_VALUE}
                    onValueChange={(value) =>
                      handleFilterChange("featureType", value === ANY_OPTION_VALUE ? "" : value)
                    }
                    disabled={!hasDraftReference}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any feature type" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={ANY_OPTION_VALUE}>Any feature type</SelectItem>
                      {featureTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="gene, mRNA, CDS…"
                    value={pendingFilters.featureType}
                    onChange={(event) => handleFilterChange("featureType", event.target.value)}
                    disabled={!hasDraftReference}
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">
                  Feature source filter
                </label>
                {featureSources.length ? (
                  <Select
                    value={pendingFilters.featureSource || ANY_OPTION_VALUE}
                    onValueChange={(value) =>
                      handleFilterChange("featureSource", value === ANY_OPTION_VALUE ? "" : value)
                    }
                    disabled={!hasDraftReference}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any source" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={ANY_OPTION_VALUE}>Any source</SelectItem>
                      {featureSources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Ensembl, RefSeq…"
                    value={pendingFilters.featureSource}
                    onChange={(event) => handleFilterChange("featureSource", event.target.value)}
                    disabled={!hasDraftReference}
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase text-muted-foreground">Biotype</label>
                {biotypes.length ? (
                  <Select
                    value={pendingFilters.biotype || ANY_OPTION_VALUE}
                    onValueChange={(value) =>
                      handleFilterChange("biotype", value === ANY_OPTION_VALUE ? "" : value)
                    }
                    disabled={!hasDraftReference}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any biotype" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={ANY_OPTION_VALUE}>Any biotype</SelectItem>
                      {biotypes.map((bt) => (
                        <SelectItem key={bt} value={bt}>
                          {bt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="protein_coding, rRNA…"
                    value={pendingFilters.biotype}
                    onChange={(event) => handleFilterChange("biotype", event.target.value)}
                    disabled={!hasDraftReference}
                  />
                )}
              </div>
            </div>

            {filterError && <p className="text-xs text-destructive">{filterError}</p>}
          </FormSection>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
            {hasSelectedReference && lastWindow
              ? `Viewing ${normalizedReference}:${numberFormatter.format(lastWindow.start + 1)}-${numberFormatter.format(lastWindow.end)}`
              : "Enter a contig to start streaming"}
          </div>

          <div className="flex flex-col">
            <FeatureListHeader />
            <div
              ref={listContainerRef}
              className={cn(
                "max-h-[70vh] overflow-x-auto overflow-y-auto border-b border-border/40",
                !features.length && "min-h-[320px]",
              )}
            >
              {features.length > 0 ? (
                <div className="divide-y">
                  {features.map((feature) => (
                    <FeatureRow key={feature.dedupeKey} feature={feature} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-sm text-muted-foreground">
                  {hasSelectedReference && (isFetchingWindow || loadingState) ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p>Streaming GFF lines…</p>
                    </>
                  ) : loadingState && annotationId ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p>Loading annotation metadata…</p>
                    </>
                  ) : isReferencesLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <p>Fetching mapped regions…</p>
                    </>
                  ) : (
                    <p>Enter a contig name and scroll to begin streaming.</p>
                  )}
                </div>
              )}

              <div
                ref={sentinelRef}
                className="flex items-center justify-center gap-2 px-4 py-4 text-xs text-muted-foreground"
              >
                {hasMore ? (
                  <>
                    {isFetchingWindow && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    <span>{isFetchingWindow ? "Loading more features…" : "Scroll to load more"}</span>
                  </>
                ) : (
                  <span>
                    {hasSelectedReference
                      ? `Reached the end of available data for ${normalizedReference}.`
                      : "Enter a contig to begin streaming."}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

