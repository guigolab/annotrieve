"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Calendar, Database, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { listAssemblies } from "@/lib/api/assemblies"
import type { AssemblyRecord } from "@/lib/api/types"
import { SectionHeader } from "@/components/ui/section-header"
import { buildEntityDetailsUrl } from "@/lib/utils"

interface LatestReleasesProps {
  title?: string
  description?: string
}

export function LatestReleases({ title, description }: LatestReleasesProps) {
    const router = useRouter()
    const [latestAssemblies, setLatestAssemblies] = useState<AssemblyRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function fetchLatestReleases() {
            try {
                const assembliesData = await listAssemblies({
                    sort_by: 'release_date',
                    sort_order: 'desc',
                    limit: 5
                })

                setLatestAssemblies(assembliesData.results || [])
                setIsLoading(false)
            } catch (error) {
                console.error('Failed to fetch latest releases:', error)
                setIsLoading(false)
            }
        }

        fetchLatestReleases()
    }, [])

    if (isLoading) {
        return null
    }

    return (
        <div className="container mx-auto px-4 py-16">
            <SectionHeader
              title={title ?? "Latest Assemblies"}
              description={description ?? "Discover the most recently released genome assemblies from our collection."}
              icon={Clock}
              iconColor="text-green-600"
              iconBgColor="bg-green-500/10"
              align="center"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                {latestAssemblies.map((assembly, index) => (
                    <Card
                        key={assembly.assembly_accession}
                        onClick={() => router.push(buildEntityDetailsUrl("assembly", assembly.assembly_accession))}
                        className="group relative overflow-hidden p-6 hover:shadow-xl hover:scale-105 transition-all duration-300 border-border/50 cursor-pointer animate-in fade-in slide-in-from-bottom-4 bg-gradient-to-br from-card to-card/50"
                        style={{
                            animationDelay: `${index * 100}ms`,
                            animationDuration: '500ms',
                            animationFillMode: 'both'
                        }}
                    >
                        {/* Decorative background gradient */}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                        {/* Content */}
                        <div className="relative space-y-4">
                            {/* Icon with subtle animation */}
                            <div className="flex items-start justify-center">
                                <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300 group-hover:scale-110 transform">
                                    <Database className="h-7 w-7 text-primary" />
                                </div>
                            </div>

                            {/* Main content */}
                            <div className="text-center space-y-3">
                                {/* Organism name with tooltip-like title */}
                                <div className="space-y-1.5">
                                    <h4
                                        className="font-semibold text-foreground text-base line-clamp-2 min-h-[3rem] leading-tight group-hover:text-primary transition-colors duration-300"
                                        title={assembly.organism_name}
                                    >
                                        {assembly.assembly_name}

                                    </h4>
                                    <p
                                        className="text-xs italic text-muted-foreground truncate font-medium"
                                        title={assembly.assembly_name}
                                    >
                                        {assembly.organism_name}

                                    </p>
                                </div>
                            </div>

                            {/* Footer info */}
                            <div className="pt-3 border-t border-border/50 space-y-2.5">
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                    <Calendar className="h-3.5 w-3.5 text-primary/70" />
                                    <span className="font-medium">
                                        {assembly.release_date
                                            ? new Date(assembly.release_date).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })
                                            : 'N/A'}
                                    </span>
                                </div>
                                {assembly.annotations_count !== undefined && assembly.annotations_count > 0 && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs bg-accent/5 rounded-full py-1.5 px-3 mx-auto w-fit">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-pulse" />
                                        <span className="font-medium text-foreground">
                                            {assembly.annotations_count} annotation{assembly.annotations_count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Hover indicator */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    )
}

