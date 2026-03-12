"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, Button, LoadingSpinner, NotFound } from "@/components/ui"
import { ExternalLink, Download, ArrowLeft } from "lucide-react"
import { getAssembly } from "@/lib/api/assemblies"
import type { AssemblyRecord } from "@/lib/api/types"
import { ChromosomeViewer } from "@/components/chromosome-viewer"
import Link from "next/link"
import { buildEntityDetailsUrl } from "@/lib/utils"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"

interface AssemblyDetailsViewProps {
    accession?: string | null
    onClose: () => void
}

export function AssemblyDetailsView({ accession: accessionProp, onClose }: AssemblyDetailsViewProps) {
    const router = useRouter()
    const accession = accessionProp ?? null
    const selectedAssemblies = useAnnotationsFiltersStore((state) => state.selectedAssemblies)
    const setSelectedAssemblies = useAnnotationsFiltersStore((state) => state.setSelectedAssemblies)
    const [assembly, setAssembly] = useState<AssemblyRecord | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const handleClose = () => {
        onClose()
    }

    useEffect(() => {
        async function loadData() {
            if (!accession) return

            try {
                setIsLoading(true)

                // Load assembly and annotations in parallel
                const [assemblyData] = await Promise.all([
                    getAssembly(accession),
                ])

                setAssembly(assemblyData)

            } catch (error) {
                console.error('Error loading assembly data:', error)
            } finally {
                setIsLoading(false)
            }
        }

        loadData()
    }, [accession])

    const formatNumber = (num: string | number) => {
        return Number(num).toLocaleString()
    }


    const handleViewAnnotations = () => {
        if (!assembly) return
        setSelectedAssemblies([...selectedAssemblies, assembly])
        router.push('/annotations')
        onClose?.()
    }
    const formatStatValue = (key: string, value: any): string => {
        if (key.includes("length")) {
            const numValue = typeof value === 'string' ? parseFloat(value) : value
            if (numValue > 1000000000) {
                return `${formatNumber(numValue / 1000000000)} Gb`
            }
            if (numValue > 1000000) {
                return `${formatNumber(numValue / 1000000)} Mb`
            }
            if (numValue > 1000) {
                return `${formatNumber(numValue / 1000)} Kb`
            }
            return `${formatNumber(numValue)} bp`
        }
        if (key.includes("percent")) {
            return `${value}%`
        }
        if (key === "genome_coverage") {
            return `${value}x`
        }
        if (key === "atgc_count" || key === "gc_count") {
            return formatNumber(value)
        }
        if (typeof value === "number") {
            return formatNumber(value)
        }
        return value.toString()
    }

    const getStatLabel = (key: string): string => {
        const labels: Record<string, string> = {
            total_sequence_length: "Total Sequence Length",
            total_ungapped_length: "Total Ungapped Length",
            number_of_contigs: "Contigs",
            contig_n50: "Contig N50",
            contig_l50: "Contig L50",
            number_of_scaffolds: "Scaffolds",
            scaffold_n50: "Scaffold N50",
            scaffold_l50: "Scaffold L50",
            gaps_between_scaffolds_count: "Gaps",
            number_of_component_sequences: "Component Sequences",
            atgc_count: "ATGC Count",
            gc_count: "GC Count",
            gc_percent: "GC Content",
            genome_coverage: "Genome Coverage",
            number_of_organelles: "Organelles",
            number_of_plasmids: "Plasmids",
            number_of_chloroplasts: "Chloroplasts",
            number_of_mitochondria: "Mitochondria",
            total_number_of_chromosomes: "Chromosomes"
        }
        return labels[key] || key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    }

    if (!accession) {
        return (
            <div className="container mx-auto px-4 py-6">
                <Card className="p-12 border-2 border-dashed">
                    <div className="text-center text-muted-foreground">
                        <h4 className="text-lg font-semibold text-foreground mb-2">Assembly ID Required</h4>
                        <p className="text-sm mb-4">Please provide an assembly accession in the URL parameter.</p>
                        <Button variant="outline" onClick={handleClose}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Annotations
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <LoadingSpinner />
            </div>
        )
    }

    if (!assembly) {
        return <NotFound title="Assembly Not Found" message="The requested assembly could not be found." buttonText="Back to Annotations" buttonLink="/annotations" />
    }

    const hasChromosomes = assembly.assembly_stats?.total_number_of_chromosomes && assembly.assembly_stats.total_number_of_chromosomes > 0
    const hasRefseqCategory = (assembly as any).refseq_category
    const assemblyLevelValue = ((assembly as any).assembly_level || "").toString()
    const canShowGenomeBrowserButton = ["chromosome", "complete genome"].includes(assemblyLevelValue.toLowerCase())
    const breadcrumbLineage = assembly.organism_name ? [{ label: assembly.organism_name, href: `/taxons?id=${assembly.taxid}` }] : []

    return (
        <div className="bg-background">
            <div className="p-4 space-y-6">
                {breadcrumbLineage.length > 0 && (
                    <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
                        {breadcrumbLineage.map((crumb, index) => (
                            <div key={crumb.href} className="flex items-center gap-1">
                                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                                    {crumb.label}
                                </Link>
                                {index < breadcrumbLineage.length - 1 && <span>&gt;</span>}
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-3xl font-bold text-foreground truncate">
                                {assembly.assembly_name || assembly.assembly_accession}
                            </h1>
                            <p className="text-base text-muted-foreground mt-1">
                                {assembly.assembly_accession}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                        {assembly.download_url && (
                            <Button
                                onClick={() => {
                                    const link = document.createElement('a')
                                    link.href = assembly.download_url as string
                                    link.target = '_blank'
                                    link.rel = 'noopener noreferrer'
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                }}
                                variant="outline"
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                Download Assembly
                            </Button>
                        )}
                        {canShowGenomeBrowserButton && (
                            <Button
                                variant="outline"
                                onClick={() => router.push(`/jbrowse/?accession=${assembly.assembly_accession}`)}
                                className="gap-2"
                            >
                                <ExternalLink className="h-4 w-4" />
                                View in Genome Browser
                            </Button>
                        )}
                        <Button
                            variant="accent" className="gap-2" onClick={handleViewAnnotations}>View annotations </Button>
                    </div>
                </div>

                <div className="space-y-6 mt-6">
                    <Card className="p-5 space-y-4">
                        <div className="space-y-3 text-sm grid grid-cols-2 gap-2">
                            <div>
                                <p className="text-muted-foreground">Accession</p>
                                <p className="font-mono text-foreground">{assembly.assembly_accession}</p>
                            </div>
                            {assembly.paired_assembly_accession && (
                                <div>
                                    <p className="text-muted-foreground">Paired Assembly</p>
                                    <Link href={buildEntityDetailsUrl("assembly", assembly.paired_assembly_accession)} className="font-mono text-primary hover:underline">
                                        {assembly.paired_assembly_accession}
                                    </Link>
                                </div>
                            )}
                            {(assembly as any).assembly_status && (
                                <div>
                                    <p className="text-muted-foreground">Status</p>
                                    <p className="font-mono text-foreground capitalize">{assembly.assembly_status}</p>
                                </div>
                            )}
                            {assembly.release_date && (
                                <div>
                                    <p className="text-muted-foreground">Release Date</p>
                                    <p className="font-mono text-foreground">{new Date(assembly.release_date as string).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}</p>
                                </div>
                            )}
                            {assembly.submitter && (
                                <div>
                                    <p className="text-muted-foreground">Submitter</p>
                                    <p className="font-mono text-foreground">{assembly.submitter as string}</p>
                                </div>
                            )}
                            {(assembly as any).assembly_level && (
                                <div>
                                    <p className="text-muted-foreground">Assembly Level</p>
                                    <p className="font-mono text-foreground capitalize">{(assembly as any).assembly_level}</p>
                                </div>
                            )}
                            {hasRefseqCategory && (
                                <div>
                                    <p className="text-muted-foreground">RefSeq Category</p>
                                    <p className="font-mono text-accent capitalize">{(assembly as any).refseq_category}</p>
                                </div>
                            )}
                            {assembly.organism_name && (
                                <div>
                                    <span className="text-muted-foreground block mb-1">Organism</span>
                                    <Link href={buildEntityDetailsUrl("taxon", String(assembly.taxid))} className="text-sm text-primary hover:underline">
                                        {assembly.organism_name}
                                    </Link>
                                </div>
                            )}
                        </div>
                    </Card>
                    <Card className="p-5 space-y-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h2 className="text-lg font-semibold">Chromosomes</h2>
                                <p className="text-sm text-muted-foreground">
                                    Explore chromosome lengths and navigate to the genome browser.
                                </p>
                            </div>
                        </div>
                        {hasChromosomes ? (
                            <ChromosomeViewer
                                accession={assembly.assembly_accession}
                            />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Chromosome data is not available for this assembly.
                            </p>
                        )}
                    </Card>
                    {assembly.assembly_stats && (
                        <Card className="p-5 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-lg font-semibold">Assembly Statistics</h2>
                                <span className="text-xs text-muted-foreground">
                                    {Object.keys(assembly.assembly_stats).length} metrics
                                </span>
                            </div>
                            <div className="grid grid-cols-4 xs:grid-cols-2 gap-2">
                                {Object.entries(assembly.assembly_stats).map(([key, value]) => (
                                    <div key={key} className="p-3 border rounded-lg bg-muted/30">
                                        <div className="text-xs text-muted-foreground mb-1">{getStatLabel(key)}</div>
                                        <div className="text-lg font-bold text-foreground">{formatStatValue(key, value)}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
