import { getTaxon } from '@/lib/api/taxons'
import { getAssembly } from '@/lib/api/assemblies'
import { getBioproject } from '@/lib/api/bioprojects'
import type { AssemblyRecord, BioProjectRecord, TaxonRecord } from '@/lib/api/types'
import type { FiltersState, SortOption } from '@/lib/stores/annotations-filters'
import { getFiltersHash } from '@/lib/utils'
import { joinCsv, splitCsv } from '@/lib/csv-list'

export const ANNOTATIONS_LIST_PATH = '/annotations/'

/** UI deep-link param for the annotation overview sidebar (not a filter). */
export const ANNOTATION_ID_PARAM = 'annotation_id'

const UI_PARAM_KEYS = [ANNOTATION_ID_PARAM] as const

/** URL param keys that represent active filters (excludes sort; page is never in URL). */
export const FILTER_PARAM_KEYS = [
  'taxids',
  'accessions',
  'bioprojects',
  'assembly_levels',
  'assembly_statuses',
  'ref_genomes',
  'biotypes',
  'feature_types',
  'feature_sources',
  'pipelines',
  'providers',
  'db_sources',
  'busco_from',
  'busco_to',
] as const

const SORT_OPTIONS: SortOption[] = [
  'none',
  'date_desc',
  'date_asc',
  'coding_genes_count_desc',
  'coding_genes_count_asc',
  'non_coding_genes_count_desc',
  'non_coding_genes_count_asc',
  'pseudogenes_count_desc',
  'pseudogenes_count_asc',
  'busco_complete_desc',
  'busco_complete_asc',
]

export type ParsedAnnotationsUrl = FiltersState & {
  page: number
  sortOption: SortOption
}

export type AnnotationsUrlParams = Partial<{
  taxids: string[]
  accessions: string[]
  bioprojects: string[]
  assembly_levels: string[]
  assembly_statuses: string[]
  ref_genomes: boolean
  biotypes: string[]
  feature_types: string[]
  feature_sources: string[]
  pipelines: string[]
  providers: string[]
  db_sources: string[]
  busco_from: number
  busco_to: number
  sort: SortOption
}>

function parseSearchParamsInput(
  input: URLSearchParams | string
): URLSearchParams {
  if (typeof input === 'string') {
    const trimmed = input.startsWith('?') ? input.slice(1) : input
    return new URLSearchParams(trimmed)
  }
  return input
}

/** Normalize legacy param names to canonical keys; drop obsolete page param. */
export function normalizeSearchParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString())

  const legacyTaxids = next.get('filter_taxids')
  if (legacyTaxids && !next.has('taxids')) {
    next.set('taxids', legacyTaxids)
    next.delete('filter_taxids')
  }

  const legacyAccessions = next.get('filter_accessions')
  if (legacyAccessions && !next.has('accessions')) {
    next.set('accessions', legacyAccessions)
    next.delete('filter_accessions')
  }

  // Pagination is in-memory only (infinite scroll); never keep page in the URL
  next.delete('page')

  return next
}

export function hasActiveSearchParams(input: URLSearchParams | string): boolean {
  const params = normalizeSearchParams(parseSearchParamsInput(input))
  return FILTER_PARAM_KEYS.some((key) => {
    const value = params.get(key)
    if (!value) return false
    if (key === 'ref_genomes') return value === '1'
    return true
  })
}

/** Read the annotation overview deep-link id from URL params. */
export function getAnnotationIdParam(
  input: URLSearchParams | string
): string | null {
  const params = parseSearchParamsInput(input)
  const value = params.get(ANNOTATION_ID_PARAM)?.trim()
  return value || null
}

/** Remove UI-only params (e.g. annotation_id) so filter sync can ignore them. */
export function stripUiParams(
  input: URLSearchParams | string
): URLSearchParams {
  const params = new URLSearchParams(parseSearchParamsInput(input).toString())
  for (const key of UI_PARAM_KEYS) {
    params.delete(key)
  }
  return params
}

/**
 * Copy annotation_id from source onto target (mutates and returns target).
 * Used when filter commits rebuild the query without UI params.
 */
export function preserveAnnotationId(
  target: URLSearchParams,
  source: URLSearchParams | string
): URLSearchParams {
  const id = getAnnotationIdParam(source)
  if (id) {
    target.set(ANNOTATION_ID_PARAM, id)
  } else {
    target.delete(ANNOTATION_ID_PARAM)
  }
  return target
}

/**
 * Return a copy of search params with annotation_id set or removed.
 * Does not mutate the input.
 */
