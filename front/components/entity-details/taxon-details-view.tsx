"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, Button, LoadingSpinner, NotFound } from "@/components/ui"
import { Dna, Database, FileText, ChevronRight, Compass } from "lucide-react"
import { getTaxon, getTaxonAncestors, getTaxonChildren } from "@/lib/api/taxons"
import { WikiSummary } from "@/components/wiki-summary"
import type { TaxonRecord } from "@/lib/api/types"
import type { OrganismRecord } from "@/lib/api/types"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { useUIStore } from "@/lib/stores/ui"
import { Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { getAssembliesStats, listAssemblies } from "@/lib/api/assemblies"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { Bar } from 'react-chartjs-2'
import { CategoryScale, LinearScale, BarElement } from 'chart.js'
import { buildEntityDetailsUrl, cn } from "@/lib/utils"
import { getTreeGeneColors, getTreeTranscriptColors, getTreeBuscoColors } from "@/components/taxonomy/taxonomy-tree-controls"
import type { FeatureCountCategory } from "@/components/taxonomy/taxonomy-node-tooltip"

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend)
ChartJS.register(CategoryScale, LinearScale, BarElement)


const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
]

interface TaxonDetailsViewProps {
  taxid?: string | null
  onClose?: () => void
}

export function TaxonDetailsView({ taxid: taxidProp, onClose }: TaxonDetailsViewProps) {
  const router = useRouter()
  const taxid = taxidProp ?? null
  const setSelectedTaxons = useAnnotationsFiltersStore((state) => state.setSelectedTaxons)
  const theme = useUIStore((state) => state.theme)
  const isDark = theme === "dark"
  const legendColor = isDark ? '#e5e7eb' : '#0f172a'
  const geneColors = getTreeGeneColors(isDark)
  const transcriptColors = getTreeTranscriptColors(isDark)
  const buscoColors = getTreeBuscoColors(isDark)
  const [taxon, setTaxon] = useState<TaxonRecord | null>(null)
  const [lineage, setLineage] = useState<TaxonRecord[]>([])
  const [children, setChildren] = useState<TaxonRecord[]>([])
  const [relatedSpecies, setRelatedSpecies] = useState<OrganismRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // Note: Assemblies-related UI removed for a cleaner details view

  // Note: search-related state removed with assemblies list

  // Children annotations distribution
  const [childrenAnnotationsData, setChildrenAnnotationsData] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [loadingChildrenData, setLoadingChildrenData] = useState(false)
  const [directAnnotationsCount, setDirectAnnotationsCount] = useState(0)
  const [hasDirectOrganism, setHasDirectOrganism] = useState(false)

  type DistStats = { mean: number; median: number; std: number; min: number; max: number; n: number }
  type RawCountStats = { mean?: number; median?: number; std?: number; min?: number; max?: number; n?: number }

  // Gene count distribution (from taxon.stats)
  const distributionByCategory = taxon
    ? (() => {
        const stats = (taxon as { stats?: { genes?: Record<string, { count?: RawCountStats }> } }).stats
        if (!stats?.genes) return null
        const out: Record<string, DistStats> = {}
        for (const cat of ["coding", "non_coding", "pseudogene"] as const) {
          const s = stats.genes[cat]?.count
          if (s && typeof s.mean === "number") {
            out[cat] = {
              mean: s.mean,
              median: s.median ?? 0,
              std: s.std ?? 0,
              min: s.min ?? 0,
              max: s.max ?? 0,
              n: s.n ?? 0,
            }
          }
        }
        return Object.keys(out).length ? out : null
      })()
    : null

  // Transcript count distribution (from taxon.stats.transcripts)
  const distributionByTranscript = taxon
    ? (() => {
        const stats = (taxon as { stats?: { transcripts?: Record<string, { count?: RawCountStats }> } }).stats
        if (!stats?.transcripts) return null
        const out: Record<string, DistStats> = {}
        for (const cat of ["mRNA", "lncRNA", "tRNA", "miRNA"] as const) {
          const s = stats.transcripts[cat]?.count
          if (s && typeof s.mean === "number") {
            out[cat] = {
              mean: s.mean,
              median: s.median ?? 0,
              std: s.std ?? 0,
              min: s.min ?? 0,
              max: s.max ?? 0,
              n: s.n ?? 0,
            }
          }
        }
        return Object.keys(out).length ? out : null
      })()
    : null

  // BUSCO distribution (from taxon.stats.busco; each key has mean/median/std/min/max)
  const distributionByBusco = taxon
    ? (() => {
        const stats = (taxon as { stats?: { busco?: Record<string, RawCountStats> } }).stats
        if (!stats?.busco) return null
        const out: Record<string, DistStats> = {}
        for (const cat of ["single_copy", "duplicated", "fragmented", "missing"] as const) {
          const s = stats.busco[cat]
          if (s && typeof s.mean === "number") {
            out[cat] = {
              mean: s.mean,
              median: s.median ?? 0,
              std: s.std ?? 0,
              min: s.min ?? 0,
              max: s.max ?? 0,
              n: s.n ?? 0,
            }
          }
        }
        return Object.keys(out).length ? out : null
      })()
    : null

  const hasFeatureCounts = !!(distributionByCategory || distributionByTranscript || distributionByBusco)
  const featureCategories: FeatureCountCategory[] = [
    ...(distributionByCategory && Object.keys(distributionByCategory).length > 0 ? (["genes"] as const) : []),
    ...(distributionByTranscript && Object.keys(distributionByTranscript).length > 0 ? (["transcripts"] as const) : []),
    ...(distributionByBusco && Object.keys(distributionByBusco).length > 0 ? (["busco"] as const) : []),
  ]
  const [featureCategory, setFeatureCategory] = useState<FeatureCountCategory>("genes")
  useEffect(() => {
    if (featureCategories.length > 0 && !featureCategories.includes(featureCategory)) {
      setFeatureCategory(featureCategories[0])
    }
  }, [featureCategories.join(","), featureCategory])

  // Ratios (computed from taxon counts)
  const organismsCount = taxon?.organisms_count ?? 0
  const assembliesCount = taxon?.assemblies_count ?? 0
  const annotationsCount = taxon?.annotations_count ?? 0
  const ratioOrganismsAnnotations = organismsCount > 0 ? annotationsCount / organismsCount : 0
  const ratioOrganismsAssemblies = assembliesCount > 0 ? annotationsCount / assembliesCount : 0
  const ratioAssembliesAnnotations = organismsCount > 0 ? assembliesCount / organismsCount : 0

  // Assemblies frequencies + reference genomes count
  const [assemblyLevelFreqs, setAssemblyLevelFreqs] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [assemblyStatusFreqs, setAssemblyStatusFreqs] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [referenceGenomesCount, setReferenceGenomesCount] = useState<number>(0)
  const [loadingAssembliesFreqs, setLoadingAssembliesFreqs] = useState(false)

  // Annotations frequencies
  const [databaseFreqs, setDatabaseFreqs] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [topFeatureTypes, setTopFeatureTypes] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [topBiotypes, setTopBiotypes] = useState<Array<{ name: string; value: number; percentage: number }>>([])
  const [loadingAnnotationsFreqs, setLoadingAnnotationsFreqs] = useState(false)

  useEffect(() => {
    async function loadData() {
      if (!taxid) return

      try {
        setIsLoading(true)

        // Reset any previous local view-specific state if needed (none currently)

        // Load taxon, lineage, and children in parallel
        const [taxonData, ancestorsRes, childrenRes] = await Promise.all([
          getTaxon(taxid),
          getTaxonAncestors(taxid),
          getTaxonChildren(taxid)
        ])

        setTaxon(taxonData)
        setLineage(ancestorsRes.results || [])
        setChildren(childrenRes.results || [])
      } catch (error) {
        console.error('Error loading taxon data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [taxid])

  // Load children annotations distribution
  useEffect(() => {
    async function loadChildrenAnnotations() {
      if (!taxid || !taxon) {
        setChildrenAnnotationsData([])
        setDirectAnnotationsCount(0)
        setHasDirectOrganism(false)
        return
      }

      try {
        setLoadingChildrenData(true)

        // Check if there are organisms with the same taxid (direct annotations)
        const directOrganisms = relatedSpecies.filter(org => org.taxid === taxid)
        const hasDirect = directOrganisms.length > 0
        setHasDirectOrganism(hasDirect)

        // Calculate annotations from children
        const childrenAnnotations = children.reduce((sum, child) => sum + (child.annotations_count || 0), 0)

        // Calculate direct annotations (taxon's total - children's total)
        const taxonAnnotations = taxon.annotations_count || 0
        const directAnnotations = Math.max(0, taxonAnnotations - childrenAnnotations)
        setDirectAnnotationsCount(directAnnotations)

        // Prepare data for pie chart - include direct annotations if they exist
        const chartData: Array<{ name: string; value: number; percentage: number }> = []

        // Add direct annotations slice if they exist (always add if > 0 to show in chart)
        if (directAnnotations > 0) {
          chartData.push({
            name: `${taxon.scientific_name || taxon.taxid} (Direct)`,
            value: directAnnotations,
            percentage: (directAnnotations / taxonAnnotations) * 100
          })
        }

        // Add children with annotations
        const childrenData = children
          .filter(child => (child.annotations_count || 0) > 0)
          .map(child => ({
            name: child.scientific_name || child.taxid,
            value: child.annotations_count || 0,
            percentage: ((child.annotations_count || 0) / taxonAnnotations) * 100
          }))
          .sort((a, b) => b.value - a.value)

        chartData.push(...childrenData)

        // Only set data if we have something to show (direct annotations or children)
        if (chartData.length > 0) {
          setChildrenAnnotationsData(chartData)
        } else {
          setChildrenAnnotationsData([])
        }
      } catch (error) {
        console.error('Error loading children annotations data:', error)
        setChildrenAnnotationsData([])
        setDirectAnnotationsCount(0)
        setHasDirectOrganism(false)
      } finally {
        setLoadingChildrenData(false)
      }
    }

    loadChildrenAnnotations()
  }, [taxid, children, taxon, relatedSpecies])

  // Load assemblies and annotations frequency data
  useEffect(() => {
    let cancelled = false
    async function loadFrequencies() {
      if (!taxid) {
        setAssemblyLevelFreqs([])
        setAssemblyStatusFreqs([])
        setReferenceGenomesCount(0)
        setDatabaseFreqs([])
        setTopFeatureTypes([])
        setTopBiotypes([])
        return
      }

      try {
        setLoadingAssembliesFreqs(true)
        setLoadingAnnotationsFreqs(true)

        const assembliesParams = { taxids: taxid }
        const annotationsParams = { taxids: taxid }

        const [
          levelMap,
          statusMap,
          refRes,
          dbMap,
          featureTypeMap,
          biotypeMap
        ] = await Promise.all([
          getAssembliesStats(assembliesParams as any, 'assembly_level').catch(() => ({} as Record<string, number>)),
          getAssembliesStats(assembliesParams as any, 'assembly_status').catch(() => ({} as Record<string, number>)),
          listAssemblies({ ...(assembliesParams as any), refseq_categories: 'reference genome', limit: 1, offset: 0 }).catch(() => ({ total: 0 })),
          getAnnotationsFrequencies('database', annotationsParams as any).catch(() => ({} as Record<string, number>)),
          getAnnotationsFrequencies('feature_type', annotationsParams as any).catch(() => ({} as Record<string, number>)),
          getAnnotationsFrequencies('biotype', annotationsParams as any).catch(() => ({} as Record<string, number>)),
        ])

        if (cancelled) return

        const totalAssemblies = assembliesCount
        const toArrayWithPct = (m: Record<string, number>, denom: number) =>
          Object.entries(m || {})
            .map(([name, value]) => ({
              name,
              value,
              percentage: denom > 0 ? (value / denom) * 100 : 0
            }))
            .sort((a, b) => b.value - a.value)

        setAssemblyLevelFreqs(toArrayWithPct(levelMap, totalAssemblies))
        setAssemblyStatusFreqs(toArrayWithPct(statusMap, totalAssemblies))
        setReferenceGenomesCount((refRes as any)?.total ?? 0)

        const totalAnn = annotationsCount
        const dbArr = toArrayWithPct(dbMap, totalAnn)
        setDatabaseFreqs(dbArr)

        const featureTypeArr = toArrayWithPct(featureTypeMap, totalAnn).slice(0, 10)
        const biotypeArr = toArrayWithPct(biotypeMap, totalAnn).slice(0, 10)
        setTopFeatureTypes(featureTypeArr)
        setTopBiotypes(biotypeArr)
      } catch (e) {
        // handled by individual catches
      } finally {
        if (!cancelled) {
          setLoadingAssembliesFreqs(false)
          setLoadingAnnotationsFreqs(false)
        }
      }
    }

    loadFrequencies()
    return () => { cancelled = true }
  }, [taxid, assembliesCount, annotationsCount])

  // Assemblies infinite scroll logic removed

  // Assemblies selection handler removed

  const handleViewAnnotations = () => {
    if (!taxon) return
    setSelectedTaxons([{ ...taxon, taxid: String(taxon.taxid) }])
    router.push("/annotations")
    onClose?.()
  }

  if (!taxid) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        Select a taxon to view details.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner />
      </div>
    )
  }

  if (!taxon) {
    return (
      <NotFound
        title="Taxon Not Found"
        message="The requested taxon could not be found."
        buttonText="Back to Annotations"
        buttonLink="/annotations"
      />
    )
  }

  // Prepare breadcrumbs
  const breadcrumbLineage = [...lineage].filter(anc => anc.scientific_name !== "cellular organisms").slice(0, -1)

  return (
    <div className="bg-background">
      <div className="p-4 space-y-6">
        {/* Breadcrumbs Row */}
        {breadcrumbLineage.length > 0 && (
          <div className="flex items-center flex-wrap gap-1">
            {breadcrumbLineage.map((ancestor) => (
              <div key={ancestor.taxid} className="flex items-center gap-1">
                <Link href={buildEntityDetailsUrl("taxon", String(ancestor.taxid))} 
                  className="text-xs text-primary hover:underline">
                  {ancestor.scientific_name} 
                </Link>
                <span className="text-xs text-muted-foreground">&gt;</span>
              </div>
            ))}
          </div>
        )}

        {/* Header with Title and Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0">
              <h2 className="text-3xl font-bold text-foreground truncate">
                {taxon.scientific_name}
              </h2>
              <p className="text-base text-muted-foreground italic mt-1">
                {taxon.rank}
              </p>
            </div>
            {/* Compact TaxID Display */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border shrink-0">
              <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">TaxID</span>
              <span className="text-sm font-mono font-bold text-foreground">{taxon.taxid}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {taxon.children && taxon.children.length > 0 && (
                <Button
                  variant="secondary"
                  className="gap-2"
                  asChild
                >
                  <Link href={`/taxonomy?taxon=${encodeURIComponent(taxon.taxid)}`}>
                    <Compass className="h-4 w-4" />
                    Explore lineage
                  </Link>
                </Button>
              )}
              <Button variant="accent" className="gap-2" onClick={handleViewAnnotations}>
                View annotations
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            <WikiSummary
              searchTerm={taxon.scientific_name || ""}
              className="mb-4"
            />

            {/* Counts */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-1">Counts in this taxon</h2>
              <p className="text-xs text-muted-foreground mb-3">Quick overview of organisms, assemblies, and annotations currently under this taxon.</p>
              <div className="space-y-3">
                {taxon.children && taxon.children.length > 0 && (
                  <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <Dna className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-foreground">Organisms</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">{taxon.organisms_count?.toLocaleString() || 0}</span>
                  </div>
                )}
                <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium text-foreground">Assemblies</span>
                  </div>
                  <span className="text-lg font-bold text-foreground">{taxon.assemblies_count?.toLocaleString() || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-foreground">Annotations</span>
                  </div>
                  <span className="text-lg font-bold text-foreground">{taxon.annotations_count?.toLocaleString() || 0}</span>
                </div>
              </div>
            </Card>
            {/* Feature counts: genes, transcripts, BUSCO in one section */}
            {hasFeatureCounts && (
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-1">Feature counts</h2>
                <p className="text-xs text-muted-foreground mb-3">
                  Gene, transcript and BUSCO score distributions across {(taxon?.annotations_count ?? 0).toLocaleString()} annotation
                  {(taxon?.annotations_count ?? 0) !== 1 ? "s" : ""}.
                </p>
                {featureCategories.length > 1 && (
                  <div className="flex gap-0.5 mb-3">
                    {featureCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFeatureCategory(cat)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs font-medium uppercase tracking-wider transition-colors",
                          featureCategory === cat
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        {cat === "genes" ? "Genes" : cat === "transcripts" ? "Transcripts" : "BUSCO"}
                      </button>
                    ))}
                  </div>
                )}
                {featureCategory === "genes" && distributionByCategory && (
                  <div className="space-y-1.5">
                    {Object.entries(distributionByCategory).map(([category, s]) => (
                      <div
                        key={category}
                        className="rounded-md border p-2 border-border"
                        style={{
                          borderColor: category === "coding" ? `${geneColors.coding}40` : category === "non_coding" ? `${geneColors.non_coding}40` : `${geneColors.pseudogene}40`,
                          backgroundColor: category === "coding" ? `${geneColors.coding}10` : category === "non_coding" ? `${geneColors.non_coding}10` : `${geneColors.pseudogene}10`,
                        }}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium capitalize">
                            {category === "non_coding" ? "Non-coding" : category}
                          </span>
                          <span className="tabular-nums">mean {s.mean.toFixed(1)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span>med {s.median.toFixed(0)}</span>
                          <span>std {s.std.toFixed(1)}</span>
                          <span>min {s.min}</span>
                          <span>max {s.max}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {featureCategory === "transcripts" && distributionByTranscript && (
                  <div className="space-y-1.5">
                    {Object.entries(distributionByTranscript).map(([category, s]) => (
                      <div
                        key={category}
                        className="rounded-md border p-2 border-border"
                        style={{
                          borderColor: `${transcriptColors[category as keyof typeof transcriptColors]}40`,
                          backgroundColor: `${transcriptColors[category as keyof typeof transcriptColors]}10`,
                        }}
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-medium">{category}</span>
                          <span className="tabular-nums">mean {s.mean.toFixed(1)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                          <span>med {s.median.toFixed(0)}</span>
                          <span>std {s.std.toFixed(1)}</span>
                          <span>min {s.min}</span>
                          <span>max {s.max}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {featureCategory === "busco" && distributionByBusco && (
                  <div className="space-y-1.5">
                    {Object.entries(distributionByBusco).map(([category, s]) => {
                      const labels: Record<string, string> = {
                        single_copy: "Complete & single-copy (C+S)",
                        duplicated: "Complete & duplicated (C+D)",
                        fragmented: "Fragmented (F)",
                        missing: "Missing (M)",
                      }
                      const color = buscoColors[category as keyof typeof buscoColors]
                      return (
                        <div
                          key={category}
                          className="rounded-md border p-2 border-border"
                          style={{
                            borderColor: `${color}40`,
                            backgroundColor: `${color}10`,
                          }}
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium">{labels[category] ?? category}</span>
                            <span className="tabular-nums">mean {s.mean.toFixed(1)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5 text-[10px] text-muted-foreground">
                            <span>med {s.median.toFixed(0)}</span>
                            <span>std {s.std.toFixed(1)}</span>
                            <span>min {s.min}</span>
                            <span>max {s.max}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}

            {/* Ratios */}
            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-1">Key ratios</h2>
              <p className="text-xs text-muted-foreground mb-3">How dense are annotations and assemblies relative to organisms under this taxon.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Annotations per organism</div>
                  <div className="text-xl font-bold text-foreground">{ratioOrganismsAnnotations.toFixed(3)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{annotationsCount.toLocaleString()} / {organismsCount.toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Annotations per assembly</div>
                  <div className="text-xl font-bold text-foreground">{ratioOrganismsAssemblies.toFixed(3)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{annotationsCount.toLocaleString()} / {assembliesCount.toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Assemblies per organism</div>
                  <div className="text-xl font-bold text-foreground">{ratioAssembliesAnnotations.toFixed(3)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{assembliesCount.toLocaleString()} / {organismsCount.toLocaleString()}</div>
                </div>
              </div>
            </Card>

            {/* Children Annotations Distribution */}
            {childrenAnnotationsData.length > 0 && taxon && (
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-1">Annotations distribution across child taxa</h2>
                <p className="text-xs text-muted-foreground mb-3">Breakdown of annotations directly in this taxon and its immediate children.</p>
              {loadingChildrenData ? (
                <div className="flex items-center justify-center h-48">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                    <p className="text-xs text-muted-foreground">Loading chart...</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {hasDirectOrganism && directAnnotationsCount > 0 && (
                    <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-start gap-2">
                        <div className="text-blue-500 mt-0.5">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-foreground font-medium mb-0.5">
                            Direct Annotations
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {directAnnotationsCount.toLocaleString()} annotation{directAnnotationsCount !== 1 ? 's' : ''} directly linked
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="h-[280px] flex items-center justify-center">
                    <Pie
                      data={{
                        labels: childrenAnnotationsData.map(item => `${item.name} (${item.percentage.toFixed(1)}%)`),
                        datasets: [
                          {
                            data: childrenAnnotationsData.map(item => item.value),
                            backgroundColor: childrenAnnotationsData.map((_, index) => COLORS[index % COLORS.length]),
                            borderColor: childrenAnnotationsData.map((_, index) => COLORS[index % COLORS.length]),
                            borderWidth: 1.5,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom' as const,
                            labels: {
                              color: legendColor,
                              font: { size: 11 },
                              padding: 8,
                              boxWidth: 14,
                            },
                          },
                          tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#ffffff',
                            bodyColor: '#ffffff',
                            borderColor: '#374151',
                            borderWidth: 1,
                            padding: 10,
                            titleFont: {
                              size: 11,
                            },
                            bodyFont: {
                              size: 10,
                            },
                            callbacks: {
                              label: function (context: any) {
                                const label = context.label || ''
                                const value = context.parsed || 0
                                const total = taxon.annotations_count || 0
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
                                return `${label}: ${value.toLocaleString()} (${percentage}%)`
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground text-center">
                    Total: {taxon.annotations_count?.toLocaleString() || 0} annotations
                  </div>
                </div>
              )}
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Assemblies Distribution (level only) */}
            {assemblyLevelFreqs.length > 0 && (
              <Card className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-semibold">Assemblies by level</h2>
                    <p className="text-xs text-muted-foreground">Distribution of assemblies under this taxon by assembly level.</p>
                  </div>
                  <div className="text-xs">
                    <span className="px-2 py-1 rounded-md bg-emerald-600/10 border border-emerald-600/30 text-emerald-700 shadow-sm">
                      Reference genomes: <span className="font-semibold">{referenceGenomesCount.toLocaleString()}</span>
                    </span>
                  </div>
                </div>
                {loadingAssembliesFreqs ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                      <p className="text-xs text-muted-foreground">Loading chart...</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[260px]">
                    <Pie
                      data={{
                        labels: assemblyLevelFreqs.map(d => `${d.name} (${d.percentage.toFixed(1)}%)`),
                        datasets: [
                          {
                            data: assemblyLevelFreqs.map(d => d.value),
                            backgroundColor: assemblyLevelFreqs.map((_, i) => COLORS[i % COLORS.length]),
                            borderColor: assemblyLevelFreqs.map((_, i) => COLORS[i % COLORS.length]),
                            borderWidth: 1.5,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom' as const,
                            labels: { color: legendColor, font: { size: 11 }, padding: 8, boxWidth: 14 },
                          },
                          tooltip: {
                            callbacks: {
                              label: (context: any) => {
                                const label = context.label || ''
                                const value = context.parsed || 0
                                const total = assembliesCount || 0
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
                                return `${label}: ${value.toLocaleString()} (${percentage}%)`
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </Card>
            )}

            {/* Database sources (separate card) */}
            {databaseFreqs.length > 0 && (
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-1">Annotation database sources</h2>
                <p className="text-xs text-muted-foreground mb-3">Where the annotations under this taxon come from.</p>
                {loadingAnnotationsFreqs ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                      <p className="text-xs text-muted-foreground">Loading chart...</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[260px]">
                    <Pie
                      data={{
                        labels: databaseFreqs.map(d => `${d.name} (${d.percentage.toFixed(1)}%)`),
                        datasets: [
                          {
                            data: databaseFreqs.map(d => d.value),
                            backgroundColor: databaseFreqs.map((_, i) => COLORS[i % COLORS.length]),
                            borderColor: databaseFreqs.map((_, i) => COLORS[i % COLORS.length]),
                            borderWidth: 1.5,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom' as const,
                            labels: { color: legendColor, font: { size: 11 }, padding: 8, boxWidth: 14 },
                          },
                          tooltip: {
                            callbacks: {
                              label: (context: any) => {
                                const label = context.label || ''
                                const value = context.parsed || 0
                                const total = annotationsCount || 0
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
                                return `${label}: ${value.toLocaleString()} (${percentage}%)`
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </Card>
            )}

            {/* Top feature types and biotypes */}
            {(topFeatureTypes.length > 0 || topBiotypes.length > 0) && (
              <Card className="p-4">
                <h2 className="text-lg font-semibold mb-1">Top annotation categories</h2>
                <p className="text-xs text-muted-foreground mb-3">Most frequent feature types and biotypes among annotations under this taxon.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {topFeatureTypes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Top 10 Feature Types</h3>
                      <div className="h-[280px]">
                        <Bar
                          data={{
                            labels: topFeatureTypes.map(d => d.name),
                            datasets: [
                              {
                                label: 'Percentage of total annotations',
                                data: topFeatureTypes.map(d => d.percentage),
                                backgroundColor: '#3b82f6',
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            indexAxis: 'y',
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (context: any) => `${context.raw.toFixed(2)}%`,
                                },
                              },
                            },
                            scales: {
                              x: {
                                ticks: { callback: (val: any) => `${val}%`, color: '#64748b', font: { size: 10 } },
                                grid: { display: false },
                              },
                              y: {
                                ticks: { color: '#64748b', font: { size: 10 } },
                                grid: { display: false },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {topBiotypes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium mb-2">Top 10 Biotypes</h3>
                      <div className="h-[280px]">
                        <Bar
                          data={{
                            labels: topBiotypes.map(d => d.name),
                            datasets: [
                              {
                                label: 'Percentage of total annotations',
                                data: topBiotypes.map(d => d.percentage),
                                backgroundColor: '#10b981',
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            indexAxis: 'y',
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (context: any) => `${context.raw.toFixed(2)}%`,
                                },
                              },
                            },
                            scales: {
                              x: {
                                ticks: { callback: (val: any) => `${val}%`, color: '#64748b', font: { size: 10 } },
                                grid: { display: false },
                              },
                              y: {
                                ticks: { color: '#64748b', font: { size: 10 } },
                                grid: { display: false },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}


          </div>
        </div>
      </div>
    </div>
  )
}
