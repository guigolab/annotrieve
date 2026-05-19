"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import JBrowseLinearGenomeViewComponent from "@/components/jbrowse"
import { JBrowseSidebar, JBROWSE_SIDEBAR_WIDTH } from "@/components/jbrowse/jbrowse-sidebar"
import { getAssembly } from "@/lib/api/assemblies"
import { listAnnotations } from "@/lib/api/annotations"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AssemblyRecord, AnnotationRecord } from "@/lib/api/types"
import { ArrowLeft, Dna, PanelLeft, PanelLeftClose } from "lucide-react"

function JBrowseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const accession = searchParams.get("accession")
  const highlightedAnnotationId = searchParams.get("annotationId") ?? ""

  const [assembly, setAssembly] = useState<AssemblyRecord | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)")
    const handler = () => setSidebarOpen(mq.matches)
    handler()
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  useEffect(() => {
    async function fetchData() {
      if (!accession) return

      try {
        setIsLoading(true)
        const assemblyData = await getAssembly(accession)
        const assemblyAccessions = assemblyData.paired_assembly_accession
          ? [accession, assemblyData.paired_assembly_accession].join(",")
          : accession
        const annotationsData = await listAnnotations({
          assembly_accessions: assemblyAccessions,
          limit: 100,
        })

        setAssembly(assemblyData)
        setAnnotations(annotationsData.results ?? [])
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [accession])

  if (!accession) {
    return (
      <div className="flex h-full items-center justify-center">
        <header className="text-center px-6">
          <h1 className="text-2xl font-bold text-destructive mb-4">Invalid accession</h1>
          <p className="text-muted-foreground mb-4">
            No assembly accession provided in URL parameters.
          </p>
          <Link href="/">
            <Button variant="default" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </header>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <button
        type="button"
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          "flex-shrink-0 overflow-hidden border-r border-border bg-background transition-[transform,width] duration-200 ease-out",
          "fixed left-0 top-14 bottom-0 z-50 flex flex-col md:relative md:left-auto md:top-auto md:bottom-auto md:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          sidebarOpen ? "md:w-[var(--jbrowse-sidebar-width)]" : "md:w-0"
        )}
        style={{ "--jbrowse-sidebar-width": `${JBROWSE_SIDEBAR_WIDTH}px` } as React.CSSProperties}
      >
        <div
          className="h-full w-[var(--jbrowse-sidebar-width)] min-w-0 flex flex-col"
          style={{ "--jbrowse-sidebar-width": `${JBROWSE_SIDEBAR_WIDTH}px` } as React.CSSProperties}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border md:hidden shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assembly & annotations
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          <JBrowseSidebar
            accession={accession}
            assembly={assembly}
            annotations={annotations}
            highlightedAnnotationId={highlightedAnnotationId}
            isLoading={isLoading}
            pairedAssemblyAccession={assembly?.paired_assembly_accession}
          />
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-border bg-background px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1.5 shrink-0"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
                <span className="hidden sm:inline text-sm">
                  {sidebarOpen ? "Hide" : "Details"}
                </span>
              </Button>
              <div className="h-5 w-px bg-border/60 shrink-0 hidden sm:block" />
              <div className="flex items-center gap-2 min-w-0">
                <Dna className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-base font-semibold truncate">Genome Browser</h1>
                  <p className="text-xs text-muted-foreground font-mono truncate hidden sm:block">
                    {accession}
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 shrink-0"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline text-sm">Back</span>
            </Button>
          </div>
        </header>

        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div className="absolute inset-0 flex flex-col min-h-0">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading genome browser…</p>
                </div>
              </div>
            }
          >
              <JBrowseLinearGenomeViewComponent
                accession={accession}
                annotations={annotations}
                taxid={assembly?.taxid}
                pairedAssemblyAccession={assembly?.paired_assembly_accession}
              />
          </Suspense>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function JBrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      }
    >
      <JBrowseContent />
    </Suspense>
  )
}
