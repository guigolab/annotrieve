"use client"

import { Card } from "@/components/ui/card"
import { BarChart2 } from "lucide-react"
import type { Annotation } from "@/lib/types"

// Canonical BUSCO score colors (C+S, C+D, F, M)
const BUSCO_COLORS = {
  single_copy: { bg: "bg-[#56A0D3]", label: "Complete (C) & single-copy (S)" },
  duplicated: { bg: "bg-[#1E88B4]", label: "Complete (C) & duplicated (D)" },
  fragmented: { bg: "bg-[#F4C63D]", label: "Fragmented (F)" },
  missing: { bg: "bg-[#D64545]", label: "Missing (M)" },
} as const

const SEGMENT_ORDER = ["single_copy", "duplicated", "fragmented", "missing"] as const

interface BuscoScoreSectionProps {
  annotation: Annotation
}

function toNum(v: unknown): number {
  if (v === undefined || v === null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function BuscoScoreSection({ annotation }: BuscoScoreSectionProps) {
  const busco = annotation.busco
  if (!busco) return null

  const singleCopy = toNum(busco.single_copy)
  const duplicated = toNum(busco.duplicated)
  const fragmented = toNum(busco.fragmented)
  const missing = toNum(busco.missing)
  const total = singleCopy + duplicated + fragmented + missing
  if (total <= 0) return null

  const segments = SEGMENT_ORDER.map((key) => {
    const pct = key === "single_copy" ? singleCopy : key === "duplicated" ? duplicated : key === "fragmented" ? fragmented : missing
    return { key, pct, width: (pct / total) * 100, config: BUSCO_COLORS[key] }
  }).filter((s) => s.pct > 0)

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold">BUSCO Score</h4>
      </div>

      <div className="space-y-3">
        <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Benchmarking Universal Single-Copy Orthologs
        </h5>
        <p className="text-xs text-muted-foreground">
          Ortholog presence and copy number from the {busco.busco_lineage ?? "BUSCO"} lineage.
        </p>

        {/* Stacked bar */}
        <div className="space-y-2">
          <div className="h-6 w-full rounded-md overflow-hidden flex bg-muted/50">
            {segments.map(({ key, width, config }) => (
              <div
                key={key}
                className={`${config.bg} min-w-0 transition-all duration-300`}
                style={{ width: `${width}%` }}
                title={`${config.label}: ${width.toFixed(1)}%`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {SEGMENT_ORDER.map((key) => {
              const pct = key === "single_copy" ? singleCopy : key === "duplicated" ? duplicated : key === "fragmented" ? fragmented : missing
              if (pct <= 0) return null
              const config = BUSCO_COLORS[key]
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm shrink-0 ${config.bg}`} aria-hidden />
                  <span className="text-muted-foreground">{config.label}:</span>
                  <span className="font-medium tabular-nums">{pct.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>

        {busco.busco_lineage && (
          <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
            Lineage: <span className="font-mono">{busco.busco_lineage}</span>
            {busco.busco_version && (
              <> · Version: <span className="font-mono">{busco.busco_version}</span></>
            )}
            {busco.total_count && (
              <> · Total count: <span className="font-mono">{busco.total_count}</span></>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
