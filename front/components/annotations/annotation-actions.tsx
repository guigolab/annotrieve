"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { FileText, Star } from "lucide-react"
import type { Annotation } from "@/lib/types"
import { useRouter } from "next/navigation"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { useUIStore } from "@/lib/stores/ui"
import { getFilesBase, joinUrl } from "@/lib/config/env"

interface AnnotationActionsProps {
  annotation: Annotation
}

export function AnnotationActions({ annotation }: AnnotationActionsProps) {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const openRightSidebar = useUIStore((state) => state.openRightSidebar)
  
  const { isSelected, toggleSelection } = useSelectedAnnotationsStore()
  const isFavorite = mounted ? isSelected(annotation.annotation_id) : false

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleDownload = () => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a')
    link.href = joinUrl(getFilesBase(), annotation.indexed_file_info.bgzipped_path)
    link.download = '' // optional: set a filename if needed
    link.target = '_blank' // open in a new tab if preferred
    link.rel = 'noopener noreferrer'

    // Append to body and simulate click
    document.body.appendChild(link)
    link.click()

    // Clean up
    document.body.removeChild(link)
  }

  const handleViewInBrowser = () => {
    // Use URL navigation instead of bubbling up params
    router.push(`/jbrowse/?accession=${annotation.assembly_accession}&annotationId=${annotation.annotation_id}`)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => toggleSelection(annotation)}
          className={isFavorite ? "text-yellow-500 hover:text-yellow-600" : ""}
        >
          <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => openRightSidebar("file-overview", { annotation })}
        >
          <FileText className="h-4 w-4 mr-2" />
          Details
        </Button>
      </div>

    </>
  )
}