export function withAnnotationIdParam(
  input: URLSearchParams | string,
  annotationId: string | null
): URLSearchParams {
  const params = new URLSearchParams(parseSearchParamsInput(input).toString())
  const trimmed = annotationId?.trim() || null
  if (trimmed) {
    params.set(ANNOTATION_ID_PARAM, trimmed)
  } else {
    params.delete(ANNOTATION_ID_PARAM)
  }
  return params
}

/** Build /annotations/ URL with annotation_id set or cleared. */
export function buildAnnotationsUrlWithAnnotationId(
  currentSearch: URLSearchParams | string,
  annotationId: string | null
): string {
  const params = withAnnotationIdParam(currentSearch, annotationId)
  const qs = params.toString()
  return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
}

function parseSortOption(value: string | null): SortOption {
  if (value && SORT_OPTIONS.includes(value as SortOption)) {
    return value as SortOption
  }
  return 'none'
}

/** Parse URL params into primitive filter values (no API hydration). */
export function parseSearchParamsToPrimitives(
  input: URLSearchParams | string
): AnnotationsUrlParams {
  const params = normalizeSearchParams(parseSearchParamsInput(input))

  const buscoFromRaw = params.get('busco_from')
  const buscoToRaw = params.get('busco_to')

  const result: AnnotationsUrlParams = {}

  const taxids = splitCsv(params.get('taxids'))
  if (taxids.length) result.taxids = taxids

  const accessions = splitCsv(params.get('accessions'))
  if (accessions.length) result.accessions = accessions

  const bioprojects = splitCsv(params.get('bioprojects'))
  if (bioprojects.length) result.bioprojects = bioprojects

  const assemblyLevels = splitCsv(params.get('assembly_levels'))
  if (assemblyLevels.length) result.assembly_levels = assemblyLevels

  const assemblyStatuses = splitCsv(params.get('assembly_statuses'))
  if (assemblyStatuses.length) result.assembly_statuses = assemblyStatuses

  if (params.get('ref_genomes') === '1') result.ref_genomes = true

  const biotypes = splitCsv(params.get('biotypes'))
  if (biotypes.length) result.biotypes = biotypes

  const featureTypes = splitCsv(params.get('feature_types'))
  if (featureTypes.length) result.feature_types = featureTypes

  const featureSources = splitCsv(params.get('feature_sources'))
  if (featureSources.length) result.feature_sources = featureSources

  const pipelines = splitCsv(params.get('pipelines'))
  if (pipelines.length) result.pipelines = pipelines

  const providers = splitCsv(params.get('providers'))
  if (providers.length) result.providers = providers

  const dbSources = splitCsv(params.get('db_sources'))
  if (dbSources.length) result.db_sources = dbSources

  if (buscoFromRaw != null && buscoFromRaw !== '') {
    const n = Number(buscoFromRaw)
    if (!Number.isNaN(n)) result.busco_from = n
  }
  if (buscoToRaw != null && buscoToRaw !== '') {
    const n = Number(buscoToRaw)
    if (!Number.isNaN(n)) result.busco_to = n
  }

  const sort = params.get('sort')
  if (sort) result.sort = parseSortOption(sort)

  return result
}

async function hydrateTaxons(taxids: string[]): Promise<TaxonRecord[]> {
  if (!taxids.length) return []
  const fetched = await Promise.all(taxids.map((t) => getTaxon(t).catch(() => null)))
  const hydrated = fetched.filter((t): t is TaxonRecord => !!t)
  const fetchedIds = new Set(hydrated.map((t) => String(t.taxid)))
  for (const id of taxids) {
    if (!fetchedIds.has(id)) {
      hydrated.push({ taxid: id, scientific_name: id })
    }
  }
  return hydrated
}

async function hydrateAssemblies(accessions: string[]): Promise<AssemblyRecord[]> {
  if (!accessions.length) return []
  const fetched = await Promise.all(
    accessions.map((a) => getAssembly(a).catch(() => null))
  )
  const hydrated = fetched.filter((a): a is AssemblyRecord => !!a)
  const fetchedAcc = new Set(hydrated.map((a) => a.assembly_accession))
  for (const acc of accessions) {
    if (!fetchedAcc.has(acc)) {
      hydrated.push({
        assembly_accession: acc,
        assembly_name: acc,
      } as AssemblyRecord)
    }
  }
  return hydrated
}

