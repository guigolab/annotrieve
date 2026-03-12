"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getTaxon } from "@/lib/api/taxons"
import type { TaxonRecord } from "@/lib/api/types"

const EUKARYOTA_TAXID = "2759"

export type TaxonomyPayload = { taxid: string; taxon: TaxonRecord }

interface UseTaxonomyUrlSyncOptions {
  rootTaxon: TaxonomyPayload | null
  setRootTaxon: (payload: TaxonomyPayload | null) => void
  setSelectedTaxon: (payload: TaxonomyPayload | null) => void
  setActiveView: (view: "overview" | "tree" | "constant-branch" | "gene-stack") => void
}

/**
 * Handles URL <-> state sync for taxonomy explorer:
 * - URL always has ?taxon=<taxid>. If missing, redirects to ?taxon=2759 (Eukaryota).
 * - On mount: loads taxon from URL, sets as root; 2759 is a normal root (no special "null" state).
 * - When root changes: updates URL to /taxonomy?taxon=<rootTaxon.taxid>.
 */
export function useTaxonomyUrlSync({
  rootTaxon,
  setRootTaxon,
  setSelectedTaxon,
  setActiveView,
}: UseTaxonomyUrlSyncOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasHydratedRef = useRef(false)

  useEffect(() => {
    const taxidFromUrl = searchParams?.get("taxon")
    if (!taxidFromUrl) {
      router.replace("/taxonomy?taxon=" + EUKARYOTA_TAXID, { scroll: false })
      return
    }
    if (rootTaxon?.taxid === taxidFromUrl) {
      hasHydratedRef.current = true
      return
    }

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
        setRootTaxon(payload)
        setSelectedTaxon(payload)
        setActiveView("overview")
      })
      .catch(() => {
        if (!cancelled) router.replace("/taxonomy?taxon=" + EUKARYOTA_TAXID, { scroll: false })
      })
      .finally(() => {
        if (!cancelled) hasHydratedRef.current = true
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally omit rootTaxon: we only sync
    // URL→state when the URL changes (searchParams). Including rootTaxon would make this effect re-run
    // when the user sets a new root from the UI, fetch the OLD taxid from the URL, and overwrite their
    // selection—causing the URL to never update in production (where fetches complete before router.replace).
  }, [searchParams, router, setRootTaxon, setSelectedTaxon, setActiveView])

  useEffect(() => {
    if (!hasHydratedRef.current || !rootTaxon) return
    const urlTaxid = searchParams?.get("taxon")
    const desiredUrl = `/taxonomy?taxon=${rootTaxon.taxid}`
    if (urlTaxid === rootTaxon.taxid) return
    router.replace(desiredUrl, { scroll: false })
  }, [rootTaxon?.taxid, searchParams, router])
}
