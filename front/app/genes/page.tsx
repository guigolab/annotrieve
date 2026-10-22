"use client"

import { Suspense, useEffect, useState } from "react"
import { Dna } from "lucide-react"

import { GenesAnnotationsPanel } from "@/components/genes/genes-annotations-panel"
import { GenesEmptyState } from "@/components/genes/genes-empty-state"
import { GenesErrorAlert } from "@/components/genes/genes-error-alert"
import { GenesOverview } from "@/components/genes/genes-overview"
import { GenesPrefixSheet } from "@/components/genes/genes-prefix-sheet"
import { GenesResultsHeader } from "@/components/genes/genes-results-header"
import { GenesSearchBar } from "@/components/genes/genes-search-bar"
import {
  GenesViewSwitcher,
  type GenesMobileView,
} from "@/components/genes/genes-view-switcher"
import { useGeneSetInput } from "@/lib/hooks/use-gene-set-input"
import { useGenesExplorer } from "@/lib/hooks/use-genes-explorer"
import { cn } from "@/lib/utils"

function GenesPageContent() {
  const explorer = useGenesExplorer()
  const geneSet = useGeneSetInput()
  const [mobileView, setMobileView] = useState<GenesMobileView>("overview")

  useEffect(() => {
    if (explorer.panel.level !== "list") setMobileView("annotations")
  }, [explorer.panel.level])

  const nameCount = Math.max(
    geneSet.queryNames.length,
    explorer.active.length,
  )

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col relative">
      {explorer.isFetching && explorer.showResults && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden"
          aria-hidden
        >
          <div className="h-full w-1/3 animate-pulse bg-primary/70 rounded-full" />
        </div>
      )}

      <header className="shrink-0 border-b border-border bg-background px-4 py-3 sm:px-5 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Dna className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">Genes</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explore and download annotations that contain a gene set across
              the taxonomy.
            </p>
          </div>
        </div>

        <GenesSearchBar
          queryText={geneSet.queryText}
          onQueryTextChange={geneSet.setQueryText}
          onSearch={() => geneSet.runSearch()}
          onOpenPrefix={() => geneSet.openPrefix()}
          nameCount={nameCount}
          includeTaxa={explorer.includeTaxa}
          excludeTaxa={explorer.excludeTaxa}
          onApplyTaxa={explorer.setTaxa}
        />
      </header>

      {explorer.showResults && (
        <div className="shrink-0 border-b border-border/60 bg-muted/20 px-3 py-2 sm:px-5">
          <GenesResultsHeader
            annotationTotal={explorer.annotationTotal}
            activeCount={explorer.active.length}
            resolvedCount={explorer.resolvedNames.length}
            prefixExpansions={explorer.prefixExpansions}
            matchedNothingCount={explorer.matchedNothing.length}
            isFetching={explorer.isFetching && !explorer.isLoading}
            reviewOpen={explorer.openPopover === "review"}
            onReviewOpenChange={(open) =>
              explorer.setPopover(open ? "review" : null)
            }
            terms={explorer.adapterTerms}
            hitTerms={explorer.hitsTerms}
            excluded={explorer.excluded}
            onApplyExcluded={explorer.setExcluded}
            onRemoveName={explorer.removeQueryName}
          />
        </div>
      )}

      {explorer.errorMessage && (
        <GenesErrorAlert
          message={explorer.errorMessage}
          onRetry={explorer.refetch}
        />
      )}

      <div
        className={cn(
          "flex-1 min-h-0 px-3 sm:px-5 pb-3 pt-2",
          explorer.showResults
            ? "min-[1100px]:overflow-hidden overflow-y-auto"
            : "overflow-y-auto",
        )}
      >
        {explorer.showResults ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <GenesViewSwitcher
              value={mobileView}
              onChange={setMobileView}
              annotationCount={explorer.annotationTotal}
              className="min-[1100px]:hidden shrink-0"
            />

            <div className="flex h-full min-h-0 flex-col gap-2 min-[1100px]:flex-row">
              <GenesOverview
                adapter={explorer.adapter}
                filter={explorer.filter}
                tree={explorer.tree}
                expanded={explorer.expanded}
                selectedTaxon={explorer.t}
                selectedName={explorer.g}
                loading={explorer.isLoading}
                onToggleExpand={explorer.toggleExpanded}
                onSelectTaxon={explorer.selectTaxon}
                onSelectName={explorer.selectName}
                onSelectCell={explorer.selectCell}
                viewRank={explorer.viewRank}
                rankOptions={explorer.rankOptions}
                hideAutoRank={explorer.hideAutoRank}
                rankSelectDisabled={explorer.rankSelectDisabled}
                rankSelectDisabledReason={explorer.rankSelectDisabledReason}
                onViewRankChange={explorer.setViewRank}
                className={cn(
                  "min-h-[420px] flex-1 min-w-0 min-[1100px]:min-h-0",
                  mobileView !== "overview" && "hidden min-[1100px]:flex",
                )}
              />

              <GenesAnnotationsPanel
                adapter={explorer.adapter}
                filter={explorer.filter}
                taxonIndex={explorer.taxonIndex}
                taxonLabel={explorer.taxonLabel}
                panel={explorer.panel}
                loading={explorer.isLoading}
                activeNames={explorer.active}
                organismTotal={explorer.organismTotal}
                includeTaxa={explorer.includeTaxa}
                excludeTaxa={explorer.excludeTaxa}
                onApplyTaxa={explorer.setTaxa}
                sources={explorer.sources}
                sourceCounts={explorer.sourceCounts}
                onToggleSource={explorer.toggleSource}
                matchedCounts={explorer.coverageData.matchedCounts}
                termCount={explorer.termCount}
                coverage={explorer.coverage}
                onCoverageChange={(range) =>
                  explorer.setCoverage(range, explorer.termCount)
                }
                coverageOpen={explorer.openPopover === "coverage"}
                onCoverageOpenChange={(open) =>
                  explorer.setPopover(open ? "coverage" : null)
                }
                onClearTaxon={() => explorer.selectTaxon(null)}
                onClearName={() => explorer.selectName(null)}
                onClearCoverage={explorer.clearCoverage}
                onResetViewFilters={explorer.resetViewFilters}
                onDownloadTsv={explorer.downloadTsv}
                onOpenAnnotation={explorer.openAnnotation}
                onOpenGene={explorer.openGene}
                onPop={explorer.popPanel}
                onPopToList={explorer.resetPanel}
                className={cn(
                  "h-[70vh] w-full shrink-0 min-[1100px]:h-full min-[1100px]:w-[min(100%,480px)]",
                  mobileView !== "annotations" && "hidden min-[1100px]:flex",
                )}
              />
            </div>
          </div>
        ) : (
          <GenesEmptyState onExample={geneSet.applyExample} />
        )}
      </div>

      <GenesPrefixSheet
        open={geneSet.prefixSheet.open}
        onClose={geneSet.closePrefix}
        names={geneSet.prefixSheet.names}
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
