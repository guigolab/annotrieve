"use client"

import { useEffect, useState } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, Download, Github, Server } from "lucide-react"
import { ReactNode } from "react"
import { SectionHeader } from "@/components/ui/section-header"

interface DatabaseFrequency {
  name: string
  value: number
  percentage: string
  description: string
  color: string
  downloadUrl: string
}

// Animated counter hook
function useAnimatedCounter(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (end === 0) return

    let startTime: number | null = null
    const startValue = 0

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      
      // Easing function for smooth animation
      const easeOutQuad = (t: number) => t * (2 - t)
      const currentCount = Math.floor(startValue + (end - startValue) * easeOutQuad(progress))
      
      setCount(currentCount)
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setCount(end)
      }
    }

    requestAnimationFrame(animate)
  }, [end, duration])

  return count
}

const DATABASE_INFO = {
  'Ensembl': {
    description: 'Rapid release and curated annotations',
    color: '#6366f1',
    bgColor: 'bg-indigo-500/10',
    downloadUrl: 'https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/ensembl_annotations.tsv'
  },
  'RefSeq': {
    description: 'Curated high-quality annotations',
    color: '#10b981',
    bgColor: 'bg-emerald-500/10',
    downloadUrl: 'https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/refseq_annotations.tsv'
  },
  'GenBank': {
    description: 'Community submitted annotations',
    color: '#f59e0b',
    bgColor: 'bg-amber-500/10',
    downloadUrl: 'https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/genbank_annotations.tsv'
  }
}

// Download function for TSV files
const downloadTSV = async (url: string, filename: string) => {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to fetch file')
    }
    const blob = await response.blob()
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  } catch (error) {
    console.error('Download failed:', error)
    // Fallback to opening in new tab
    window.open(url, '_blank')
  }
}

// Database Item Component
function DatabaseItem({ database, index }: { database: DatabaseFrequency; index: number }) {
  const animatedValue = useAnimatedCounter(database.value)
  const [isDownloading, setIsDownloading] = useState(false)
  const delay = `${index * 150}ms`
  const percentageNumber = Number(database.percentage)

  const handleDownload = async () => {
    setIsDownloading(true)
    const filename = `${database.name.toLowerCase().replace(/\s+/g, '_')}_annotations.tsv`
    await downloadTSV(database.downloadUrl, filename)
    setIsDownloading(false)
  }

  return (
    <Card
      className="group relative flex h-full flex-col border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        animationDelay: delay,
        animationDuration: "600ms",
        animationFillMode: "both",
      }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className="p-3 rounded-lg transition-all duration-300 group-hover:scale-110 flex-shrink-0"
            style={{ backgroundColor: `${database.color}20` }}
          >
            <Server className="h-6 w-6" style={{ color: database.color }} />
          </div>

          {/* Name & description */}
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-lg font-semibold leading-tight">
              {database.name}
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              {database.description}
            </CardDescription>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col items-end text-right gap-1 flex-shrink-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Annotations
          </p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {animatedValue.toLocaleString()}
          </p>
          <span className="inline-flex items-center rounded-full border border-border/70 bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {database.percentage}% of total
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 flex flex-col gap-4">
        {/* Distribution bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Share of annotations</span>
            <span>{database.percentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.max(0, Math.min(100, isNaN(percentageNumber) ? 0 : percentageNumber))}%`,
                backgroundColor: database.color,
              }}
            />
          </div>
        </div>

        {/* Download action */}
        <div className="mt-2">
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            variant="outline"
            className="w-full justify-center gap-2 transition-transform duration-200 hover:scale-[1.01] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download
              className={`h-4 w-4 transition-transform duration-300 ${
                isDownloading ? "animate-spin" : ""
              }`}
            />
            {isDownloading ? "Downloading TSV…" : "Download TSV"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface DatabaseFrequenciesProps {
  title?: string
  description?: ReactNode
}

export function DatabaseFrequencies({ title, description }: DatabaseFrequenciesProps) {
  const [data, setData] = useState<DatabaseFrequency[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const frequencies = await getAnnotationsFrequencies('database')
        
        // Transform the data and calculate percentages
        const total = Object.values(frequencies).reduce((sum, count) => sum + count, 0)
        const transformedData = Object.entries(frequencies)
          .map(([name, value]) => ({
            name,
            value,
            percentage: ((value / total) * 100).toFixed(1),
            description: DATABASE_INFO[name as keyof typeof DATABASE_INFO]?.description || 'Database annotations',
            color: DATABASE_INFO[name as keyof typeof DATABASE_INFO]?.color || '#6b7280',
            downloadUrl: DATABASE_INFO[name as keyof typeof DATABASE_INFO]?.downloadUrl || '#'
          }))
          .sort((a, b) => b.value - a.value)

        setData(transformedData)
      } catch (err) {
        setError('Failed to load database frequencies')
        console.error('Error fetching database frequencies:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Database Sources Overview"}
          description={description ?? (
            <>
              Annotrieve automatically updates annotation data from Ensembl, NCBI RefSeq, and GenBank each week using TSV files.
              These files are available for download from each card, and the automation code is published on GitHub.
            </>
          )}
          icon={Server}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground">Loading database sources...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16">
        <SectionHeader
          title={title ?? "Database Sources Overview"}
          description={description ?? (
            <>
              We track the annotations present in the FTP servers of Ensembl, NCBI RefSeq, and NCBI GenBank via TSV files weekly.
              You can click the download button on each card to download the TSV files that Annotrieve itself uses to process and index the data.
              The automated data fetching logic is available in our GitHub repository.
            </>
          )}
          icon={Server}
          iconColor="text-indigo-600"
          iconBgColor="bg-indigo-500/10"
          align="center"
        />
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-16">
      <SectionHeader
        title={title ?? "Database Sources Overview"}
        description={description ?? (
          <>
            Annotrieve automatically updates annotation data from{" "}
            <a 
              href="https://www.ensembl.org/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Ensembl
              <ExternalLink className="h-3 w-3" />
            </a>
            ,{" "}
            <a 
              href="https://www.ncbi.nlm.nih.gov/refseq/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              RefSeq
              <ExternalLink className="h-3 w-3" />
            </a>
            , and{" "}
            <a 
              href="https://www.ncbi.nlm.nih.gov/genbank/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              GenBank
              <ExternalLink className="h-3 w-3" />
            </a>
            {" "}each week using TSV files. 
            These files are available for download from each card, and the automation code is published on{" "}
            <a 
              href="https://github.com/guigolab/genome-annotation-tracker" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              GitHub repository
              <Github className="h-3 w-3" />
            </a>
            .
          </>
        )}
        icon={Server}
        iconColor="text-indigo-600"
        iconBgColor="bg-indigo-500/10"
        align="center"
      />
      
      {/* Database Items */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {data.map((database, index) => (
          <DatabaseItem key={database.name} database={database} index={index} />
        ))}
      </div>
    </div>
  )
}
