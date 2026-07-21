"use client"

import { ArrowRight, Globe, Network } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CommonSearchBar } from "@/components/search/common-search-bar"
import type { CommonSearchResult } from "@/lib/types"
import { listTaxons } from "@/lib/api/taxons"
import { listAssemblies } from "@/lib/api/assemblies"
import { listOrganisms } from "@/lib/api/organisms"
import type { TaxonRecord, AssemblyRecord, OrganismRecord } from "@/lib/api/types"
import { listAnnotations } from "@/lib/api/annotations"
import { useEffect, useMemo, useState } from "react"
import { buildEntityDetailsUrl } from "@/lib/utils"

type Totals = {
    assemblies: number
    organisms: number
    annotations: number
}

const DEFAULT_TOTALS: Totals = {
    assemblies: 0,
    organisms: 0,
    annotations: 0,
}

const STAT_CONFIG = [
    { key: "annotations", label: "Annotations", suffix: "+" },
    { key: "assemblies", label: "Assemblies", suffix: "+" },
    { key: "organisms", label: "Species", suffix: "+" }
] as const satisfies Array<{ key: keyof Totals; label: string; suffix?: string }>

const TEXT_COLOR_MAP = {
    annotations: "text-primary",
    organisms: "text-accent",
    assemblies: "text-secondary",
} as const satisfies Record<keyof Totals, string>

const ANNOTATION_ROUTE_BUILDERS = {
    assembly: (id: string) => buildEntityDetailsUrl("assembly", id),
    taxon: (id: string) => buildEntityDetailsUrl("taxon", id),
    organism: (id: string) => buildEntityDetailsUrl("taxon", id),
} as const

function useAnimatedCounter(end: number, duration: number = 1500) {
    const [count, setCount] = useState(0)

    useEffect(() => {
        if (!end || end <= 0) {
            setCount(0)
            return
        }

        if (duration <= 0) {
            setCount(end)
            return
        }

        const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (prefersReducedMotion) {
            setCount(end)
            return
        }

        let startTime: number | null = null
        let rafId: number | null = null
        const startValue = 0

        const animate = (ts: number) => {
            if (startTime === null) startTime = ts
            const progress = Math.min((ts - startTime) / duration, 1)
            const easeOutQuad = (t: number) => t * (2 - t)
            const current = Math.floor(startValue + (end - startValue) * easeOutQuad(progress))
            setCount(current)
            if (progress < 1) {
                rafId = requestAnimationFrame(animate)
            }
        }

        rafId = requestAnimationFrame(animate)
        return () => {
            if (rafId) cancelAnimationFrame(rafId)
        }
    }, [end, duration])

    return count
}

