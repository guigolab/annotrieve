import { describe, it, beforeEach } from "node:test"
import assert from "node:assert/strict"
import {
  storeEntityIdsMatchPrimitives,
  getAnnotationIdParam,
  preserveAnnotationId,
  stripUiParams,
  ANNOTATION_ID_PARAM,
} from "./annotations-url"
import {
  __flushAnnotationsUrlPatchForTests,
  __getPendingPatchForTests,
  __resetAnnotationsUrlWriterForTests,
  getLiveAnnotationsSearchParams,
  noteOverviewDismissIntent,
  noteOverviewOpenIntent,
  patchAnnotationOverviewId,
  patchFilterQuery,
  scheduleAnnotationsUrlPatch,
  shouldSuppressOverviewOpen,
  syncLatestAnnotationsSearch,
} from "./annotations-url-writer"
import type { FiltersState } from "./stores/annotations-filters"

const emptyEntities: Pick<
  FiltersState,
  "selectedTaxons" | "selectedAssemblies" | "selectedBioprojects"
> = {
  selectedTaxons: [],
  selectedAssemblies: [],
  selectedBioprojects: [],
}

describe("storeEntityIdsMatchPrimitives", () => {
  it("matches when taxids agree regardless of order", () => {
    assert.equal(
      storeEntityIdsMatchPrimitives(
        {
          ...emptyEntities,
          selectedTaxons: [
            { taxid: "10090", scientific_name: "Mus musculus" },
            { taxid: "9606", scientific_name: "Homo sapiens" },
          ],
        },
        { taxids: ["9606", "10090"] }
      ),
      true
    )
  })

  it("returns false when store diverged from enrich primitives", () => {
    assert.equal(
      storeEntityIdsMatchPrimitives(
        {
          ...emptyEntities,
          selectedTaxons: [{ taxid: "10090", scientific_name: "Mus musculus" }],
        },
        { taxids: ["9606"] }
      ),
      false
    )
  })

  it("matches empty entity filters", () => {
    assert.equal(storeEntityIdsMatchPrimitives(emptyEntities, {}), true)
  })
})

describe("annotations-url-writer", () => {
  beforeEach(() => {
    __resetAnnotationsUrlWriterForTests()
  })

  it("coalesces filter + overview patches into a single replace with union", async () => {
    const replaces: string[] = []
    const router = {
      replace: (href: string) => {
        replaces.push(href)
      },
    }

    syncLatestAnnotationsSearch("taxids=9606")
    scheduleAnnotationsUrlPatch(router, { filters: new URLSearchParams("taxids=10090") })
    scheduleAnnotationsUrlPatch(router, { annotationId: "ann-1" })

    assert.ok(__getPendingPatchForTests())
    await Promise.resolve() // microtask flush
    __flushAnnotationsUrlPatchForTests()

    assert.equal(replaces.length, 1)
    const qs = replaces[0].includes("?") ? replaces[0].split("?")[1] : ""
    const params = new URLSearchParams(qs)
    assert.equal(params.get("taxids"), "10090")
    assert.equal(params.get(ANNOTATION_ID_PARAM), "ann-1")
  })

  it("preserves live annotation_id when only filters patch", async () => {
    const replaces: string[] = []
    const router = { replace: (href: string) => replaces.push(href) }

    syncLatestAnnotationsSearch("taxids=9606&annotation_id=keep-me")
    patchFilterQuery(router, new URLSearchParams("taxids=10090&sort=date_desc"))
    await Promise.resolve()

    assert.equal(replaces.length, 1)
    const params = new URLSearchParams(replaces[0].split("?")[1] ?? "")
    assert.equal(params.get("taxids"), "10090")
    assert.equal(params.get("sort"), "date_desc")
    assert.equal(params.get(ANNOTATION_ID_PARAM), "keep-me")
  })

  it("clear annotation_id keeps live filters", async () => {
    const replaces: string[] = []
    const router = { replace: (href: string) => replaces.push(href) }

    syncLatestAnnotationsSearch("taxids=9606&annotation_id=ann-1")
    patchAnnotationOverviewId(router, null)
    await Promise.resolve()

    assert.equal(replaces.length, 1)
    const params = new URLSearchParams(replaces[0].split("?")[1] ?? "")
    assert.equal(params.get("taxids"), "9606")
    assert.equal(params.get(ANNOTATION_ID_PARAM), null)
  })

  it("filter then clear in same tick yields filters without annotation_id", async () => {
    const replaces: string[] = []
    const router = { replace: (href: string) => replaces.push(href) }

    syncLatestAnnotationsSearch("taxids=9606&annotation_id=ann-1")
    patchFilterQuery(router, new URLSearchParams("taxids=10090"))
    patchAnnotationOverviewId(router, null)
    await Promise.resolve()

    assert.equal(replaces.length, 1)
    const params = new URLSearchParams(replaces[0].split("?")[1] ?? "")
    assert.equal(params.get("taxids"), "10090")
    assert.equal(getAnnotationIdParam(params), null)
  })

  it("filter then set annotation_id in same tick yields both", async () => {
    const replaces: string[] = []
    const router = { replace: (href: string) => replaces.push(href) }

    syncLatestAnnotationsSearch("taxids=9606")
    patchFilterQuery(router, new URLSearchParams("taxids=10090"))
    patchAnnotationOverviewId(router, "ann-2")
    await Promise.resolve()

    assert.equal(replaces.length, 1)
    const params = new URLSearchParams(replaces[0].split("?")[1] ?? "")
    assert.equal(params.get("taxids"), "10090")
    assert.equal(params.get(ANNOTATION_ID_PARAM), "ann-2")
  })

  it("preserve from live beats stale snapshot", () => {
    syncLatestAnnotationsSearch("taxids=9606&annotation_id=live-id")
    const live = getLiveAnnotationsSearchParams()
    const stale = new URLSearchParams("taxids=9606")
    const target = new URLSearchParams("taxids=10090")
    preserveAnnotationId(target, live)
    assert.equal(target.get(ANNOTATION_ID_PARAM), "live-id")
    preserveAnnotationId(target, stale)
    assert.equal(target.get(ANNOTATION_ID_PARAM), null)
  })

  it("overview dismiss suppresses reopen until clear settles", () => {
    assert.equal(shouldSuppressOverviewOpen(), false)
    noteOverviewDismissIntent()
    assert.equal(shouldSuppressOverviewOpen(), true)
    noteOverviewOpenIntent()
    assert.equal(shouldSuppressOverviewOpen(), false)
    noteOverviewDismissIntent()
    assert.equal(shouldSuppressOverviewOpen(), true)
  })

  it("stripUiParams keeps filters when removing annotation_id", () => {
    const stripped = stripUiParams("taxids=9606&annotation_id=x&sort=date_desc")
    assert.equal(stripped.get("taxids"), "9606")
    assert.equal(stripped.get("sort"), "date_desc")
    assert.equal(stripped.get(ANNOTATION_ID_PARAM), null)
  })
})