async function hydrateBioprojects(accessions: string[]): Promise<BioProjectRecord[]> {
  if (!accessions.length) return []
  const fetched = await Promise.all(
    accessions.map((a) => getBioproject(a).catch(() => null))
  )
  const hydrated = fetched.filter((bp): bp is BioProjectRecord => !!bp)
  const fetchedAcc = new Set(hydrated.map((bp) => bp.accession))
  for (const acc of accessions) {
    if (!fetchedAcc.has(acc)) {
      hydrated.push({ accession: acc, title: acc } as BioProjectRecord)
    }
  }
  return hydrated
}

const emptyFilters: FiltersState = {
  selectedTaxons: [],
  selectedOrganisms: [],
  selectedAssemblies: [],
  selectedBioprojects: [],
  selectedAssemblyLevels: [],
  selectedAssemblyStatuses: [],
  onlyRefGenomes: false,
  biotypes: [],
  featureTypes: [],
  featureSources: [],
  pipelines: [],
  providers: [],
  databaseSources: [],
  buscoCompleteFrom: null,
  buscoCompleteTo: null,
}

/** Build filter state from URL using stub entities (IDs as labels). Sync — no API. */
export function parseSearchParamsToFiltersSync(
  input: URLSearchParams | string
): ParsedAnnotationsUrl {
  const primitives = parseSearchParamsToPrimitives(input)

  return {
    ...emptyFilters,
    selectedTaxons: (primitives.taxids ?? []).map((id) => ({
      taxid: id,
      scientific_name: id,
    })),
    selectedAssemblies: (primitives.accessions ?? []).map(
      (acc) =>
        ({
          assembly_accession: acc,
          assembly_name: acc,
        }) as AssemblyRecord
    ),
    selectedBioprojects: (primitives.bioprojects ?? []).map(
      (acc) =>
        ({
          accession: acc,
          title: acc,
        }) as BioProjectRecord
    ),
    selectedAssemblyLevels: primitives.assembly_levels ?? [],
    selectedAssemblyStatuses: primitives.assembly_statuses ?? [],
    onlyRefGenomes: primitives.ref_genomes ?? false,
    biotypes: primitives.biotypes ?? [],
    featureTypes: primitives.feature_types ?? [],
    featureSources: primitives.feature_sources ?? [],
    pipelines: primitives.pipelines ?? [],
    providers: primitives.providers ?? [],
    databaseSources: primitives.db_sources ?? [],
    buscoCompleteFrom: primitives.busco_from ?? null,
    buscoCompleteTo: primitives.busco_to ?? null,
    page: 1,
    sortOption: primitives.sort ?? 'none',
  }
}

/** Fetch full entity records for chip/label display (taxons, assemblies, bioprojects). */
export async function enrichFilterEntitiesFromPrimitives(
  primitives: AnnotationsUrlParams
): Promise<{
  selectedTaxons: TaxonRecord[]
  selectedAssemblies: AssemblyRecord[]
  selectedBioprojects: BioProjectRecord[]
}> {
  const [selectedTaxons, selectedAssemblies, selectedBioprojects] = await Promise.all([
    hydrateTaxons(primitives.taxids ?? []),
    hydrateAssemblies(primitives.accessions ?? []),
    hydrateBioprojects(primitives.bioprojects ?? []),
  ])
  return { selectedTaxons, selectedAssemblies, selectedBioprojects }
}

function sameIdSet(actual: Iterable<string>, expected: string[] | undefined): boolean {
  const expectedSet = new Set(expected ?? [])
  const actualSet = new Set(actual)
  if (actualSet.size !== expectedSet.size) return false
  for (const id of expectedSet) {
    if (!actualSet.has(id)) return false
  }
  return true
}

/**
 * True when store entity ID sets match the URL primitives that were enriched.
 * Used to drop stale enrich results after concurrent UI edits.
 */
export function storeEntityIdsMatchPrimitives(
  store: Pick<
    FiltersState,
    'selectedTaxons' | 'selectedAssemblies' | 'selectedBioprojects'
  >,
  primitives: AnnotationsUrlParams
): boolean {
  return (
    sameIdSet(
      store.selectedTaxons.map((t) => String(t.taxid)),
      primitives.taxids
    ) &&
    sameIdSet(
      store.selectedAssemblies.map((a) => a.assembly_accession).filter(Boolean),
      primitives.accessions
    ) &&
    sameIdSet(
      store.selectedBioprojects.map((bp) => bp.accession).filter(Boolean),
      primitives.bioprojects
    )
  )
}

