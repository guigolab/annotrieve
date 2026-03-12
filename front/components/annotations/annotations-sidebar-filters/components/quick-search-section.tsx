"use client"

import { Label } from "@/components/ui/label"
import { CommonSearchBar } from "@/components/search/common-search-bar"
import type { SearchModelConfig } from "@/components/search/common-search-bar"
import { AssemblyRecord, OrganismRecord, TaxonRecord } from "@/lib/api/types"
import { CommonSearchResult } from "@/lib/types"

interface QuickSearchSectionProps {
  models: SearchModelConfig[]
  onSelect: (result: CommonSearchResult<AssemblyRecord | TaxonRecord | OrganismRecord>) => void
}

export function QuickSearchSection({ models, onSelect }: QuickSearchSectionProps) {
  return (
    <div className="px-5 py-5 space-y-4">
      <Label className="text-sm uppercase text-muted-foreground flex items-center gap-2">
        Quick Search
      </Label>
      <CommonSearchBar
        placeholder="Search by organism, taxon or assembly..."
        models={models}
        onSelect={onSelect}
        className="w-full"
      />
    </div>
  )
}

