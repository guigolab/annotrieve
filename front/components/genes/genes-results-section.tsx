"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { GenesAnnotationDetail } from "@/components/genes/genes-annotation-detail"
import { GenesAnnotationList } from "@/components/genes/genes-annotation-list"
import { GenesFilterBar } from "@/components/genes/genes-filter-bar"
import {
  GenesPanelHeader,
  type PanelCrumb,
} from "@/components/genes/genes-panel-header"
import { GenesResultsToolbar } from "@/components/genes/genes-results-toolbar"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { CoverageRange } from "@/lib/genes/coverage"
import type { GenesFilter } from "@/lib/genes/filters"
import type { PanelStack } from "@/lib/genes/store"
import { cn } from "@/lib/utils"

interface GenesResultsSectionProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  taxonIndex: Map<string, FlatTreeNode>
  taxonLabel: string | null
  panel: PanelStack
  loading?: boolean
  isFetching?: boolean
  hasSlice: boolean
  activeNames: string[]
  activeCount: number
  resolvedCount: number
  matchedNothingCount: number
  annotationTotal: number
  overviewAnnotationTotal: number
  overviewOrganismTotal: number
  downloadAllTotal: number
  sources: Set<number>
  sourceCounts: Map<number, number>
  onToggleSource: (code: number) => void
  matchedCounts: number[]
  termCount: number
  coverage: CoverageRange | null
  onCoverageChange: (range: CoverageRange | null) => void
  coverageOpen: boolean
  onCoverageOpenChange: (open: boolean) => void
  onClearTaxon: () => void
  onClearName: () => void
  onClearCoverage: () => void
  onResetViewFilters: () => void
  onDownloadAll: () => void
  onDownloadSelection: () => void
  onOpenAnnotation: (opts: {
    annotationId: string
    species: string
    source: number
  }) => void
  onOpenGene: (localId: number) => void
  onPop: () => void
  onPopToList: () => void
  className?: string
}

export function GenesResultsSection({
  adapter,
  filter,
  taxonIndex,
  taxonLabel,
  panel,
  loading,
  isFetching,
  hasSlice,
  activeNames,
  activeCount,
  resolvedCount,
  matchedNothingCount,
  annotationTotal,
  overviewAnnotationTotal,
  overviewOrganismTotal,
  downloadAllTotal,
  sources,
  sourceCounts,
  onToggleSource,
  matchedCounts,
  termCount,
  coverage,
  onCoverageChange,
  coverageOpen,
  onCoverageOpenChange,
  onClearTaxon,
  onClearName,
  onClearCoverage,
  onResetViewFilters,
  onDownloadAll,
  onDownloadSelection,
  onOpenAnnotation,
  onOpenGene,
  onPop,
  onPopToList,
  className,
}: GenesResultsSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const [geneTitle, setGeneTitle] = useState<string | null>(null)
  const inDetail = panel.level !== "list"

  useEffect(() => {
    if (!inDetail) {
      setGeneTitle(null)
      return
    }
    const heading = sectionRef.current?.querySelector(
      "[data-panel-heading]",
    ) as HTMLElement | null
    heading?.focus()
    // Intentionally omit geneTitle — title loads async and must not steal focus.
  }, [inDetail, panel.level, panel.annotationId, panel.localId])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panel.level !== "list") {
        e.preventDefault()
        e.stopPropagation()
        onPop()
      }
    }
    el.addEventListener("keydown", onKey)
    return () => el.removeEventListener("keydown", onKey)
  }, [panel.level, onPop])

  const crumbs: PanelCrumb[] = useMemo(() => {
    if (panel.level === "list") return [{ label: "Annotations" }]
    if (panel.level === "annotation") {
      return [
        { label: "Annotations", onClick: onPopToList },
        { label: panel.species ?? "Annotation", italic: true },
      ]
    }
    return [
      { label: "Annotations", onClick: onPopToList },
      {
        label: panel.species ?? "Annotation",
        italic: true,
        onClick: onPop,
      },
      {
        label:
          geneTitle ??
          (panel.localId != null ? `Gene ${panel.localId}` : "Gene"),
      },
    ]
  }, [panel, onPop, onPopToList, geneTitle])

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm outline-none",
        className,
      )}
    >
      {inDetail ? (
        <>
          <GenesPanelHeader
            level={panel.level}
            crumbs={crumbs}
            onBack={onPop}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <GenesAnnotationDetail
              adapter={adapter}
              panel={panel}
              activeNames={activeNames}
              termCount={
                adapter?.termCount(filter.excludeTerms) ?? activeNames.length
              }
              onOpenGene={onOpenGene}
              onGeneTitle={setGeneTitle}
            />
          </div>
        </>
      ) : (
        <>
          <div className="shrink-0 border-b border-border/60 px-3 py-2">
            <GenesFilterBar
              sources={sources}
              sourceCounts={sourceCounts}
              onToggleSource={onToggleSource}
              matchedCounts={matchedCounts}
              termCount={termCount}
              coverage={coverage}
              onCoverageChange={onCoverageChange}
              coverageOpen={coverageOpen}
              onCoverageOpenChange={onCoverageOpenChange}
              coverageDisabled={!adapter}
              selectedTaxonLabel={taxonLabel}
              selectedName={filter.name}
              onClearTaxon={onClearTaxon}
              onClearName={onClearName}
              onResetViewFilters={onResetViewFilters}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <GenesAnnotationList
              adapter={adapter}
              filter={filter}
              taxonIndex={taxonIndex}
              loading={loading}
              onClearCoverage={onClearCoverage}
              onOpenAnnotation={onOpenAnnotation}
            />
          </div>

          <div className="shrink-0 border-t border-border/60 px-3 py-2">
            <GenesResultsToolbar
              overviewAnnotationTotal={overviewAnnotationTotal}
              overviewOrganismTotal={overviewOrganismTotal}
              annotationTotal={annotationTotal}
              hasSlice={hasSlice}
              activeCount={activeCount}
              resolvedCount={resolvedCount}
              matchedNothingCount={matchedNothingCount}
              isFetching={isFetching}
              loading={loading}
              downloadDisabled={!adapter}
              downloadAllTotal={downloadAllTotal}
              onDownloadAll={onDownloadAll}
              onDownloadSelection={onDownloadSelection}
            />
          </div>
        </>
      )}
    </section>
  )
}