/** Parse URL params and hydrate entity records from the API. */
export async function parseSearchParamsToFiltersAsync(
  input: URLSearchParams | string
): Promise<ParsedAnnotationsUrl> {
  const stubs = parseSearchParamsToFiltersSync(input)
  const primitives = parseSearchParamsToPrimitives(input)
  const enriched = await enrichFilterEntitiesFromPrimitives(primitives)
  return {
    ...stubs,
    ...enriched,
  }
}

export function serializeFiltersToSearchParams(
  filters: FiltersState,
  pagination: { sortOption: SortOption }
): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.selectedTaxons.length > 0) {
    params.set('taxids', joinCsv(filters.selectedTaxons.map((t) => String(t.taxid))))
  }
  if (filters.selectedAssemblies.length > 0) {
    params.set(
      'accessions',
      joinCsv(
        filters.selectedAssemblies
          .map((a) => a.assembly_accession)
          .filter(Boolean) as string[]
      )
    )
  }
  if (filters.selectedBioprojects.length > 0) {
    params.set('bioprojects', joinCsv(filters.selectedBioprojects.map((bp) => bp.accession)))
  }
  if (filters.selectedAssemblyLevels.length > 0) {
    params.set('assembly_levels', joinCsv(filters.selectedAssemblyLevels))
  }
  if (filters.selectedAssemblyStatuses.length > 0) {
    params.set('assembly_statuses', joinCsv(filters.selectedAssemblyStatuses))
  }
  if (filters.onlyRefGenomes) {
    params.set('ref_genomes', '1')
  }
  if (filters.biotypes.length > 0) {
    params.set('biotypes', joinCsv(filters.biotypes))
  }
  if (filters.featureTypes.length > 0) {
    params.set('feature_types', joinCsv(filters.featureTypes))
  }
  if (filters.featureSources.length > 0) {
    params.set('feature_sources', joinCsv(filters.featureSources))
  }
  if (filters.pipelines.length > 0) {
    params.set('pipelines', joinCsv(filters.pipelines))
  }
  if (filters.providers.length > 0) {
    params.set('providers', joinCsv(filters.providers))
  }
  if (filters.databaseSources.length > 0) {
    params.set('db_sources', joinCsv(filters.databaseSources))
  }
  if (filters.buscoCompleteFrom != null) {
    params.set('busco_from', String(filters.buscoCompleteFrom))
  }
  if (filters.buscoCompleteTo != null) {
    params.set('busco_to', String(filters.buscoCompleteTo))
  }
  if (pagination.sortOption !== 'none') {
    params.set('sort', pagination.sortOption)
  }

  return params
}

export function getSearchParamsHash(input: URLSearchParams | string): string {
  const params = normalizeSearchParams(parseSearchParamsInput(input))
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(sorted)
}

/** Hash of filter/page/sort params only (ignores UI deep-link params). */
export function getFilterSearchParamsHash(
  input: URLSearchParams | string
): string {
  return getSearchParamsHash(stripUiParams(normalizeSearchParams(parseSearchParamsInput(input))))
}

export function getStoreUrlHash(
  filters: FiltersState,
  pagination: { sortOption: SortOption }
): string {
  const qs = serializeFiltersToSearchParams(filters, pagination).toString()
  return getFilterSearchParamsHash(qs)
}

export function getFiltersUrlHash(filters: FiltersState): string {
  return getFiltersHash(filters)
}

export type MergeSearchParamsMode = 'merge' | 'replace'

/**
 * Merge navigation incoming params with a base query string.
 * merge: union taxids/accessions with existing lists; replace: incoming only.
 */
