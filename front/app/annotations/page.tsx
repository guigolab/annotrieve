"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  SlidersHorizontal,
  PanelLeftClose,
  BarChart3,
  Database,
  FileText,
  MoreHorizontal,
  X,
} from "lucide-react"
import { AnnotationsList } from "@/components/annotations/annotations-list"
import { AnnotationsSidebarFilters } from "@/components/annotations/annotations-sidebar-filters"
import { AnnotationsSortControl } from "@/components/annotations/annotations-sort-control"
import { ActiveFilters } from "@/components/annotations/active-filters"
import { useUIStore } from "@/lib/stores/ui"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { listAnnotations, type FetchAnnotationsParams } from "@/lib/api/annotations"
import type { AnnotationRecord } from "@/lib/api/types"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { FavoritesFloatingButton } from "@/components/layout/favorites-floating-button"
import { DownloadTsvDialog } from "@/components/annotations/download-tsv-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { buildEntityDetailsUrl } from "@/lib/utils"
import { LoadingSpinner } from "@/components/ui/loading"
import { useAnnotationsUrlSync } from "@/lib/hooks/use-annotations-url-sync"
import {
  clearAnnotationOverviewId,
  useAnnotationOverviewUrlSync,
} from "@/lib/hooks/use-annotation-overview-url-sync"

function AnnotationsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  useAnnotationsUrlSync()
  useAnnotationOverviewUrlSync()

  // ── UI store ──────────────────────────────────────────────────────────────
  const {
    isSidebarOpen,
    isDesktop,
    setIsSidebarOpen,
    setIsDesktop,
    openRightSidebar,
  } = useUIStore()

  // ── Filters store ─────────────────────────────────────────────────────────
  const buildAnnotationsParams = useAnnotationsFiltersStore((s) => s.buildAnnotationsParams)
  const currentPage = useAnnotationsFiltersStore((s) => s.page)
  const itemsPerPage = useAnnotationsFiltersStore((s) => s.itemsPerPage)
  const sortOption = useAnnotationsFiltersStore((s) => s.sortOption)
  const setAnnotationsSortOption = useAnnotationsFiltersStore((s) => s.setAnnotationsSortOption)
  const selectedTaxons = useAnnotationsFiltersStore((s) => s.selectedTaxons)
  const selectedAssemblies = useAnnotationsFiltersStore((s) => s.selectedAssemblies)
  const selectedBioprojects = useAnnotationsFiltersStore((s) => s.selectedBioprojects)
  const selectedAssemblyLevels = useAnnotationsFiltersStore((s) => s.selectedAssemblyLevels)
  const selectedAssemblyStatuses = useAnnotationsFiltersStore((s) => s.selectedAssemblyStatuses)
  const onlyRefGenomes = useAnnotationsFiltersStore((s) => s.onlyRefGenomes)
  const biotypes = useAnnotationsFiltersStore((s) => s.biotypes)
  const featureTypes = useAnnotationsFiltersStore((s) => s.featureTypes)
  const featureSources = useAnnotationsFiltersStore((s) => s.featureSources)
  const pipelines = useAnnotationsFiltersStore((s) => s.pipelines)
  const providers = useAnnotationsFiltersStore((s) => s.providers)
  const databaseSources = useAnnotationsFiltersStore((s) => s.databaseSources)
  const buscoCompleteFrom = useAnnotationsFiltersStore((s) => s.buscoCompleteFrom)
  const buscoCompleteTo = useAnnotationsFiltersStore((s) => s.buscoCompleteTo)
  const filtersReady = useAnnotationsFiltersStore((s) => s.filtersReady)

  // Stable ID keys so entity label enrichment does not refetch the list
  const taxidsKey = selectedTaxons.map((t) => String(t.taxid)).join(",")
  const accessionsKey = selectedAssemblies.map((a) => a.assembly_accession).join(",")
  const bioprojectsKey = selectedBioprojects.map((bp) => bp.accession).join(",")

  // ── Local state ───────────────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [totalAnnotations, setTotalAnnotations] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const hasInitializedRef = useRef(false)
  const fetchRequestIdRef = useRef(0)

  const listLoading = loading || !filtersReady

  const handleBrowseAssemblies = useCallback(() => {
    // Dismiss overview + clear deep-link, then open assemblies (sync must not steal).
    clearAnnotationOverviewId(router, searchParams)
    openRightSidebar("assemblies-list")
  }, [openRightSidebar, router, searchParams])

  const handleFiltersToggle = useCallback(() => {
    if (isDesktop) {
      setIsSidebarOpen(!isSidebarOpen)
    } else {
      setIsSidebarOpen(true)
    }
  }, [isDesktop, isSidebarOpen, setIsSidebarOpen])

  const buildDownloadParams = useCallback((): FetchAnnotationsParams => {
    return buildAnnotationsParams(false, []) as FetchAnnotationsParams
  }, [buildAnnotationsParams])

  // ── Redirect legacy entity query params ───────────────────────────────────
  useEffect(() => {
    const taxonParam = searchParams?.get("taxon")
    const assemblyParam = searchParams?.get("assembly")
    if (taxonParam) {
      router.replace(buildEntityDetailsUrl("taxon", taxonParam))
      return
    }
    if (assemblyParam) {
      router.replace(buildEntityDetailsUrl("assembly", assemblyParam))
    }
  }, [searchParams, router])

  // ── Fetch annotations ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!filtersReady) return

    const requestId = ++fetchRequestIdRef.current
    let cancelled = false

    const fetchData = async () => {
      const params = buildAnnotationsParams(false, [])
      setLoading(true)
      try {
        const res = await listAnnotations(params as any)
        if (cancelled || requestId !== fetchRequestIdRef.current) {
          return
        }
        setAnnotations((res as any)?.results || [])
        setTotalAnnotations((res as any)?.total ?? 0)
      } catch (error) {
        if (cancelled || requestId !== fetchRequestIdRef.current) {
          return
        }
        console.error("Error fetching annotations:", error)
        setAnnotations([])
        setTotalAnnotations(0)
      } finally {
        if (!cancelled && requestId === fetchRequestIdRef.current) {
          setLoading(false)
        }
      }
    }
    fetchData()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    itemsPerPage,
    sortOption,
    taxidsKey,
    accessionsKey,
    bioprojectsKey,
    selectedAssemblyLevels,
    selectedAssemblyStatuses,
    onlyRefGenomes,
    biotypes,
    featureTypes,
    featureSources,
    pipelines,
    providers,
    databaseSources,
    buscoCompleteFrom,
    buscoCompleteTo,
    buildAnnotationsParams,
    filtersReady,
  ])

  // ── Desktop detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const checkDesktop = () => {
      const desktop = window.innerWidth >= 768
      setIsDesktop(desktop)
      if (!hasInitializedRef.current) {
        if (!desktop) {
          setIsSidebarOpen(false)
        } else if (!isSidebarOpen) {
          setIsSidebarOpen(true)
        }
        hasInitializedRef.current = true
      }
    }
    checkDesktop()
    window.addEventListener("resize", checkDesktop)
    return () => window.removeEventListener("resize", checkDesktop)
  }, [setIsDesktop, setIsSidebarOpen, isSidebarOpen])

  // ── Result count label ────────────────────────────────────────────────────
  const resultLabel = listLoading
    ? "Fetching results…"
    : totalAnnotations > 0
      ? `${totalAnnotations.toLocaleString()} ${totalAnnotations === 1 ? "result" : "results"}`
      : "No results"

  return (
    <>
      <FavoritesFloatingButton />
      <RightSidebar />
      <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Sidebar filters — no dimmed overlay on mobile; close via Filters toggle */}
        <div
          ref={sidebarRef}
          className={`
            fixed md:relative
            top-14 md:top-auto left-0
            h-[calc(100vh-3.5rem)] md:h-full
            z-50 md:z-auto
            bg-background
            flex-shrink-0
            overflow-hidden
            transition-all duration-300 ease-in-out
            ${
              isSidebarOpen
                ? "translate-x-0 opacity-100 shadow-lg md:shadow-none border-r"
                : "-translate-x-full md:translate-x-0 md:opacity-0 md:pointer-events-none shadow-none border-r-0"
            }
            ${isSidebarOpen ? "w-[320px] md:w-[360px]" : "w-0 md:w-0"}
          `}
        >
          {isSidebarOpen && (
            <div className="w-full h-full flex flex-col min-h-0">
              <div className="flex md:hidden items-center justify-between gap-2 px-3 py-2.5 border-b border-border shrink-0 bg-background">
                <h2 className="text-sm font-semibold text-foreground">Filters</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setIsSidebarOpen(false)}
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <AnnotationsSidebarFilters />
              </div>
            </div>
          )}
        </div>

        {/* Main content column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Sticky page header ──────────────────────────────────────── */}
          <header className="flex-shrink-0 border-b border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur-sm z-10">

            {/* Row 1 — Identity + actions */}
            <div className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 flex items-center gap-1 sm:gap-1.5 lg:gap-2 min-w-0 overflow-hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFiltersToggle}
                aria-pressed={isSidebarOpen}
                className="shrink-0 h-7 w-7 p-0 sm:h-8 sm:w-8 lg:h-9 lg:w-auto lg:px-3 lg:gap-1.5"
                title={isSidebarOpen ? "Hide filters" : "Show filters"}
              >
                {isSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <SlidersHorizontal className="h-4 w-4" />
                )}
                <span className="hidden lg:inline">Filters</span>
              </Button>

              <div className="min-w-0 flex-1 overflow-hidden">
                <h1 className="text-sm sm:text-lg lg:text-2xl font-semibold tracking-tight text-foreground truncate leading-tight">
                  Annotations
                </h1>
                <p className="hidden min-[380px]:block text-[10px] sm:text-sm text-muted-foreground truncate tabular-nums leading-tight">
                  {resultLabel}
                </p>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 sm:h-8 sm:w-8 lg:hidden shrink-0"
                      title="Page actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => router.push("/annotations/analytics")}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analytics
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBrowseAssemblies}>
                      <Database className="h-4 w-4 mr-2" />
                      Browse Assemblies
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReportOpen(true)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Download TSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/annotations/analytics")}
                  className="hidden lg:flex h-9 px-3 gap-1.5 shrink-0"
                  title="Explore gene and transcript statistics"
                >
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  Analytics
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBrowseAssemblies}
                  className="hidden lg:flex h-9 px-3 gap-1.5 shrink-0"
                  title="Open assemblies browser"
                >
                  <Database className="h-4 w-4 shrink-0" />
                  Browse Assemblies
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReportOpen(true)}
                  className="hidden lg:flex h-9 px-3 gap-1.5 shrink-0"
                  title="Download TSV report for current filters"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  Download TSV
                </Button>
                <AnnotationsSortControl
                  sortOption={sortOption}
                  onSortOptionChange={setAnnotationsSortOption}
                />
              </div>
            </div>

            {/* Row 2 — Active filter chips (always mounted; zero height when empty) */}
            <div className="px-3 sm:px-4 lg:px-6 min-h-0">
              <ActiveFilters hideToggle />
            </div>
          </header>

          <DownloadTsvDialog
            open={reportOpen}
            onOpenChange={setReportOpen}
            totalAnnotations={totalAnnotations}
            buildDownloadParams={buildDownloadParams}
          />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <AnnotationsList
              annotations={annotations}
              totalAnnotations={totalAnnotations}
              loading={listLoading}
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default function AnnotationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-6 min-h-[50vh]">
          <LoadingSpinner />
        </div>
      }
    >
      <AnnotationsContent />
    </Suspense>
  )
}
