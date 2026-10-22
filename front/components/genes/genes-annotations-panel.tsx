"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { GenesAnnotationDetail } from "@/components/genes/genes-annotation-detail"
import { GenesAnnotationList } from "@/components/genes/genes-annotation-list"
import { GenesDownloadMenu } from "@/components/genes/genes-download-menu"
import { GenesFilterBar } from "@/components/genes/genes-filter-bar"
import {
  GenesPanelHeader,
  type PanelCrumb,
} from "@/components/genes/genes-panel-header"
import type { FlatTreeNode } from "@/lib/api/taxons"
import type { GenesHitsAdapter } from "@/lib/genes/adapter"
import type { CoverageRange } from "@/lib/genes/coverage"
import type { GenesFilter } from "@/lib/genes/filters"
import type { PanelStack } from "@/lib/genes/store"
import type { SelectedTaxon } from "@/lib/genes/taxa"
import { cn } from "@/lib/utils"

interface GenesAnnotationsPanelProps {
  adapter: GenesHitsAdapter | null
  filter: GenesFilter
  taxonIndex: Map<string, FlatTreeNode>
  taxonLabel: string | null
  panel: PanelStack
  loading?: boolean
  activeNames: string[]
  organismTotal: number
  includeTaxa: SelectedTaxon[]
  excludeTaxa: SelectedTaxon[]
  onApplyTaxa: (include: SelectedTaxon[], exclude: SelectedTaxon[]) => void
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
  onDownloadTsv: () => void
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

export function GenesAnnotationsPanel({
  adapter,
  filter,
  taxonIndex,
  taxonLabel,
  panel,
  loading,
  activeNames,
  organismTotal,
  includeTaxa,
  excludeTaxa,
  onApplyTaxa,
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
  onDownloadTsv,
  onOpenAnnotation,
  onOpenGene,
  onPop,
  onPopToList,
  className,
}: GenesAnnotationsPanelProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const [geneTitle, setGeneTitle] = useState<string | null>(null)

  useEffect(() => {
    const heading = sectionRef.current?.querySelector(
      "[data-panel-heading]",
    ) as HTMLElement | null
    heading?.focus()
  }, [panel.level, panel.annotationId, panel.localId, geneTitle])

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

  const listTotal = useMemo(() => {
    if (!adapter) return 0
    return adapter.annotations(filter, { limit: 1, offset: 0 }).total
  }, [adapter, filter])

  const countLabel = loading
    ? "…"
    : `${listTotal.toLocaleString()} · ${organismTotal.toLocaleString()} organisms`

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
        "flex flex-col overflow-hidden min-h-0 rounded-xl border border-border bg-card/50 shadow-sm outline-none",
        className,
      )}
    >
      <GenesPanelHeader
        level={panel.level}
        crumbs={crumbs}
        countLabel={panel.level === "list" ? countLabel : undefined}
        onBack={onPop}
      >
        {panel.level === "list" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <GenesDownloadMenu
                count={listTotal}
                disabled={!adapter || listTotal === 0}
                onDownloadTsv={onDownloadTsv}
              />
            </div>
            <GenesFilterBar
              includeTaxa={includeTaxa}
              excludeTaxa={excludeTaxa}
              onApplyTaxa={onApplyTaxa}
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
              onClearCoverage={onClearCoverage}
              onResetViewFilters={onResetViewFilters}
            />
          </div>
        )}
      </GenesPanelHeader>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {panel.level === "list" && (
          <GenesAnnotationList
            adapter={adapter}
            filter={filter}
            taxonIndex={taxonIndex}
            loading={loading}
            onClearCoverage={onClearCoverage}
            onOpenAnnotation={onOpenAnnotation}
          />
        )}

        {panel.level !== "list" && (
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
        )}
      </div>
    </section>
  )
}
