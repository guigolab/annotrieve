"use client"

import { listOrganisms } from "@/lib/api/organisms"
import { listAssemblies } from "@/lib/api/assemblies"
import { listTaxons } from "@/lib/api/taxons"
import type { AssemblyRecord, TaxonRecord } from "@/lib/api/types"
import type { SearchModelConfig } from "@/components/search/common-search-bar"

const formatAnnotations = (count?: number) => {
  if (typeof count !== "number" || Number.isNaN(count) || count <= 0) return undefined
  return `${count.toLocaleString()} annotations`
}

export function createOrganismSearchModel(limit = 5): SearchModelConfig {
  return {
    key: "organism",
    label: "Organism",
    limit,
    fetchResults: async (query, modelLimit) => {
      const response = await listOrganisms({ filter: query, limit: modelLimit, offset: 0 })
      return response?.results || []
    },
    getId: (item: any) => {
      if (item.taxid) return String(item.taxid)
      if (item.organism_name) return `organism-${item.organism_name}`
      if (item.common_name) return `organism-${item.common_name}`
      return `organism-${Math.random().toString(36).slice(2, 10)}`
    },
    getTitle: (item: any) => item.common_name || item.organism_name || item.scientific_name || item.taxid,
    getSubtitle: (item: any) => item.organism_name || item.scientific_name || undefined,
    getMeta: (item: any) => formatAnnotations(item.annotations_count ?? item.annotationCount),
  }
}

interface TaxonModelOptions {
  requireChildren?: boolean
}

export function createTaxonSearchModel(limit = 5, options: TaxonModelOptions = {}): SearchModelConfig<TaxonRecord> {
  return {
    key: "taxon",
    label: "Taxon",
    limit,
    fetchResults: async (query, modelLimit) => {
      const response = await listTaxons({ filter: query, limit: modelLimit, offset: 0 })
      let items: TaxonRecord[] = response?.results || []

      if (options.requireChildren) {
        items = items.filter((taxon) => {
          const childCount =
            typeof (taxon as any).children_count === "number" ? (taxon as any).children_count : (taxon.children || []).length
          return childCount > 0
        })
      }

      return items
    },
    getId: (item) => String(item.taxid),
    getTitle: (item: any) => item.common_name || item.scientific_name || item.taxid,
    getSubtitle: (item) =>
      item.rank && item.scientific_name ? `${item.rank} • ${item.scientific_name}` : item.scientific_name || undefined,
    getMeta: (item) => formatAnnotations(item.annotations_count),
  }
}

export function createAssemblySearchModel(limit = 5): SearchModelConfig<AssemblyRecord> {
  return {
    key: "assembly",
    label: "Assembly",
    limit,
    fetchResults: async (query, modelLimit) => {
      const response = await listAssemblies({ filter: query, limit: modelLimit, offset: 0 })
      return response?.results || []
    },
    getId: (item) => item.assembly_accession,
    getTitle: (item) => item.assembly_name || item.assembly_accession,
    getSubtitle: (item) =>
      item.organism_name && item.assembly_accession
        ? `${item.organism_name} • ${item.assembly_accession}`
        : item.organism_name || item.assembly_accession,
    getMeta: (item) => formatAnnotations(item.annotations_count),
  }
}

