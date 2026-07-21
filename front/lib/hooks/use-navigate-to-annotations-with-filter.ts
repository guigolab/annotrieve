"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  buildAnnotationsListUrl,
  buildIncomingNavParams,
  hasActiveSearchParams,
} from "@/lib/annotations-url"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import type { AssemblyRecord, TaxonRecord } from "@/lib/api/types"

export type NavigateToAnnotationsInput = {
  taxon?: TaxonRecord | null
  assembly?: AssemblyRecord | null
}

/**
 * Navigate to the annotations list with taxon/assembly filters applied via URL.
 * If session-stored filters exist, opens a confirm dialog (merge vs replace).
 */
export function useNavigateToAnnotations() {
  const router = useRouter()
  const lastKnownSearchParams = useAnnotationsFiltersStore((s) => s.lastKnownSearchParams)
  const setPendingAnnotationsNav = useAnnotationsFiltersStore((s) => s.setPendingAnnotationsNav)

  return useCallback(
    (input?: NavigateToAnnotationsInput) => {
      const taxid =
        input?.taxon?.taxid != null && String(input.taxon.taxid) !== ""
          ? String(input.taxon.taxid)
          : undefined
      const accession = input?.assembly?.assembly_accession || undefined

      if (!taxid && !accession) {
        router.push(buildAnnotationsListUrl())
        return
      }

      const incoming = buildIncomingNavParams({ taxid, accession })
      const label =
        input?.taxon?.scientific_name ||
        input?.assembly?.assembly_name ||
        taxid ||
        accession ||
        "this filter"

      if (!hasActiveSearchParams(lastKnownSearchParams)) {
        router.push(buildAnnotationsListUrl(incoming))
        return
      }

      setPendingAnnotationsNav({ incoming, label })
    },
    [router, lastKnownSearchParams, setPendingAnnotationsNav]
  )
}

/** @deprecated Use useNavigateToAnnotations */
export const useNavigateToAnnotationsWithFilter = useNavigateToAnnotations

export type NavigateToAnnotationsFilterInput = NavigateToAnnotationsInput
