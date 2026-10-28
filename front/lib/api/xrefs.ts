import { getXrefsApiBase, joinUrl } from "@/lib/config/env"
import { buildQuery, type Query } from "@/lib/api/base"
import type {
  AccessionSort,
  AccessionsResponse,
  AnnotationGeneRow,
  AnnotationGenesResponse,
  GeneXrefsResponse,
  HitsMatch,
  HitsResponse,
  NamespacesResponse,
  NamesResponse,
  SortOrder,
  XrefsErrorDetail,
} from "@/lib/api/xrefs-types"
import {
  MAX_NAMES_GET,
  MAX_NAMES_POST,
} from "@/lib/genes/prefix"

export { MAX_NAMES_GET, MAX_NAMES_POST }

export class XrefsApiError extends Error {
  status: number
  detail: XrefsErrorDetail | null

  constructor(message: string, status: number, detail: XrefsErrorDetail | null = null) {
    super(message)
    this.name = "XrefsApiError"
    this.status = status
    this.detail = detail
  }
}

async function parseError(res: Response, path: string): Promise<XrefsApiError> {
  let detail: XrefsErrorDetail | null = null
  try {
    const body = await res.json()
    if (body?.detail && typeof body.detail === "object") {
      detail = body.detail as XrefsErrorDetail
    } else if (typeof body?.detail === "string") {
      detail = { code: "error", message: body.detail }
    }
  } catch {
    // ignore
  }
  const message = detail?.message ?? `${res.status} ${path}`
  return new XrefsApiError(message, res.status, detail)
}

async function xrefsGet<T>(path: string, params?: Query, init?: RequestInit): Promise<T> {
  const url = `${joinUrl(getXrefsApiBase(), path)}${buildQuery(params)}`
  const res = await fetch(url, {
    ...init,
    method: "GET",
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  })
  if (!res.ok) throw await parseError(res, path)
  return res.json() as Promise<T>
}

async function xrefsPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const url = joinUrl(getXrefsApiBase(), path)
  const res = await fetch(url, {
    ...init,
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await parseError(res, path)
  return res.json() as Promise<T>
}

/** Canonical CSV for nginx cache keys: lowercase, sorted, unique. */
export function canonicalNameCsv(names: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names) {
    const id = raw.trim().toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  out.sort()
  return out.join(",")
}

export function canonicalTaxidCsv(taxids: number[] | null | undefined): string | undefined {
  if (!taxids?.length) return undefined
  return [...new Set(taxids.filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b)
    .join(",")
}

export function listNamespaces(init?: RequestInit) {
  return xrefsGet<NamespacesResponse>("/namespaces", undefined, init)
}

export function listAccessions(
  namespace: string,
  params?: {
    sort?: AccessionSort
    sort_order?: SortOrder
    accessions?: string
    limit?: number
    next?: string | null
    previous?: string | null
  },
  init?: RequestInit,
) {
  const encoded = namespace
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/")
  return xrefsGet<AccessionsResponse>(
    `/namespaces/${encoded}/accessions`,
    {
      sort: params?.sort,
      sort_order: params?.sort_order,
      accessions: params?.accessions,
      limit: params?.limit,
      next: params?.next ?? undefined,
      previous: params?.previous ?? undefined,
    },
    init,
  )
}

export interface HitsSearchParams {
  names: string[]
  include_taxids?: number[] | null
  exclude_taxids?: number[] | null
}

function nameHitsBody(params: HitsSearchParams) {
  return {
    names: params.names.map((n) => n.trim().toLowerCase()).filter(Boolean),
    include_taxids: params.include_taxids?.length
      ? [...params.include_taxids].sort((a, b) => a - b)
      : undefined,
    exclude_taxids: params.exclude_taxids?.length
      ? [...params.exclude_taxids].sort((a, b) => a - b)
      : undefined,
  }
}

/** Gene-name presence search (`GET|POST /hits`). Canonicalizes the GET URL for nginx cache. */
export function searchHits(params: HitsSearchParams, init?: RequestInit) {
  if (params.names.length > MAX_NAMES_GET) {
    return xrefsPost<HitsResponse>("/hits", nameHitsBody(params), init)
  }
  return xrefsGet<HitsResponse>(
    "/hits",
    {
      names: canonicalNameCsv(params.names),
      include_taxids: canonicalTaxidCsv(params.include_taxids),
      exclude_taxids: canonicalTaxidCsv(params.exclude_taxids),
    },
    init,
  )
}

export interface NamesSearchParams {
  prefix: string
  include_taxids?: number[] | null
  exclude_taxids?: number[] | null
}

/** Prefix discovery (`GET /names`). */
export function searchNames(params: NamesSearchParams, init?: RequestInit) {
  return xrefsGet<NamesResponse>(
    "/names",
    {
      prefix: params.prefix.trim().toLowerCase(),
      include_taxids: canonicalTaxidCsv(params.include_taxids),
      exclude_taxids: canonicalTaxidCsv(params.exclude_taxids),
    },
    init,
  )
}

export function listAnnotationGenes(
  annotationId: string,
  params?: {
    names?: string[] | string | null
    match?: HitsMatch
    limit?: number
    offset?: number
  },
  init?: RequestInit,
) {
  const names = Array.isArray(params?.names)
    ? canonicalNameCsv(params.names) || undefined
    : params?.names
      ? canonicalNameCsv(
          String(params.names)
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean),
        ) || undefined
      : undefined
  return xrefsGet<AnnotationGenesResponse>(
    `/annotations/${encodeURIComponent(annotationId)}/genes`,
    {
      names,
      match: params?.match,
      limit: params?.limit,
      offset: params?.offset,
    },
    init,
  )
}

export function getAnnotationGene(
  annotationId: string,
  localId: number,
  init?: RequestInit,
) {
  return xrefsGet<AnnotationGeneRow>(
    `/annotations/${encodeURIComponent(annotationId)}/genes/${localId}`,
    undefined,
    init,
  )
}

export function listGeneXrefs(
  annotationId: string,
  localId: number,
  params?: {
    limit?: number
    offset?: number
  },
  init?: RequestInit,
) {
  return xrefsGet<GeneXrefsResponse>(
    `/annotations/${encodeURIComponent(annotationId)}/genes/${localId}/xrefs`,
    {
      limit: params?.limit,
      offset: params?.offset,
    },
    init,
  )
}
