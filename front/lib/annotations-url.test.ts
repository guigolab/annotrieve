import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeSearchParams,
  hasActiveSearchParams,
  parseSearchParamsToPrimitives,
  parseSearchParamsToFiltersSync,
  serializeFiltersToSearchParams,
  mergeSearchParams,
  getSearchParamsHash,
  getFilterSearchParamsHash,
  getAnnotationIdParam,
  stripUiParams,
  preserveAnnotationId,
  withAnnotationIdParam,
  ANNOTATION_ID_PARAM,
  buildAnnotationsListUrl,
  buildIncomingNavParams,
} from "./annotations-url"
import type { FiltersState } from "./stores/annotations-filters"

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

describe("normalizeSearchParams", () => {
  it("maps legacy filter_taxids to taxids", () => {
    const raw = new URLSearchParams("filter_taxids=9606,10090")
    const normalized = normalizeSearchParams(raw)
    assert.equal(normalized.get("taxids"), "9606,10090")
    assert.equal(normalized.get("filter_taxids"), null)
  })

  it("maps legacy filter_accessions to accessions", () => {
    const raw = new URLSearchParams("filter_accessions=GCA_000001405.15")
    const normalized = normalizeSearchParams(raw)
    assert.equal(normalized.get("accessions"), "GCA_000001405.15")
    assert.equal(normalized.get("filter_accessions"), null)
  })

  it("strips obsolete page param", () => {
    const normalized = normalizeSearchParams(new URLSearchParams("taxids=9606&page=3"))
    assert.equal(normalized.get("taxids"), "9606")
    assert.equal(normalized.get("page"), null)
  })
})

describe("hasActiveSearchParams", () => {
  it("returns false for empty string", () => {
    assert.equal(hasActiveSearchParams(""), false)
  })

  it("returns false for page/sort only", () => {
    assert.equal(hasActiveSearchParams("page=2&sort=date_desc"), false)
  })

  it("returns true when taxids present", () => {
    assert.equal(hasActiveSearchParams("taxids=9606"), true)
  })

  it("returns true for legacy keys after normalize", () => {
    assert.equal(hasActiveSearchParams("filter_taxids=9606"), true)
  })

  it("returns false for annotation_id only", () => {
    assert.equal(hasActiveSearchParams("annotation_id=abc123"), false)
  })
})

describe("annotation_id UI param helpers", () => {
  it("getAnnotationIdParam reads trimmed id", () => {
    assert.equal(getAnnotationIdParam("annotation_id=abc123"), "abc123")
    assert.equal(getAnnotationIdParam("annotation_id=%20"), null)
    assert.equal(getAnnotationIdParam("taxids=9606"), null)
  })

  it("stripUiParams removes annotation_id", () => {
    const stripped = stripUiParams("taxids=9606&annotation_id=abc123&sort=date_desc")
    assert.equal(stripped.get("taxids"), "9606")
    assert.equal(stripped.get("sort"), "date_desc")
    assert.equal(stripped.get(ANNOTATION_ID_PARAM), null)
  })

  it("preserveAnnotationId copies id onto target", () => {
    const target = new URLSearchParams("taxids=9606")
    preserveAnnotationId(target, "annotation_id=abc123&biotypes=x")
    assert.equal(target.get("taxids"), "9606")
    assert.equal(target.get(ANNOTATION_ID_PARAM), "abc123")
  })

  it("preserveAnnotationId clears id when source has none", () => {
    const target = new URLSearchParams("taxids=9606&annotation_id=old")
    preserveAnnotationId(target, "taxids=9606")
    assert.equal(target.get(ANNOTATION_ID_PARAM), null)
  })

  it("getFilterSearchParamsHash ignores annotation_id", () => {
    const withId = getFilterSearchParamsHash("taxids=9606&annotation_id=abc123")
    const withoutId = getFilterSearchParamsHash("taxids=9606")
    assert.equal(withId, withoutId)
    assert.notEqual(getSearchParamsHash("taxids=9606&annotation_id=abc123"), withoutId)
  })

  it("withAnnotationIdParam sets id and preserves other params", () => {
    const next = withAnnotationIdParam("taxids=9606&sort=date_desc", "abc123")
    assert.equal(next.get("taxids"), "9606")
    assert.equal(next.get("sort"), "date_desc")
    assert.equal(next.get(ANNOTATION_ID_PARAM), "abc123")
  })

  it("withAnnotationIdParam clears id when null", () => {
    const next = withAnnotationIdParam("taxids=9606&annotation_id=abc123", null)
    assert.equal(next.get("taxids"), "9606")
    assert.equal(next.get(ANNOTATION_ID_PARAM), null)
  })

  it("withAnnotationIdParam does not mutate input", () => {
    const input = new URLSearchParams("taxids=9606")
    withAnnotationIdParam(input, "abc123")
    assert.equal(input.get(ANNOTATION_ID_PARAM), null)
  })
})

