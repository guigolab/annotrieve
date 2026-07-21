"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { FileText, Star } from "lucide-react"
import type { PortalAnnotation } from "@/lib/types"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { useUIStore } from "@/lib/stores/ui"
import { getFilesBase, joinUrl } from "@/lib/config/env"
import { cn } from "@/lib/utils"
import {
  isAnnotationsListPath,
  setAnnotationOverviewId,
} from "@/lib/hooks/use-annotation-overview-url-sync"

interface AnnotationActionsProps {
  annotation: PortalAnnotation
}

export function AnnotationActions({ annotation }: AnnotationActionsProps) {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const openRightSidebar = useUIStore((state) => state.openRightSidebar)

  const { isSelected, toggleSelection } = useSelectedAnnotationsStore()
  const isFavorite = mounted ? isSelected(annotation.annotation_id) : false

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = joinUrl(getFilesBase(), annotation.indexed_file_info.bgzipped_path)
    link.download = ""
    link.target = "_blank"
    link.rel = "noopener noreferrer"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleViewInBrowser = () => {
    router.push(
      `/jbrowse/?accession=${annotation.assembly_accession}&annotationId=${annotation.annotation_id}`
    )
  }

  const handleViewDetails = () => {
    // Optimistic open with card data for snappy UX
    openRightSidebar("file-overview", { annotation })
    if (isAnnotationsListPath(pathname)) {
      // URL is source of truth on /annotations
      setAnnotationOverviewId(router, searchParams, annotation.annotation_id)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 w-8 p-0 sm:h-9 sm:w-9",
            isFavorite ? "text-yellow-500 hover:text-yellow-600" : ""
          )}
          onClick={() => toggleSelection(annotation)}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
          onClick={handleViewDetails}
          title="View details"
        >
          <FileText className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Details</span>
        </Button>
      </div>
    </>
  )
}
