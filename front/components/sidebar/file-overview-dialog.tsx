"use client"

import { Button } from "@/components/ui/button"
import { X, Download, Copy, Check, Eye, Activity, ExternalLink, MoreVertical, FileDown, FileJson, Info } from "lucide-react"
import { useState, useEffect } from "react"
import type { PortalAnnotation } from "@/lib/types"
import { buildEntityDetailsUrl, cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { downloadContigs } from "@/lib/api/annotations"
import { getAssembly } from "@/lib/api/assemblies"
import { assemblyHasChromosomesFile, contigsFileUrl, headFile } from "@/lib/api/files"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { SourceFileOverview } from "./file-overview-dialog/source-file-overview"
import { FeaturesSummary } from "./file-overview-dialog/features-summary"
import { BuscoScoreSection } from "./file-overview-dialog/busco-score-section"
import { OverviewSection } from "./file-overview-dialog/overview-section"

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

interface FileOverviewSidebarProps {
  annotation: PortalAnnotation | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FileOverviewSidebar({ annotation, open, onOpenChange }: FileOverviewSidebarProps) {
  const router = useRouter()
  const [copiedId, setCopiedId] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [downloadingContigs, setDownloadingContigs] = useState(false)
  const [copiedSource, setCopiedSource] = useState(false)
  const [copiedBgzip, setCopiedBgzip] = useState(false)
  const [canViewInBrowser, setCanViewInBrowser] = useState(false)
  const [browserGateLoading, setBrowserGateLoading] = useState(false)
  const [hasContigsFile, setHasContigsFile] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [primaryActionsOpen, setPrimaryActionsOpen] = useState(false)

  useEffect(() => {
    if (
      annotation == null ||
      !annotation.assembly_accession ||
      !annotation.taxid ||
      !open
    ) {
      setCanViewInBrowser(false)
      setHasContigsFile(false)
      setBrowserGateLoading(false)
      return
    }

    const ann = annotation
    let cancelled = false
    setBrowserGateLoading(true)
    setCanViewInBrowser(false)

    async function checkGates() {
      try {
        let paired: string | undefined
        try {
          const assembly = await getAssembly(ann.assembly_accession)
          paired = assembly.paired_assembly_accession ?? undefined
        } catch {
          paired = undefined
        }
        if (cancelled) return
        const hasChromosomes = await assemblyHasChromosomesFile(
          ann.taxid,
          ann.assembly_accession,
          paired,
        )
        if (!cancelled) setCanViewInBrowser(hasChromosomes)

        if (ann.indexed_file_info?.bgzipped_path) {
          const contigsOk = await headFile(
            contigsFileUrl(ann.indexed_file_info.bgzipped_path),
          )
          if (!cancelled) setHasContigsFile(contigsOk)
        } else if (!cancelled) {
          setHasContigsFile(false)
        }
      } catch {
        if (!cancelled) {
          setCanViewInBrowser(false)
          setHasContigsFile(false)
        }
      } finally {
        if (!cancelled) setBrowserGateLoading(false)
      }
    }

    checkGates()
    return () => {
      cancelled = true
    }
  }, [
    annotation?.assembly_accession,
    annotation?.taxid,
    annotation?.indexed_file_info?.bgzipped_path,
    open,
  ])

  useEffect(() => {
    if (!open) {
      setMoreMenuOpen(false)
      setPrimaryActionsOpen(false)
    }
  }, [open])

  const handleBackdropClose = () => {
    if (moreMenuOpen || primaryActionsOpen) return
    onOpenChange(false)
  }

  const copyAnnotationId = async () => {
    if (!annotation) return
    try {
      await navigator.clipboard.writeText(annotation.annotation_id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const copyToClipboard = async (text: string, urlId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUrl(urlId)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleDownload = (url: string) => {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadAsJSON = () => {
    if (!annotation) return
    const dataStr = JSON.stringify(annotation, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${annotation.annotation_id}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadContigs = async () => {
    if (!annotation) return
    setDownloadingContigs(true)
    try {
      const response = await downloadContigs(
        annotation.annotation_id,
        annotation.indexed_file_info?.bgzipped_path,
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${annotation.annotation_id}_contigs.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Error downloading contigs:", error)
      alert(`Error downloading contigs: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setDownloadingContigs(false)
    }
  }


  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onOpenChange])


  if (!annotation) return null

  const sourceUrl = (annotation.source_file_info as { url_path?: string } | undefined)?.url_path
  const bgzipUrl = annotation.indexed_file_info?.bgzipped_path
    ? `https://genome.crg.es/annotrieve/files${annotation.indexed_file_info.bgzipped_path}`
    : undefined
  const showViewInBrowser = !browserGateLoading && canViewInBrowser
  const hasPrimaryToolbarActions = Boolean(sourceUrl || bgzipUrl || showViewInBrowser)

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ease-in-out",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) handleBackdropClose()
        }}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full z-50 bg-background border-l shadow-lg",
          "transition-transform duration-300 ease-in-out",
          "flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: 'min(800px, 90vw)' }}
      >
        {/* Header */}
        <div className="flex flex-col border-b flex-shrink-0 bg-muted/30">
          {/* Top Bar */}
          <div className="flex items-center justify-between p-4 pb-3">
            <h2 className="text-lg font-semibold">Annotation Overview</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Annotation Info Header */}
          <div className="px-4 pb-4 space-y-3">
            {/* Annotation ID - Most prominent */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Annotation ID</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold text-foreground truncate">{annotation.annotation_id}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={copyAnnotationId}
                    title="Copy annotation ID"
                  >
                    {copiedId ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Organism and Assembly - Compact layout */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* Organism Name */}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Organism</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm text-foreground font-medium truncate" title={annotation.organism_name || 'N/A'}>
                    {annotation.organism_name || 'N/A'}

                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => router.push(buildEntityDetailsUrl("taxon", annotation.taxid))}
                    title="View organism details"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Assembly Info */}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assembly</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  {annotation.assembly_name ? (
                    <span className="text-sm text-foreground truncate" title={annotation.assembly_name}>
                      {annotation.assembly_name}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground truncate" title={annotation.assembly_accession}>
                      {annotation.assembly_accession}
                    </span>
                  )}
                  {annotation.assembly_accession && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => router.push(buildEntityDetailsUrl("assembly", annotation.assembly_accession))}
                      title="View assembly details"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-3 border-t min-w-0">
              {hasPrimaryToolbarActions && (
                <DropdownMenu
                  modal={false}
                  open={primaryActionsOpen}
                  onOpenChange={setPrimaryActionsOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 shrink-0 md:hidden"
                      title="Download and view"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Files</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[100] w-56">
                    <DropdownMenuLabel>Download &amp; view</DropdownMenuLabel>
                    {sourceUrl && (
                      <DropdownMenuItem onClick={() => handleDownload(sourceUrl)}>
                        <FileDown className="h-4 w-4 mr-2" />
                        <span>Download source GFF</span>
                      </DropdownMenuItem>
                    )}
                    {bgzipUrl && (
                      <DropdownMenuItem onClick={() => handleDownload(bgzipUrl)}>
                        <Download className="h-4 w-4 mr-2" />
                        <span>Download BGZip</span>
                      </DropdownMenuItem>
                    )}
                    {showViewInBrowser && (
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(
                            `/jbrowse/?accession=${annotation.assembly_accession}&annotationId=${annotation.annotation_id}`
                          )
                        }
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        <span>View in genome browser</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <div className="hidden md:contents">
              {sourceUrl && (
                <Popover>
                  <div className="flex items-center border rounded-md overflow-hidden shadow-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 rounded-r-none border-r border-r-background/20"
                      onClick={() => handleDownload(sourceUrl)}
                    >
                      <FileDown className="h-4 w-4 mr-1.5" />
                      Download Source
                    </Button>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-2 rounded-l-none"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </div>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Download Source File</h4>
                      <p className="text-sm text-muted-foreground">
                        Download the original GFF file from the source.
                      </p>
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">URL:</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              copyToClipboard(sourceUrl, 'source')
                              setCopiedSource(true)
                              setTimeout(() => setCopiedSource(false), 2000)
                            }}
                          >
                            {copiedSource ? (
                              <>
                                <Check className="h-3 w-3 mr-1 text-green-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        </div>
                        <code className="text-xs break-all text-foreground bg-muted px-2 py-1 rounded block">
                          {sourceUrl}
                        </code>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {bgzipUrl && (
                <Popover>
                  <div className="flex items-center border rounded-md overflow-hidden">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 rounded-r-none border-r border-r-border"
                      onClick={() => handleDownload(bgzipUrl)}
                    >
                      <Download className="h-4 w-4 mr-1.5" />
                      Download BGZip
                    </Button>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-2 rounded-l-none"
                      >
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </div>
                  <PopoverContent className="w-80" align="start">
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">Download BGZipped File</h4>
                      <p className="text-sm text-muted-foreground">
                        Download the sorted and bgzipped file. This file is sorted to be tabix-indexed: the lines starting with # are placed at the top and the GFF is sorted by seqid, start and end positions.
                      </p>
                      <div className="pt-2 border-t">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-muted-foreground">URL:</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              copyToClipboard(bgzipUrl, 'bgzip')
                              setCopiedBgzip(true)
                              setTimeout(() => setCopiedBgzip(false), 2000)
                            }}
                          >
                            {copiedBgzip ? (
                              <>
                                <Check className="h-3 w-3 mr-1 text-green-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 mr-1" />
                                <span>Copy</span>
                              </>
                            )}
                          </Button>
                        </div>
                        <code className="text-xs break-all text-foreground bg-muted px-2 py-1 rounded block">
                          {bgzipUrl}
                        </code>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {showViewInBrowser && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 gap-1.5 shrink-0"
                  onClick={() =>
                    router.push(
                      `/jbrowse/?accession=${annotation.assembly_accession}&annotationId=${annotation.annotation_id}`
                    )
                  }
                  title="View in genome browser"
                >
                  <Eye className="h-4 w-4 shrink-0" />
                  View in Browser
                </Button>
              )}
              </div>

              {/* More — contigs, JSON, copy URLs */}
              <DropdownMenu modal={false} open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3 md:gap-1.5 shrink-0 ml-auto md:ml-0"
                    title="More actions"
                  >
                    <MoreVertical className="h-4 w-4 shrink-0" />
                    <span className="sr-only md:not-sr-only md:inline">More</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[100] w-56">
                  {/* Downloads */}
                  <DropdownMenuLabel>Downloads</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={handleDownloadContigs}
                    disabled={downloadingContigs || !hasContigsFile}
                  >
                    {downloadingContigs ? (
                      <>
                        <Activity className="h-4 w-4 mr-2 animate-pulse" />
                        <span>Downloading file...</span>
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        <span>Contigs file</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadAsJSON}>
                    <FileJson className="h-4 w-4 mr-2" />
                    <span>Metadata as JSON</span>
                  </DropdownMenuItem>

                  {/* Copy URLs */}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Copy URLs</DropdownMenuLabel>
                  {sourceUrl && (
                    <DropdownMenuItem
                      onClick={() => copyToClipboard(sourceUrl, 'source')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      <span>Copy Source URL</span>
                      {copiedUrl === 'source' && <Check className="h-3.5 w-3.5 ml-auto text-green-600" />}
                    </DropdownMenuItem>
                  )}
                  {bgzipUrl && (
                    <DropdownMenuItem
                      onClick={() => copyToClipboard(bgzipUrl, 'bgzip')}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      <span>Copy BGZip URL</span>
                      {copiedUrl === 'bgzip' && <Check className="h-3.5 w-3.5 ml-auto text-green-600" />}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          <SourceFileOverview annotation={annotation} />

          <FeaturesSummary annotation={annotation} />

          {annotation.busco && (
            <BuscoScoreSection annotation={annotation} />
          )}

          {(annotation as any).features_statistics && (
            <OverviewSection
              stats={(annotation as any).features_statistics}
            />
          )}
        </div>
      </div>
    </>
  )
}
