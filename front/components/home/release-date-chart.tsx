"use client"

import { useEffect, useState } from "react"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import { LineChart } from "@mui/x-charts/LineChart"
import { ReactNode } from "react"
import { SectionHeader } from "@/components/ui/section-header"
import { Calendar } from "lucide-react"

const DATABASE_COLORS = {
    'Ensembl': '#6366f1',
    'RefSeq': '#10b981',
    'GenBank': '#f59e0b'
} as const

const DATABASE_NAMES = ['GenBank', 'Ensembl', 'RefSeq'] as const

interface ReleaseDateData {
    date: Date
    year: string
    Ensembl: number
    RefSeq: number
    GenBank: number
}

interface ReleaseDateChartProps {
    title?: string
    description?: ReactNode
}

// Helper function to format date to YYYY for grouping
function formatToYear(dateString: string): string {
    try {
        const date = new Date(dateString)
        if (isNaN(date.getTime())) {
            return dateString.substring(0, 4) // Fallback: take first 4 chars (YYYY)
        }
        return date.toISOString().substring(0, 4) // YYYY
    } catch {
        return dateString.substring(0, 4)
    }
}

function getMaxValue(data: ReleaseDateData[]): number {
    return data.reduce((max, d) => Math.max(max, d.Ensembl, d.RefSeq, d.GenBank), 0)
}

function getYearsArray(data: ReleaseDateData[]): Date[] {
    if (data.length === 0) return []
    
    const years = new Set<number>()
    data.forEach(d => {
        years.add(d.date.getFullYear())
    })
    
    // Create Date objects for January 1st of each year
    return Array.from(years)
        .sort((a, b) => a - b)
        .map(year => new Date(year, 0, 1))
}


