"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getTaxon } from "@/lib/api/taxons"
import type { TaxonRecord } from "@/lib/api/types"

const EUKARYOTA_TAXID = "2759"

export type TaxonomyPayload = { taxid: string; taxon: TaxonRecord }

interface UseTaxonomyUrlSyncOptions {
  /** Current root payload (for display). When URL taxid changes, we fetch and call setRootPayload. */
  rootPayload: TaxonomyPayload | null
  setRootPayload: (payload: TaxonomyPayload | null) => void
  /** Called when we load from URL on mount/nav (e.g. set view to overview). */
  setActiveView?: (view: "overview" | "tree" | "constant-branch" | "gene-stack") => void
}

/**
 * URL as source of truth for taxonomy root.
 * - Middleware ensures /taxonomy always has ?taxon=<taxid> (redirects if missing).
 * - When the taxid in the URL changes, we fetch the taxon and set rootPayload.
 * - The page updates the URL only on user navigation (handleSetRoot → router.replace).
 * No bidirectional sync: URL is read here; URL is written only by the page when the user navigates.
 */
export function useTaxonomyUrlSync({
  rootPayload,
  setRootPayload,
  setActiveView,
}: UseTaxonomyUrlSyncOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const taxidFromUrl = searchParams?.get("taxon")
    if (!taxidFromUrl) {
      router.replace("/taxonomy?taxon=" + EUKARYOTA_TAXID, { scroll: false })
      return
    }
    if (rootPayload?.taxid === taxidFromUrl) return

    let cancelled = false
    getTaxon(taxidFromUrl)
      .then((taxonData) => {
        if (cancelled) return
        const payload: TaxonomyPayload = {
          taxid: taxonData.taxid,
          taxon: {
            taxid: taxonData.taxid,
            scientific_name: taxonData.scientific_name,
            rank: taxonData.rank,
            organisms_count: taxonData.organisms_count,
            assemblies_count: taxonData.assemblies_count,
            annotations_count: taxonData.annotations_count,
          },
        }
        setRootPayload(payload)
        setActiveView?.("overview")
      })
      .catch(() => {
        if (!cancelled) router.replace("/taxonomy?taxon=" + EUKARYOTA_TAXID, { scroll: false })
      })

    return () => {
      cancelled = true
    }
  }, [searchParams, router, setRootPayload, setActiveView, rootPayload?.taxid])
}