export function Hero() {
    const router = useRouter()

    const handleExploreAnnotations = () => {
        router.push("/annotations")
    }

    const handleSearchSelect = (result: CommonSearchResult) => {
        const safeId = result?.id !== undefined && result?.id !== null ? String(result.id) : ""
        const builder =
            result?.modelKey && result.modelKey in ANNOTATION_ROUTE_BUILDERS
                ? ANNOTATION_ROUTE_BUILDERS[result.modelKey as keyof typeof ANNOTATION_ROUTE_BUILDERS]
                : undefined

        router.push(safeId && builder ? builder(safeId) : "/annotations")
    }

    // Fetch totals for assemblies, organisms, annotations
    const [totals, setTotals] = useState<Totals>(DEFAULT_TOTALS)
    const [isLoadingTotals, setIsLoadingTotals] = useState(true)
    useEffect(() => {
        let cancelled = false
        async function fetchTotals() {
            setIsLoadingTotals(true)
            try {
                const [assembliesRes, organismsRes, annotationsRes] = await Promise.all([
                    listAssemblies({ limit: 1, offset: 0 }),
                    listOrganisms({ limit: 1, offset: 0 }),
                    listAnnotations({ limit: 1, offset: 0 }),
                ])
                if (!cancelled) {
                    setTotals({
                        assemblies: assembliesRes.total ?? 0,
                        organisms: organismsRes.total ?? 0,
                        annotations: annotationsRes.total ?? 0,
                    })
                }
            } catch (e) {
                // Fail silent; keep zeros
                if (!cancelled) {
                    setTotals({ ...DEFAULT_TOTALS })
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingTotals(false)
                }
            }
        }
        fetchTotals()
        return () => {
            cancelled = true
        }
    }, [])

    const assembliesCount = useAnimatedCounter(totals.assemblies)
    const organismsCount = useAnimatedCounter(totals.organisms)
    const annotationsCount = useAnimatedCounter(totals.annotations)
    const compact = useMemo(() => new Intl.NumberFormat(undefined, { notation: "compact" }), [])
    const stats = useMemo(() => {
        const values: Totals = {
            organisms: organismsCount,
            assemblies: assembliesCount,
            annotations: annotationsCount,
        }

        return STAT_CONFIG.map((config) => {
            const rawValue = values[config.key]
            const formatted = compact.format(rawValue)

            return {
                ...config,
                value: rawValue,
                formattedValue: config.suffix && rawValue > 0 ? `${formatted}${config.suffix}` : formatted,
            }
        })
    }, [organismsCount, assembliesCount, annotationsCount, compact])
    const searchModels = useMemo(
        () => [
            {
                key: "assembly",
                label: "assembly",
                limit: 5,
                fetchResults: async (query: string, limit: number) => {
                    const res = await listAssemblies({ filter: query, limit, offset: 0 })
                    return (res.results ?? []) as AssemblyRecord[]
                },
                getId: (item: AssemblyRecord) => item.assembly_accession,
                getTitle: (item: AssemblyRecord) => item.assembly_name ?? item.assembly_accession ?? "assembly",
                getSubtitle: (item: AssemblyRecord) => typeof (item as any).organism_name === "string" ? (item as any).organism_name as string : undefined,
                getMeta: (item: AssemblyRecord) => typeof (item as any).source === "string" ? (item as any).source as string : undefined,
            },
            {
                key: "organism",
                label: "organism",
                limit: 5,
                fetchResults: async (query: string, limit: number) => {
                    const res = await listOrganisms({ filter: query, limit, offset: 0 })
                    return (res.results ?? []) as OrganismRecord[]
                },
                getId: (item: OrganismRecord) => String(item.taxid),
                getTitle: (item: OrganismRecord) => item.common_name ?? item.organism_name ?? String(item.taxid),
                getSubtitle: (item: OrganismRecord) => item.common_name ? (item.organism_name ?? undefined) : undefined,
                getMeta: (item: OrganismRecord) => `taxid ${item.taxid}`,
            },
            {
                key: "taxon",
                label: "taxon",
                limit: 5,
                fetchResults: async (query: string, limit: number) => {
                    const res = await listTaxons({ filter: query, limit, offset: 0 })
                    return (res.results ?? []) as TaxonRecord[]
                },
                getId: (item: TaxonRecord) => String(item.taxid),
                getTitle: (item: TaxonRecord) => item.scientific_name ?? String(item.taxid),
                getSubtitle: (item: TaxonRecord) => typeof (item as any).common_name === "string" ? (item as any).common_name as string : undefined,
                getMeta: (item: TaxonRecord) => typeof (item as any).rank === "string" ? (item as any).rank as string : undefined,
            },
        ],
        []
    )

    return (
        <section className="relative flex w-full flex-col">
            <div className="container mx-auto flex-1 px-4 pt-32 pb-10 sm:pt-16 sm:pb-8">
                <div className="max-w-4xl mx-auto text-center space-y-12 sm:space-y-14">
                    <div>
                        <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold mb-5 text-balance">
                            <span className="bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Annotrieve</span>
                        </h1>
                        <p className="text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed text-balance mx-auto max-w-3xl">
                        A hub for eukaryotic GFF annotations from Ensembl, NCBI, and other sources. Search, explore, compare, and download genome annotations across species.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="mx-auto max-w-2xl">
                        {/* Configure models for assemblies, organisms, and taxons */}
                        <CommonSearchBar
                            placeholder="Search assemblies, organisms, taxons…"
                            models={searchModels}
                            onSelect={handleSearchSelect}
                            inputClassName="h-12 rounded-xl shadow-lg bg-background/70 dark:bg-muted/40 text-foreground border border-border hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:border-primary/60 transition-colors backdrop-blur-md"
                            dropdownClassName="rounded-xl border border-border/60 shadow-xl bg-card/95 backdrop-blur-md"
                        />
                        <p className="mt-3 text-xs text-muted-foreground">
                            Tip: Type at least 2 characters. You can also paste INSDC accessions.
                        </p>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center justify-center flex-wrap gap-4">
                        <Button
                            onClick={handleExploreAnnotations}
                            size="lg"
                            className="px-7 sm:px-9 py-3.5 sm:py-4.5 text-base sm:text-lg font-semibold gap-2 sm:gap-3 rounded-xl transition-transform duration-200 will-change-transform hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2"
                        >
                            <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span>View Annotations</span>
                        </Button>
                        <div className="relative inline-flex">
                            <Button
                                variant="secondary"
                                onClick={() => router.push("/taxonomy")}
                                size="lg"
                                className="px-7 sm:px-9 py-3.5 sm:py-4.5 text-base sm:text-lg font-semibold gap-2 sm:gap-3 rounded-xl transition-transform duration-200 will-change-transform hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2"
                            >
                                <Network className="h-4 w-4 sm:h-5 sm:w-5" />
                                <span>Explore Taxonomy</span>
                            </Button>
                        </div>
                    </div>

                    {/* Live stats under CTA */}
                    <div className="mx-auto w-full max-w-md sm:max-w-none sm:w-1/2">
                        <dl
                            className="grid grid-cols-1 text-center sm:grid-cols-3"
                            aria-live="polite"
                            aria-busy={isLoadingTotals}
                        >
                            {stats.map(({ key, label, formattedValue }) => (
                                <div key={key} className="flex flex-col items-center text-center">
                                    <dd className={`order-1 text-3xl font-semibold tracking-tight ${TEXT_COLOR_MAP[key]} tabular-nums`}>
                                        {formattedValue}
                                    </dd>
                                    <dt className="order-2 text-sm text-muted-foreground">{label}</dt>
                                </div>
                            ))}
                        </dl>
                    </div>
                </div>
            </div>

            <div>
                <div className="container mx-auto px-4 py-4 sm:py-5">
                    <p className="mx-auto max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
                        Have eukaryotic GFF3 annotations to list?{" "}
                        <Link
                            href="/community"
                            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 rounded-sm"
                        >
                            Join the community registry
                            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </Link>
                    </p>
                </div>
            </div>
        </section>
    )
}