describe("serialize and parse round-trip", () => {
  it("preserves primitive filter fields without page", () => {
    const filters: FiltersState = {
      ...emptyFilters,
      selectedTaxons: [{ taxid: "9606", scientific_name: "Homo sapiens" }],
      biotypes: ["protein_coding"],
      onlyRefGenomes: true,
      buscoCompleteFrom: 70,
      buscoCompleteTo: 90,
    }
    const params = serializeFiltersToSearchParams(filters, { sortOption: "date_desc" })
    const parsed = parseSearchParamsToPrimitives(params)

    assert.deepEqual(parsed.taxids, ["9606"])
    assert.deepEqual(parsed.biotypes, ["protein_coding"])
    assert.equal(parsed.ref_genomes, true)
    assert.equal(parsed.busco_from, 70)
    assert.equal(parsed.busco_to, 90)
    assert.equal(params.get("page"), null)
    assert.equal(parsed.sort, "date_desc")
  })

  it("never emits page and omits default sort", () => {
    const params = serializeFiltersToSearchParams(emptyFilters, { sortOption: "none" })
    assert.equal(params.get("page"), null)
    assert.equal(params.get("sort"), null)
  })

  it("ignores page in input after normalize", () => {
    const parsed = parseSearchParamsToPrimitives("taxids=9606&page=5")
    assert.deepEqual(parsed.taxids, ["9606"])
    assert.equal("page" in parsed, false)
  })

  it("round-trips provider names containing commas", () => {
    const provider = "Hiller Lab, Senckenberg Research Institute"
    const filters: FiltersState = {
      ...emptyFilters,
      providers: [provider],
    }
    const params = serializeFiltersToSearchParams(filters, { sortOption: "none" })
    assert.equal(params.get("providers"), `"${provider}"`)
    const qs = params.toString()
    assert.match(qs, /%22/)
    const parsed = parseSearchParamsToPrimitives(params)
    assert.deepEqual(parsed.providers, [provider])
  })

  it("percent-encodes slash in provider query values", () => {
    const provider = "HHMI/UCSF"
    const filters: FiltersState = {
      ...emptyFilters,
      providers: [provider],
    }
    const params = serializeFiltersToSearchParams(filters, { sortOption: "none" })
    assert.equal(params.get("providers"), provider)
    const qs = params.toString()
    assert.match(qs, /HHMI%2FUCSF/)
    assert.doesNotMatch(qs, /HHMI\/UCSF/)
    const parsed = parseSearchParamsToPrimitives(params)
    assert.deepEqual(parsed.providers, [provider])
  })

  it("round-trips mixed comma and slash providers", () => {
    const providers = [
      "Hiller Lab, Senckenberg Research Institute",
      "HHMI/UCSF",
    ]
    const filters: FiltersState = {
      ...emptyFilters,
      providers,
    }
    const params = serializeFiltersToSearchParams(filters, { sortOption: "none" })
    const qs = params.toString()
    assert.match(qs, /%22/)
    assert.match(qs, /HHMI%2FUCSF/)
    assert.deepEqual(parseSearchParamsToPrimitives(params).providers, providers)
  })
})

