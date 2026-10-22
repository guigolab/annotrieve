import { getXrefsApiBase, joinUrl } from "@/lib/config/env"
import { buildQuery, type Query } from "@/lib/api/base"
import { MAX_CURIES_GET } from "@/lib/genes/curie"
import type {
  AccessionSort,
  AccessionsResponse,
  AnnotationGeneRow,
  AnnotationGenesResponse,
  GeneXrefsResponse,
  HitAnnotationsResponse,
  HitsMatch,
  HitsResponse,
  NamespacesResponse,
  SortOrder,
  XrefsErrorDetail,
} from "@/lib/api/xrefs-types"

/** Cap for GET /hits names CSV (server MAX_NAMES_GET). */
export const MAX_NAMES_GET = 50
/** Cap for POST /hits names list (server MAX_NAMES_POST). */
export const MAX_NAMES_POST = 200

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
  match?: HitsMatch
}

function nameHitsBody(params: HitsSearchParams) {
  return {
    names: params.names,
    include_taxids: params.include_taxids?.length
      ? params.include_taxids
      : undefined,
    exclude_taxids: params.exclude_taxids?.length
      ? params.exclude_taxids
      : undefined,
    match: params.match ?? undefined,
  }
}

/** Gene-name presence search (`GET|POST /hits`). */
export function searchHits(params: HitsSearchParams, init?: RequestInit) {
  if (params.names.length > MAX_NAMES_GET) {
    return xrefsPost<HitsResponse>("/hits", nameHitsBody(params), init)
  }
  return xrefsGet<HitsResponse>(
    "/hits",
    {
      names: params.names.join(","),
      include_taxids: params.include_taxids?.length
        ? params.include_taxids.join(",")
        : undefined,
      exclude_taxids: params.exclude_taxids?.length
        ? params.exclude_taxids.join(",")
        : undefined,
      match: params.match ?? undefined,
    },
    init,
  )
}

/** @deprecated Legacy CURIE annotation rollup; kept for older genes UI. */
export interface HitAnnotationsSearchParams {
  curies: string[]
  taxid?: number | null
  match?: HitsMatch
  limit?: number
  next?: string | null
  previous?: string | null
}

export function searchHitAnnotations(
  params: HitAnnotationsSearchParams,
  init?: RequestInit,
) {
  const body = {
    curies: params.curies,
    taxid: params.taxid ?? undefined,
    match: params.match ?? undefined,
    limit: params.limit,
    next: params.next ?? undefined,
    previous: params.previous ?? undefined,
  }
  if (params.curies.length > MAX_CURIES_GET) {
    return xrefsPost<HitAnnotationsResponse>("/hits/annotations", body, init)
  }
  return xrefsGet<HitAnnotationsResponse>(
    "/hits/annotations",
    {
      curies: params.curies.join(","),
      taxid: params.taxid ?? undefined,
      match: params.match ?? undefined,
      limit: params.limit,
      next: params.next ?? undefined,
      previous: params.previous ?? undefined,
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
    ? params.names.join(",")
    : params?.names ?? undefined
  return xrefsGet<AnnotationGenesResponse>(
    `/annotations/${encodeURIComponent(annotationId)}/genes`,
    {
      names: names || undefined,
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
