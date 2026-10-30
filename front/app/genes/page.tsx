"use client"

import { Suspense, useCallback, useState } from "react"

import { GenesCompareView } from "@/components/genes/genes-compare-view"
import { GenesEmptyState } from "@/components/genes/genes-empty-state"
import { GenesErrorAlert } from "@/components/genes/genes-error-alert"
import { GenesAnnotationsView } from "@/components/genes/genes-annotations-view"
import { GenesOverviewSection } from "@/components/genes/genes-overview"
import { GenesPrefixSheet } from "@/components/genes/genes-prefix-sheet"
import { GenesQueryBar } from "@/components/genes/genes-query-bar"
import { formatGenesStat } from "@/components/genes/genes-stat"
import { GenesViewTabs } from "@/components/genes/genes-view-tabs"
import { useCompareStore } from "@/lib/genes/compare-store"
import { useGeneSetInput } from "@/lib/hooks/use-gene-set-input"
import { useGenesExplorer } from "@/lib/hooks/use-genes-explorer"
import { cn } from "@/lib/utils"

function GenesPageContent() {
  const explorer = useGenesExplorer()
  const geneSet = useGeneSetInput()
  const pinCount = useCompareStore((s) => s.pins.length)
  const [annSelectionNameMatch, setAnnSelectionNameMatch] = useState<
    "any" | "all"
  >("any")
  const [editorOpenSignal, setEditorOpenSignal] = useState(0)

  const setCoverage = explorer.setCoverage
  const termCount = explorer.termCount
  const setView = explorer.setView
  const commitNames = geneSet.commitNames

  const onApplyText = useCallback(
    (names: string[]) => commitNames(names, { replace: true }),
    [commitNames],
  )

  const onReviewZeroHits = useCallback(() => {
    setEditorOpenSignal((n) => n + 1)
  }, [])

  const onCoverageChange = useCallback(
    (range: Parameters<typeof setCoverage>[0]) => {
      setCoverage(range, termCount)
    },
    [setCoverage, termCount],
  )

  const onGoToAnnotations = useCallback(() => {
    setView("annotations")
  }, [setView])

  const onGoToCompare = useCallback(() => {
    setView("compare")
  }, [setView])

  const summaryLabel = explorer.showResults
    ? formatGenesStat(
        explorer.overviewAnnotationTotal,
        explorer.overviewSpeciesTotal,
      )
    : "Explore and download annotations that contain a gene set across the taxonomy."

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col">
      {explorer.isFetching && explorer.showResults && (
        <div
          className="absolute left-0 right-0 top-0 z-20 h-0.5 overflow-hidden"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
        </div>
      )}

      <header className="z-10 shrink-0 border-b border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur-sm">
        <div className="flex flex-col gap-2.5 px-3 py-2.5 sm:px-4 lg:px-6 sm:py-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight text-foreground sm:text-2xl leading-tight">
                Genes
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm tabular-nums leading-tight truncate">
                {summaryLabel}
              </p>
            </div>
            {explorer.showResults ? (
              <GenesViewTabs
                view={explorer.view}
                onViewChange={explorer.setView}
                annotationTotal={explorer.annotationTotal}
                pinCount={pinCount}
                className="w-full sm:w-auto"
              />
            ) : null}
          </div>

          <GenesQueryBar
            queryText={geneSet.queryText}
            onQueryTextChange={geneSet.setQueryText}
            onSearch={() => geneSet.runSearch()}
            onOpenPrefix={() => geneSet.openPrefix()}
            onPasteCommit={geneSet.commitPaste}
            queryNames={geneSet.queryNames}
            nameCount={geneSet.nameCount}
            hitTerms={explorer.hitsTerms}
            activeTerms={explorer.adapterTerms}
            onApplyText={onApplyText}
            onPreparePrefixDraft={geneSet.setQueryText}
            onRemoveName={geneSet.removeName}
            onRemoveZeroHits={geneSet.removeZeroHitNames}
            onClearAll={geneSet.clearAll}
            includeTaxa={explorer.includeTaxa}
            excludeTaxa={explorer.excludeTaxa}
            onApplyTaxa={explorer.setTaxa}
            editorOpenSignal={editorOpenSignal}
          />
        </div>
      </header>

      {explorer.errorMessage && (
        <GenesErrorAlert
          message={explorer.errorMessage}
          onRetry={explorer.refetch}
        />
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          !explorer.showResults && "overflow-y-auto",
        )}
      >
        {explorer.showResults ? (
          <div
            role="tabpanel"
            id={`genes-panel-${explorer.view}`}
            aria-labelledby={`genes-tab-${explorer.view}`}
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 lg:px-6 sm:py-4"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
              {explorer.view === "distribution" ? (
                <GenesOverviewSection
                  className="h-full min-h-0"
                  adapter={explorer.adapter}
                  filter={explorer.filter}
                  tree={explorer.tree}
                  expanded={explorer.expanded}
                  loading={explorer.isLoading}
                  onToggleExpand={explorer.toggleExpanded}
                  unit={explorer.unit}
                  onUnitChange={explorer.setUnit}
                  zeroHitCount={explorer.matchedNothing.length}
                  onReviewZeroHits={onReviewZeroHits}
                  viewRank={explorer.effectiveViewRank}
                  rankOptions={explorer.rankOptions}
                  hideAutoRank={explorer.hideAutoRank}
                  rankSelectDisabled={explorer.rankSelectDisabled}
                  rankSelectDisabledReason={explorer.rankSelectDisabledReason}
                  onViewRankChange={explorer.setViewRank}
                />
              ) : null}

              {explorer.view === "annotations" ? (
                <GenesAnnotationsView
                  className="h-full min-h-0"
                  adapter={explorer.adapter}
                  filter={explorer.filter}
                  hasExcludedNames={explorer.excluded.size > 0}
                  taxonIndex={explorer.taxonIndex}
                  listFilters={explorer.listFilters}
                  onPatchListFilters={explorer.patchListFilters}
                  onSetListFilters={explorer.setListFilters}
                  pipeline={explorer.annotationsPipeline}
                  overviewTotal={explorer.overviewAnnotationTotal}
                  activeTerms={explorer.adapterTerms}
                  activeNames={explorer.active}
                  sources={explorer.sources}
                  sourceCounts={explorer.sourceCounts}
                  onToggleSource={explorer.toggleSource}
                  coverage={explorer.coverage}
                  onCoverageChange={onCoverageChange}
                  matchedCounts={explorer.coverageData.matchedCounts}
                  termCount={explorer.termCount}
                  keep={explorer.keep}
                  onKeepChange={explorer.setKeep}
                  sort={explorer.sort}
                  sortDir={explorer.sortDir}
                  onSortChange={explorer.setSort}
                  search={explorer.search}
                  onSearchChange={explorer.setSearch}
                  selection={explorer.annotationsSelection}
                  selectionNameMatch={annSelectionNameMatch}
                  onSelectionNameMatchChange={setAnnSelectionNameMatch}
                  onDispatchSelection={explorer.dispatchAnnotationsSelection}
                  onClearSelection={explorer.clearAnnotationsSelection}
                  selectionAnchor={explorer.annotationsSelectionAnchor}
                  onSetSelectionAnchor={explorer.setAnnotationsSelectionAnchor}
                  onReset={explorer.resetViewFilters}
                  drawer={explorer.drawer}
                  onOpenDrawer={explorer.openDrawer}
                  onSetDrawerGene={explorer.setDrawerGene}
                  onCloseDrawer={explorer.closeDrawer}
                  onGoToCompare={onGoToCompare}
                  loading={explorer.isLoading}
                />
              ) : null}

              {explorer.view === "compare" ? (
                <GenesCompareView
                  className="h-full min-h-0"
                  onGoToAnnotations={onGoToAnnotations}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <GenesEmptyState onExample={geneSet.applyExample} />
        )}
      </div>

      <GenesPrefixSheet
        open={geneSet.prefixSheet.open}
        onClose={geneSet.cancelPrefix}
        onApply={geneSet.applyPrefix}
        names={geneSet.prefixSheet.names}
        committedNames={geneSet.queryNames}
        includeTaxids={explorer.includeTaxids}
        excludeTaxids={explorer.excludeTaxids}
        onToggle={geneSet.prefixSheet.onToggle}
        onIncludeShown={geneSet.prefixSheet.onIncludeShown}
        onExcludeShown={geneSet.prefixSheet.onExcludeShown}
        initialPrefix={geneSet.prefixSheet.seed}
      />
    </div>
  )
}

export default function GenesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      }
    >
      <GenesPageContent />
    </Suspense>
  )
}