describe("parseSearchParamsToFiltersSync", () => {
  it("builds stub taxons and assemblies from URL ids", () => {
    const parsed = parseSearchParamsToFiltersSync(
      "taxids=9606,10090&accessions=GCA_000001405.15&biotypes=protein_coding&sort=date_desc"
    )
    assert.equal(parsed.page, 1)
    assert.equal(parsed.sortOption, "date_desc")
    assert.deepEqual(
      parsed.selectedTaxons.map((t) => t.taxid),
      ["9606", "10090"]
    )
    assert.equal(parsed.selectedTaxons[0].scientific_name, "9606")
    assert.deepEqual(
      parsed.selectedAssemblies.map((a) => a.assembly_accession),
      ["GCA_000001405.15"]
    )
    assert.equal(parsed.selectedAssemblies[0].assembly_name, "GCA_000001405.15")
    assert.deepEqual(parsed.biotypes, ["protein_coding"])
  })

  it("serializes the same as enriched ids for URL hash", () => {
    const stubs = parseSearchParamsToFiltersSync("taxids=9606")
    const fromStubs = serializeFiltersToSearchParams(stubs, {
      sortOption: stubs.sortOption,
    }).toString()
    const fromPrimitives = serializeFiltersToSearchParams(
      {
        ...emptyFilters,
        selectedTaxons: [{ taxid: "9606", scientific_name: "Homo sapiens" }],
      },
      { sortOption: "none" }
    ).toString()
    assert.equal(fromStubs, fromPrimitives)
  })
})

describe("mergeSearchParams", () => {
  it("merge mode unions taxids", () => {
    const base = "taxids=9606&biotypes=protein_coding"
    const incoming = buildIncomingNavParams({ taxid: "10090" })
    const merged = mergeSearchParams(base, incoming, "merge")
    const parsed = parseSearchParamsToPrimitives(merged)
    assert.deepEqual(parsed.taxids?.sort(), ["10090", "9606"])
    assert.deepEqual(parsed.biotypes, ["protein_coding"])
  })

  it("replace mode keeps only incoming entity", () => {
    const base = "taxids=9606&biotypes=protein_coding"
    const incoming = buildIncomingNavParams({ taxid: "10090" })
    const replaced = mergeSearchParams(base, incoming, "replace")
    const parsed = parseSearchParamsToPrimitives(replaced)
    assert.deepEqual(parsed.taxids, ["10090"])
    assert.equal(parsed.biotypes, undefined)
  })
})

describe("buildAnnotationsListUrl", () => {
  it("uses trailing slash path", () => {
    assert.equal(buildAnnotationsListUrl(), "/annotations/")
    assert.equal(buildAnnotationsListUrl({ taxids: ["9606"] }), "/annotations/?taxids=9606")
  })

  it("preserves comma-containing providers through parse", () => {
    const provider = "Hiller Lab, Senckenberg Research Institute"
    const href = buildAnnotationsListUrl({ providers: [provider] })
    assert.match(href, /^\/annotations\/\?/)
    assert.match(href, /%22/)
    const qs = href.slice(href.indexOf("?") + 1)
    assert.deepEqual(parseSearchParamsToPrimitives(qs).providers, [provider])
  })

  it("encodes slash in provider for list URL", () => {
    const href = buildAnnotationsListUrl({ providers: ["HHMI/UCSF"] })
    assert.match(href, /HHMI%2FUCSF/)
    assert.doesNotMatch(href, /HHMI\/UCSF/)
    const qs = href.slice(href.indexOf("?") + 1)
    assert.deepEqual(parseSearchParamsToPrimitives(qs).providers, ["HHMI/UCSF"])
  })
})

describe("getSearchParamsHash", () => {
  it("is stable regardless of param order", () => {
    const a = getSearchParamsHash("taxids=9606&biotypes=a")
    const b = getSearchParamsHash("biotypes=a&taxids=9606")
    assert.equal(a, b)
  })
})
