"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { AnnotationsList } from "@/components/annotations/annotations-list"
import { AnnotationsSidebarFilters } from "@/components/annotations/annotations-sidebar-filters"
import { ActiveFilters } from "@/components/annotations/active-filters"
import { useUIStore } from "@/lib/stores/ui"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { listAnnotations } from "@/lib/api/annotations"
import type { AnnotationRecord } from "@/lib/api/types"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { buildEntityDetailsUrl } from "@/lib/utils"

export default function AnnotationsPage() {
  // Detect legacy favorites query param so we can redirect users
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Use UI store for sidebar state
  const {
    isSidebarOpen,
    isDesktop,
    setIsSidebarOpen,
    setIsDesktop,
  } = useUIStore()

  // Get store values
  const buildAnnotationsParams = useAnnotationsFiltersStore((state) => state.buildAnnotationsParams)
  const currentPage = useAnnotationsFiltersStore((state) => state.page)
  const itemsPerPage = useAnnotationsFiltersStore((state) => state.itemsPerPage)
  const sortOption = useAnnotationsFiltersStore((state) => state.sortOption)
  const selectedTaxons = useAnnotationsFiltersStore((state) => state.selectedTaxons)
  const selectedAssemblies = useAnnotationsFiltersStore((state) => state.selectedAssemblies)
  const selectedBioprojects = useAnnotationsFiltersStore((state) => state.selectedBioprojects)
  const selectedAssemblyLevels = useAnnotationsFiltersStore((state) => state.selectedAssemblyLevels)
  const selectedAssemblyStatuses = useAnnotationsFiltersStore((state) => state.selectedAssemblyStatuses)
  const onlyRefGenomes = useAnnotationsFiltersStore((state) => state.onlyRefGenomes)
  const biotypes = useAnnotationsFiltersStore((state) => state.biotypes)
  const featureTypes = useAnnotationsFiltersStore((state) => state.featureTypes)
  const pipelines = useAnnotationsFiltersStore((state) => state.pipelines)
  const providers = useAnnotationsFiltersStore((state) => state.providers)
  const databaseSources = useAnnotationsFiltersStore((state) => state.databaseSources)

  // Local state for annotations
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [totalAnnotations, setTotalAnnotations] = useState(0)
  const [loading, setLoading] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const hasInitializedRef = useRef(false)
  // Redirect legacy entity query params to the new details page
  useEffect(() => {
    const taxonParam = searchParams?.get('taxon')
    const assemblyParam = searchParams?.get('assembly')
    if (taxonParam) {
      router.replace(buildEntityDetailsUrl("taxon", taxonParam))
      return
    }
    if (assemblyParam) {
      router.replace(buildEntityDetailsUrl("assembly", assemblyParam))
    }
  }, [searchParams, router])


  // Fetch annotations
  useEffect(() => {
    const fetchData = async () => {
      const params = buildAnnotationsParams(false, [])
      setLoading(true)
      try {
        const res = await listAnnotations(params as any)
        setAnnotations((res as any)?.results || [])
        setTotalAnnotations((res as any)?.total ?? 0)
      } catch (error) {
        console.error('Error fetching annotations:', error)
        setAnnotations([])
        setTotalAnnotations(0)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    itemsPerPage,
    sortOption,
    selectedTaxons,
    selectedAssemblies,
    selectedBioprojects,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    pipelines,
    providers,
    databaseSources,
    buildAnnotationsParams,
  ])

  // Detect if we're on desktop (md breakpoint) and set initial sidebar state
  useEffect(() => {
    const checkDesktop = () => {
      const desktop = window.innerWidth >= 768
      setIsDesktop(desktop)

      // Initialize sidebar visibility only once to avoid fighting user actions
      if (!hasInitializedRef.current) {
        if (!desktop) {
          // On first mobile load, keep sidebar closed
          setIsSidebarOpen(false)
        } else if (!isSidebarOpen) {
          // On first desktop load, open sidebar by default
          setIsSidebarOpen(true)
        }
        hasInitializedRef.current = true
      }
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [setIsDesktop, setIsSidebarOpen, isSidebarOpen])

  // Removed manual resize logic for sidebar; use responsive fixed widths instead



  return (
    <>
      <RightSidebar />
      <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Overlay - visible when sidebar is open on mobile */}
        <div
          className={`
            fixed inset-0 bg-black/50 z-40
            transition-opacity duration-300 ease-in-out
            ${isSidebarOpen && !isDesktop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
          `}
          onClick={() => setIsSidebarOpen(false)}
        />

        {/* Sidebar Filters */}
        <div
          ref={sidebarRef}
          className={`
            fixed md:relative
            top-0 left-0
            h-full
            z-50 md:z-auto
            bg-background
            flex-shrink-0
            overflow-hidden
            transition-all duration-300 ease-in-out
            ${isSidebarOpen
              ? 'translate-x-0 opacity-100 shadow-lg md:shadow-none border-r'
              : '-translate-x-full md:translate-x-0 md:opacity-0 md:pointer-events-none shadow-none border-r-0'
            }
            ${isSidebarOpen ? 'w-[320px] md:w-[360px]' : 'w-0 md:w-0'}
          `}
        >
          {isSidebarOpen && (
            <div className="w-full h-full">
              <AnnotationsSidebarFilters/>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto min-w-0 w-full">
          <div className="w-full flex flex-col">
            {/* Active Filters */}
            <div className="px-6 pt-6 pb-2">
              <ActiveFilters />
            </div>
            {/* AnnotationsList - header aligns with sidebar header at pt-6 from top */}
            <AnnotationsList
              annotations={annotations}
              totalAnnotations={totalAnnotations}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </>
  )
}