export function ReleaseDateChart({ title, description }: ReleaseDateChartProps) {
    const [data, setData] = useState<ReleaseDateData[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [textColor, setTextColor] = useState<string>('#000000')
    
    // Get the computed foreground color for SVG elements
    useEffect(() => {
        const updateTextColor = () => {
            const testEl = document.createElement('div')
            testEl.className = 'text-foreground'
            testEl.style.visibility = 'hidden'
            testEl.style.position = 'absolute'
            document.body.appendChild(testEl)
            const computedColor = window.getComputedStyle(testEl).color
            document.body.removeChild(testEl)
            setTextColor(computedColor)
        }
        
        updateTextColor()
        
        // Update on theme change
        const observer = new MutationObserver(() => {
            updateTextColor()
        })
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme']
        })
        
        // Also listen for storage events (theme changes via next-themes)
        window.addEventListener('storage', updateTextColor)
        
        return () => {
            observer.disconnect()
            window.removeEventListener('storage', updateTextColor)
        }
    }, [])

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true)
                setError(null)

                // Fetch data for each database source
                const promises = DATABASE_NAMES.map(dbSource =>
                    getAnnotationsFrequencies('release_date', { db_sources: dbSource })
                )

                const results = await Promise.all(promises)

                // Combine all data and group by year
                const yearMap = new Map<string, { Ensembl: number; RefSeq: number; GenBank: number }>()

                results.forEach((frequencies, index) => {
                    const dbSource = DATABASE_NAMES[index]
                    Object.entries(frequencies).forEach(([date, count]) => {
                        const year = formatToYear(date)
                        if (!yearMap.has(year)) {
                            yearMap.set(year, { Ensembl: 0, RefSeq: 0, GenBank: 0 })
                        }
                        const yearData = yearMap.get(year)!
                        yearData[dbSource] = (yearData[dbSource] || 0) + count
                    })
                })

                // Convert to array and sort by year (ascending)
                const sortedData: ReleaseDateData[] = Array.from(yearMap.entries())
                    .map(([year, values]) => {
                        // Convert YYYY to Date object for time scale (January 1st of the year)
                        const yearNum = Number(year)
                        const date = new Date(yearNum, 0, 1)
                        return {
                            date,
                            year,
                            ...values
                        }
                    })
                    .sort((a, b) => a.date.getTime() - b.date.getTime())

                // Convert to cumulative timeline - each database accumulates independently
                // Each year shows: all previous years' counts + current year's count
                const cumulativeData: ReleaseDateData[] = []
                let cumulativeEnsembl = 0
                let cumulativeRefSeq = 0
                let cumulativeGenBank = 0

                sortedData.forEach(d => {
                    // Add current year's count to each database's running total
                    cumulativeEnsembl += d.Ensembl
                    cumulativeRefSeq += d.RefSeq
                    cumulativeGenBank += d.GenBank
                    cumulativeData.push({
                        date: d.date,
                        year: d.year,
                        Ensembl: cumulativeEnsembl,  // Total Ensembl annotations up to this year
                        RefSeq: cumulativeRefSeq,     // Total RefSeq annotations up to this year
                        GenBank: cumulativeGenBank    // Total GenBank annotations up to this year
                    })
                })

                setData(cumulativeData)
            } catch (err) {
                setError('Failed to load release date frequencies')
                console.error('Error fetching release date frequencies:', err)
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
                    title={title ?? "Cumulative Annotation Release Timeline"}
                    description={description ?? (
                        <>
                            Track the cumulative growth of annotation releases over time across different database sources.
                            Each line shows the total number of annotations released up to that year, with each database accumulating independently.
                        </>
                    )}
                    icon={Calendar}
                    iconColor="text-indigo-600"
                    iconBgColor="bg-indigo-500/10"
                    align="center"
                />
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <p className="text-muted-foreground">Loading release timeline...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="container mx-auto px-4 py-16">
                <SectionHeader
                    title={title ?? "Cumulative Annotation Release Timeline"}
                    description={description ?? (
                        <>
                            Track the cumulative growth of annotation releases over time across different database sources.
                            Each line shows the total number of annotations released up to that year, with each database accumulating independently.
                        </>
                    )}
                    icon={Calendar}
                    iconColor="text-indigo-600"
                    iconBgColor="bg-indigo-500/10"
                    align="center"
                />
                <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                        <p className="text-muted-foreground mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (data.length === 0) {
        return (
            <div className="container mx-auto px-4 py-16">
                <SectionHeader
                    title={title ?? "Cumulative Annotation Release Timeline"}
                    description={description ?? (
                        <>
                            Track the cumulative growth of annotation releases over time across different database sources.
                            Each line shows the total number of annotations released up to that year, with each database accumulating independently.
                        </>
                    )}
                    icon={Calendar}
                    iconColor="text-indigo-600"
                    iconBgColor="bg-indigo-500/10"
                    align="center"
                />
                <div className="flex items-center justify-center py-16">
                    <p className="text-muted-foreground">No release date data available</p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-16">
            <SectionHeader
                title={title ?? "Cumulative Annotation Release Timeline"}
                    description={description ?? (
                        <>
                            Track the cumulative growth of annotation releases over time across different database sources.
                            Each line shows the total number of annotations released up to that year, with each database accumulating independently.
                        </>
                    )}
                icon={Calendar}
                iconColor="text-indigo-600"
                iconBgColor="bg-indigo-500/10"
                align="center"
            />

            <div className="max-w-7xl mx-auto">
                <LineChart
                    height={400}
                    series={DATABASE_NAMES.map(dbSource => ({
                        id: dbSource,
                        label: dbSource,
                        data: data.map(d => d[dbSource]),
                        color: DATABASE_COLORS[dbSource],
                        curve: 'monotoneX',
                        showMark: false,
                    }))}
                    xAxis={[{
                        id: 'years',
                        data: data.map(d => d.date),
                        scaleType: 'time',
                        valueFormatter: (value: Date) => {
                            return value.getFullYear().toString()
                        },
                        position: 'bottom',
                        tickInterval: getYearsArray(data),
                        tickLabelStyle: {
                            fill: textColor,
                            fontSize: 12,
                        },
                    }]}
                    yAxis={[{
                        position: 'none',
                        min: -0.1,
                        max: getMaxValue(data) + 0.1,
                    }]}
                    slotProps={{
                        legend: {
                            position: { vertical: 'top', horizontal: 'center' },
                            sx: {
                                '& .MuiChartsLegend-series text': {
                                    fill: `${textColor} !important`,
                                    fontSize: '14px',
                                },
                                '& .MuiChartsLegend-series': {
                                    color: textColor,
                                },
                                '& text': {
                                    fill: `${textColor} !important`,
                                },
                                color: textColor,
                            },
                        },
                    }}
                    sx={{
                        '& .MuiChartsAxis-root .MuiChartsAxis-tickLabel': {
                            fill: textColor,
                            fontSize: '12px',
                        },
                        '& .MuiChartsAxis-root .MuiChartsAxis-label': {
                            fill: textColor,
                        },
                        '& .MuiChartsAxis-root[data-axis-id="bottom"] .MuiChartsAxis-tickLabel': {
                            fill: textColor,
                            opacity: 1,
                        },
                        // Legend styling - use !important to override defaults
                        '& .MuiChartsLegend-root text': {
                            fill: `${textColor} !important`,
                        },
                        '& .MuiChartsLegend-series text': {
                            fill: `${textColor} !important`,
                        },
                        '& .MuiChartsLegend-series': {
                            color: `${textColor} !important`,
                        },
                        '& .MuiChartsLegend-root .MuiChartsLegend-series text': {
                            fill: `${textColor} !important`,
                        },
                    }}
                     margin={{ top: 10, right: 40, left: 40, bottom: 10 }}

                />
            </div>
        </div>
    )
}

