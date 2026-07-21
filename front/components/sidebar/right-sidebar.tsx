"use client"

import { useUIStore } from "@/lib/stores/ui"
import { FileOverviewSidebar } from "./file-overview-dialog"
import { AssembliesListTable } from "./assemblies-list-table"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  clearAnnotationOverviewId,
  isAnnotationsListPath,
} from "@/lib/hooks/use-annotation-overview-url-sync"

export function RightSidebar() {
  const rightSidebar = useUIStore((state) => state.rightSidebar)
  const closeRightSidebar = useUIStore((state) => state.closeRightSidebar)
  const { isOpen, view, data } = rightSidebar
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const closeFileOverview = useCallback(() => {
    // Optimistic close — do not wait for URL mirror (avoids reopen races).
    closeRightSidebar()
    if (isAnnotationsListPath(pathname)) {
      clearAnnotationOverviewId(router, searchParams)
    }
  }, [pathname, searchParams, router, closeRightSidebar])

  const handleClose = useCallback(() => {
    if (view === "file-overview") {
      closeFileOverview()
      return
    }
    closeRightSidebar()
  }, [view, closeFileOverview, closeRightSidebar])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose()
      }
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [isOpen, handleClose])

  if (!isOpen || !view) return null

  const getTitle = () => {
    switch (view) {
      case "file-overview":
        return "Annotation Overview"
      case "assemblies-list":
        return "Assemblies List"
      default:
        return "Details"
    }
  }

  // FileOverviewSidebar has its own overlay and structure, so handle it separately
  if (view === "file-overview" && data.annotation) {
    return (
      <FileOverviewSidebar
        annotation={data.annotation}
        open={isOpen}
        onOpenChange={(open) => !open && closeFileOverview()}
      />
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ease-in-out",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={handleClose}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 bg-background border-l shadow-lg",
          "transition-transform duration-300 ease-in-out",
          "flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: "min(800px, 90vw)" }}
      >
        {/* Header - skip for taxon-details (TaxonDetailsSidebar renders its own) */}
        <div className="flex items-center justify-between p-3 border-b flex-shrink-0 bg-muted/30">
          <h2 className="text-lg font-semibold">{getTitle()}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {view === "assemblies-list" && (
            <div className="p-3 h-full overflow-y-auto">
              <AssembliesListTable taxid={data.taxid} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
