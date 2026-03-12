"use client"

import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { useUIStore } from "@/lib/stores/ui"

interface INSDCSearchResultsProps {
  query?: string
  onItemSelected?: () => void
}

export function INSDCSearchResults({
  query = "",
  onItemSelected,
}: INSDCSearchResultsProps) {
  const openInsdcSearchModal = useUIStore((state) => state.openInsdcSearchModal)
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return null
  }

  return (
    <div className="px-4 py-6 text-center space-y-4">
      <p className="text-sm text-muted-foreground">
        No matches found for{" "}
        <span className="font-semibold text-foreground">"{normalizedQuery}"</span>
      </p>
      <Button
        onClick={() => {
          openInsdcSearchModal(normalizedQuery)
          onItemSelected?.()
        }}
        variant="outline"
        className="gap-2"
        size="sm"
      >
        <ExternalLink className="h-4 w-4" />
        Search in INSDC
      </Button>
    </div>
  )
}

