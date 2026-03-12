"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, FileText, Code, Dna, Activity } from "lucide-react"

interface AnnotationStats {
  annotations: {
    total_count: number
    related_organisms_count: number
    related_assemblies_count: number
  }
  genes: {
    coding_genes?: GeneStats
    non_coding_genes?: GeneStats
    pseudogenes?: GeneStats
  }
  transcripts: {
    [key: string]: TranscriptTypeStats
  }
  features: {
    cds?: FeatureStats
    exons?: FeatureStats
    introns?: FeatureStats
  }
}

interface GeneStats {
  total_count: number
  mean_count: number
  median_count: number
  mean_length: number
  median_length: number
}

interface TranscriptTypeStats {
  total_count: number
  mean_count: number
  median_count: number
  mean_length: number
  median_length: number
}

interface FeatureStats {
  mean_length: number
  median_length: number
}

interface AnnotationsStatsDashboardProps {
  stats: AnnotationStats | null
  loading?: boolean
}

export function AnnotationsStatsDashboard({ stats, loading }: AnnotationsStatsDashboardProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Activity className="h-8 w-8 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No statistics available</p>
        </div>
      </Card>
    )
  }

  // Get top transcript types by total count
  const topTranscripts = Object.entries(stats.transcripts || {})
    .filter(([_, data]) => data.total_count > 0)
    .sort((a, b) => b[1].total_count - a[1].total_count)
    .slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Annotations</p>
              <p className="text-2xl font-bold">{stats.annotations.total_count.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Dna className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Related Organisms</p>
              <p className="text-2xl font-bold">{stats.annotations.related_organisms_count.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Database className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Related Assemblies</p>
              <p className="text-2xl font-bold">{stats.annotations.related_assemblies_count.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gene Statistics */}
      {stats.genes && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Code className="h-5 w-5" />
            Gene Statistics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.genes.coding_genes && (
              <GeneStatsCard
                title="Coding Genes"
                stats={stats.genes.coding_genes}
                color="blue"
              />
            )}
            {stats.genes.non_coding_genes && (
              <GeneStatsCard
                title="Non-coding Genes"
                stats={stats.genes.non_coding_genes}
                color="purple"
              />
            )}
            {stats.genes.pseudogenes && (
              <GeneStatsCard
                title="Pseudogenes"
                stats={stats.genes.pseudogenes}
                color="orange"
              />
            )}
          </div>
        </div>
      )}

      {/* Transcript Types */}
      {topTranscripts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Transcript Types
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {topTranscripts.map(([type, data]) => (
              <TranscriptCard key={type} type={type} stats={data} />
            ))}
          </div>
        </div>
      )}

      {/* Feature Statistics */}
      {stats.features && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Feature Statistics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.features.cds && (
              <FeatureStatsCard
                title="CDS"
                stats={stats.features.cds}
                color="green"
              />
            )}
            {stats.features.exons && (
              <FeatureStatsCard
                title="Exons"
                stats={stats.features.exons}
                color="blue"
              />
            )}
            {stats.features.introns && (
              <FeatureStatsCard
                title="Introns"
                stats={stats.features.introns}
                color="purple"
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function GeneStatsCard({ title, stats, color }: { title: string; stats: GeneStats; color: string }) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Dna className="h-4 w-4" />
        </div>
        <h4 className="font-semibold">{title}</h4>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">Total Count</p>
          <p className="text-lg font-bold">{stats.total_count.toLocaleString()}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Mean Count</p>
            <p className="text-sm font-medium">{stats.mean_count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Median Count</p>
            <p className="text-sm font-medium">{stats.median_count.toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Mean Length</p>
            <p className="text-sm font-medium">{stats.mean_length.toLocaleString()} bp</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Median Length</p>
            <p className="text-sm font-medium">{stats.median_length.toLocaleString()} bp</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

function TranscriptCard({ type, stats }: { type: string; stats: TranscriptTypeStats }) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="mb-3">
        <Badge variant="outline" className="text-xs mb-1">
          {type.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold">{stats.total_count.toLocaleString()}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Mean</p>
            <p className="font-medium">{stats.mean_count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Median</p>
            <p className="font-medium">{stats.median_count.toLocaleString()}</p>
          </div>
        </div>
        {stats.mean_length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Avg Length</p>
            <p className="text-sm font-medium">{stats.mean_length.toLocaleString()} bp</p>
          </div>
        )}
      </div>
    </Card>
  )
}

function FeatureStatsCard({ title, stats, color }: { title: string; stats: FeatureStats; color: string }) {
  const colorClasses = {
    green: "bg-green-500/10 text-green-500",
    blue: "bg-blue-500/10 text-blue-500",
    purple: "bg-purple-500/10 text-purple-500",
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Activity className="h-4 w-4" />
        </div>
        <h4 className="font-semibold">{title}</h4>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Mean Length</p>
          <p className="text-lg font-bold">{stats.mean_length.toLocaleString()} bp</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Median Length</p>
          <p className="text-lg font-bold">{stats.median_length.toLocaleString()} bp</p>
        </div>
      </div>
    </Card>
  )
}

