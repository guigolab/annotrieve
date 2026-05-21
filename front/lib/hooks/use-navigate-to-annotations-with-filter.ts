"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { buildAnnotationsListUrl } from "@/lib/utils"
import type { AssemblyRecord, TaxonRecord } from "@/lib/api/types"

export type NavigateToAnnotationsFilterInput = {
  taxon?: TaxonRecord | null
  assembly?: AssemblyRecord | null
}

/**
 * Navigate to the annotations list with taxon/assembly filters applied.
 * Merges into existing filters when the record is not already selected.
 */
export function useNavigateToAnnotationsWithFilter() {
  const router = useRouter()
  const selectedTaxons = useAnnotationsFiltersStore((s) => s.selectedTaxons)
  const selectedAssemblies = useAnnotationsFiltersStore((s) => s.selectedAssemblies)
  const setSelectedTaxons = useAnnotationsFiltersStore((s) => s.setSelectedTaxons)
  const setSelectedAssemblies = useAnnotationsFiltersStore((s) => s.setSelectedAssemblies)

  return useCallback(
    (input?: NavigateToAnnotationsFilterInput) => {
      let taxons = selectedTaxons
      let assemblies = selectedAssemblies

      const taxon = input?.taxon
      if (taxon?.taxid != null && String(taxon.taxid) !== "") {
        const taxid = String(taxon.taxid)
        if (!taxons.some((t) => String(t.taxid) === taxid)) {
          taxons = [...taxons, { ...taxon, taxid }]
          setSelectedTaxons(taxons)
        }
      }

      const assembly = input?.assembly
      const accession = assembly?.assembly_accession
      if (accession) {
        if (!assemblies.some((a) => a.assembly_accession === accession)) {
          assemblies = [...assemblies, assembly]
          setSelectedAssemblies(assemblies)
        }
      }

      router.push(
        buildAnnotationsListUrl({
          taxids: taxons.map((t) => String(t.taxid)),
          accessions: assemblies
            .map((a) => a.assembly_accession)
            .filter((a): a is string => Boolean(a)),
        })
      )
    },
    [
      router,
      selectedTaxons,
      selectedAssemblies,
      setSelectedTaxons,
      setSelectedAssemblies,
    ]
  )
}
