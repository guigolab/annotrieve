"use client"

import type { CSSProperties, ReactNode } from "react"

import {
  categoryTint,
  GENE_CATEGORY_STYLE,
  type GeneCategory,
} from "@/lib/genes/gene-category"
import { cn } from "@/lib/utils"

export type CompareFeatureMode = "all" | "exons" | "cds"

interface GenesCompareLegendProps {
  featureMode: CompareFeatureMode
  categories: GeneCategory[]
  className?: string
  style?: CSSProperties
}

const SAMPLE_TOKEN = GENE_CATEGORY_STYLE.coding.token

function Swatch({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {children}
      <span>{label}</span>
    </span>
  )
}

export function GenesCompareLegend({
  featureMode,
  categories,
  className,
  style,
}: GenesCompareLegendProps) {
  const showExon = featureMode === "all" || featureMode === "exons"
  const showUtr = featureMode === "all"
  const showCds = featureMode === "all" || featureMode === "cds"

  const cats = categories.length
    ? categories
    : (["coding", "non_coding"] as GeneCategory[])

  return (
    <div
      className={cn(
        "pointer-events-none sticky bottom-3 left-0 z-20 flex justify-center px-3",
        className,
      )}
      style={style}
    >
      <div
        role="group"
        aria-label="Legend"
        className={cn(
          "pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80",
        )}
      >
        <Swatch label="Intron">
          <span
            className="block h-px w-4"
            style={{ backgroundColor: categoryTint(SAMPLE_TOKEN, 65) }}
            aria-hidden
          />
        </Swatch>
        {showExon ? (
          <Swatch label="Exon">
            <span
              className="block h-2.5 w-4 rounded-sm border"
              style={{
                backgroundColor: categoryTint(SAMPLE_TOKEN, 22),
                borderColor: SAMPLE_TOKEN,
              }}
              aria-hidden
            />
          </Swatch>
        ) : null}
        {showUtr ? (
          <Swatch label="UTR">
            <span
              className="block h-2.5 w-4 rounded-sm"
              style={{
                backgroundColor: categoryTint(SAMPLE_TOKEN, 55),
                opacity: 0.85,
              }}
              aria-hidden
            />
          </Swatch>
        ) : null}
        {showCds ? (
          <Swatch label="CDS">
            <span
              className="block h-2.5 w-4 rounded-sm"
              style={{ backgroundColor: SAMPLE_TOKEN }}
              aria-hidden
            />
          </Swatch>
        ) : null}

        <span className="hidden h-3 w-px bg-border sm:block" aria-hidden />

        {cats.map((cat) => {
          const style = GENE_CATEGORY_STYLE[cat]
          return (
            <Swatch key={cat} label={style.label}>
              <span
                className="block h-2 w-2 rounded-full"
                style={{ backgroundColor: style.token }}
                aria-hidden
              />
            </Swatch>
          )
        })}
      </div>
    </div>
  )
}
