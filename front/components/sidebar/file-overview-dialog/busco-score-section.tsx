"use client"

import { Card } from "@/components/ui/card"
import { BarChart2 } from "lucide-react"
import type { PortalAnnotation } from "@/lib/types"

// Canonical BUSCO score colors (C+S, C+D, F, M)
const BUSCO_COLORS = {
  single_copy: { bg: "bg-[#56A0D3]", dot: "#56A0D3", label: "Complete & single-copy (C+S)" },
  duplicated: { bg: "bg-[#1E88B4]", dot: "#1E88B4", label: "Complete & duplicated (C+D)" },
  fragmented: { bg: "bg-[#F4C63D]", dot: "#F4C63D", label: "Fragmented (F)" },
  missing: { bg: "bg-[#D64545]", dot: "#D64545", label: "Missing (M)" },
} as const

const SEGMENT_ORDER = ["single_copy", "duplicated", "fragmented", "missing"] as const

interface BuscoScoreSectionProps {
  annotation: PortalAnnotation
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

  const completeness = ((singleCopy + duplicated) / total) * 100

  const segments = SEGMENT_ORDER.map((key) => {
    const pct =
      key === "single_copy"
        ? singleCopy
        : key === "duplicated"
          ? duplicated
          : key === "fragmented"
            ? fragmented
            : missing
    return { key, pct, width: (pct / total) * 100, config: BUSCO_COLORS[key] }
  }).filter((s) => s.pct > 0)

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 shrink-0">
            <BarChart2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold leading-none">BUSCO Score</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {busco.busco_lineage ?? "BUSCO"} lineage
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xl font-bold tabular-nums text-foreground leading-none">
            {completeness.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">complete</span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="px-4 pb-1">
        <div className="h-5 w-full rounded-lg overflow-hidden flex gap-px bg-muted/60">
          {segments.map(({ key, width, config }) => (
            <div
              key={key}
              className={`${config.bg} min-w-0 transition-all duration-500 first:rounded-l-lg last:rounded-r-lg`}
              style={{ width: `${width}%` }}
              title={`${config.label}: ${width.toFixed(1)}%`}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 pt-2.5 pb-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {SEGMENT_ORDER.map((key) => {
            const pct =
              key === "single_copy"
                ? singleCopy
                : key === "duplicated"
                  ? duplicated
                  : key === "fragmented"
                    ? fragmented
                    : missing
            if (pct <= 0) return null
            const config = BUSCO_COLORS[key]
            return (
              <div key={key} className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: config.dot }}
                  aria-hidden
                />
                <span className="text-xs text-muted-foreground truncate">{config.label}</span>
                <span className="ml-auto text-xs font-semibold tabular-nums text-foreground shrink-0">
                  {pct.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer metadata */}
      {(busco.busco_version || busco.total_count) && (
        <div className="px-4 py-2.5 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-1">
          {busco.busco_version && (
            <span className="text-xs text-muted-foreground">
              v<span className="font-mono">{busco.busco_version}</span>
            </span>
          )}
          {busco.total_count && (
            <span className="text-xs text-muted-foreground">
              <span className="font-mono">{busco.total_count}</span> orthologs
            </span>
          )}
        </div>
      )}
    </Card>
  )
}