export function mergeSearchParams(
  base: URLSearchParams | string,
  incoming: AnnotationsUrlParams,
  mode: MergeSearchParamsMode
): URLSearchParams {
  if (mode === 'replace') {
    return serializeFiltersToSearchParams(
      {
        ...emptyFilters,
        selectedTaxons: (incoming.taxids ?? []).map((id) => ({
          taxid: id,
          scientific_name: id,
        })),
        selectedAssemblies: (incoming.accessions ?? []).map((acc) => ({
          assembly_accession: acc,
          assembly_name: acc,
        } as AssemblyRecord)),
        selectedBioprojects: (incoming.bioprojects ?? []).map((acc) => ({
          accession: acc,
          title: acc,
        } as BioProjectRecord)),
        selectedAssemblyLevels: incoming.assembly_levels ?? [],
        selectedAssemblyStatuses: incoming.assembly_statuses ?? [],
        onlyRefGenomes: incoming.ref_genomes ?? false,
        biotypes: incoming.biotypes ?? [],
        featureTypes: incoming.feature_types ?? [],
        featureSources: incoming.feature_sources ?? [],
        pipelines: incoming.pipelines ?? [],
        providers: incoming.providers ?? [],
        databaseSources: incoming.db_sources ?? [],
        buscoCompleteFrom: incoming.busco_from ?? null,
        buscoCompleteTo: incoming.busco_to ?? null,
      },
      { sortOption: incoming.sort ?? 'none' }
    )
  }

  const baseParams = normalizeSearchParams(parseSearchParamsInput(base))
  const basePrimitives = parseSearchParamsToPrimitives(baseParams)

  const mergedTaxids = new Set(basePrimitives.taxids ?? [])
  for (const id of incoming.taxids ?? []) mergedTaxids.add(id)

  const mergedAccessions = new Set(basePrimitives.accessions ?? [])
  for (const acc of incoming.accessions ?? []) mergedAccessions.add(acc)

  const mergedBioprojects = new Set(basePrimitives.bioprojects ?? [])
  for (const bp of incoming.bioprojects ?? []) mergedBioprojects.add(bp)

  return serializeFiltersToSearchParams(
    {
      ...emptyFilters,
      selectedTaxons: [...mergedTaxids].map((id) => ({ taxid: id, scientific_name: id })),
      selectedAssemblies: [...mergedAccessions].map((acc) => ({
        assembly_accession: acc,
        assembly_name: acc,
      } as AssemblyRecord)),
      selectedBioprojects: [...mergedBioprojects].map((acc) => ({
        accession: acc,
        title: acc,
      } as BioProjectRecord)),
      selectedAssemblyLevels: basePrimitives.assembly_levels ?? [],
      selectedAssemblyStatuses: basePrimitives.assembly_statuses ?? [],
      onlyRefGenomes: basePrimitives.ref_genomes ?? false,
      biotypes: basePrimitives.biotypes ?? [],
      featureTypes: basePrimitives.feature_types ?? [],
      featureSources: basePrimitives.feature_sources ?? [],
      pipelines: basePrimitives.pipelines ?? [],
      providers: basePrimitives.providers ?? [],
      databaseSources: basePrimitives.db_sources ?? [],
      buscoCompleteFrom: basePrimitives.busco_from ?? null,
      buscoCompleteTo: basePrimitives.busco_to ?? null,
    },
    {
      sortOption: basePrimitives.sort ?? 'none',
    }
  )
}

export function buildAnnotationsListUrl(
  params?: URLSearchParams | AnnotationsUrlParams | string
): string {
  if (!params) return ANNOTATIONS_LIST_PATH

  if (typeof params === 'string') {
    const qs = params.startsWith('?') ? params.slice(1) : params
    return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
  }

  if (params instanceof URLSearchParams) {
    const qs = params.toString()
    return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
  }

  const searchParams = serializeFiltersToSearchParams(
    {
      ...emptyFilters,
      selectedTaxons: (params.taxids ?? []).map((id) => ({
        taxid: id,
        scientific_name: id,
      })),
      selectedAssemblies: (params.accessions ?? []).map((acc) => ({
        assembly_accession: acc,
        assembly_name: acc,
      } as AssemblyRecord)),
      selectedBioprojects: (params.bioprojects ?? []).map((acc) => ({
        accession: acc,
        title: acc,
      } as BioProjectRecord)),
      selectedAssemblyLevels: params.assembly_levels ?? [],
      selectedAssemblyStatuses: params.assembly_statuses ?? [],
      onlyRefGenomes: params.ref_genomes ?? false,
      biotypes: params.biotypes ?? [],
      featureTypes: params.feature_types ?? [],
      featureSources: params.feature_sources ?? [],
      pipelines: params.pipelines ?? [],
      providers: params.providers ?? [],
      databaseSources: params.db_sources ?? [],
      buscoCompleteFrom: params.busco_from ?? null,
      buscoCompleteTo: params.busco_to ?? null,
    },
    { sortOption: params.sort ?? 'none' }
  )
  const qs = searchParams.toString()
  return qs ? `${ANNOTATIONS_LIST_PATH}?${qs}` : ANNOTATIONS_LIST_PATH
}

export function buildIncomingNavParams(opts: {
  taxid?: string
  accession?: string
}): AnnotationsUrlParams {
  const params: AnnotationsUrlParams = { sort: 'none' }
  if (opts.taxid) params.taxids = [opts.taxid]
  if (opts.accession) params.accessions = [opts.accession]
  return params
}
