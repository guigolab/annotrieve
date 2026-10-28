"use client"

import { Suspense } from "react"
import { Dna } from "lucide-react"

import { GenesEmptyState } from "@/components/genes/genes-empty-state"
import { GenesErrorAlert } from "@/components/genes/genes-error-alert"
import { GenesNameChips } from "@/components/genes/genes-name-chips"
import { GenesOverviewSection } from "@/components/genes/genes-overview"
import { GenesPrefixSheet } from "@/components/genes/genes-prefix-sheet"
import { GenesResultsSection } from "@/components/genes/genes-results-section"
import { GenesSearchBar } from "@/components/genes/genes-search-bar"
import { MAX_NAMES_GET } from "@/lib/genes/prefix"
import { useGeneSetInput } from "@/lib/hooks/use-gene-set-input"
import { useGenesExplorer } from "@/lib/hooks/use-genes-explorer"
import { cn } from "@/lib/utils"

function GenesPageContent() {
  const explorer = useGenesExplorer()
  const geneSet = useGeneSetInput()

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

      <header className="shrink-0 space-y-2.5 border-b border-border bg-background px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Dna className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight">Genes</h1>
            {!explorer.showResults ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Explore and download annotations that contain a gene set across
                the taxonomy.
              </p>
            ) : null}
          </div>
        </div>

        <GenesSearchBar
          queryText={geneSet.queryText}
          onQueryTextChange={geneSet.setQueryText}
          onSearch={() => geneSet.runSearch()}
          onOpenPrefix={() => geneSet.openPrefix()}
          nameCount={geneSet.nameCount}
          atLimit={geneSet.queryNames.length >= MAX_NAMES_GET}
          includeTaxa={explorer.includeTaxa}
          excludeTaxa={explorer.excludeTaxa}
          onApplyTaxa={explorer.setTaxa}
        />

        {explorer.showResults ? (
          <GenesNameChips
            hitTerms={explorer.hitsTerms}
            terms={explorer.adapterTerms}
            excluded={explorer.excluded}
            onApplyExcluded={explorer.setExcluded}
            onRemoveName={geneSet.removeName}
            onClearAll={geneSet.clearAll}
            includeTaxa={explorer.includeTaxa}
            excludeTaxa={explorer.excludeTaxa}
            onApplyTaxa={explorer.setTaxa}
            reviewOpen={explorer.openPopover === "review"}
            onReviewOpenChange={(open) =>
              explorer.setPopover(open ? "review" : null)
            }
          />
        ) : null}
      </header>

      {explorer.errorMessage && (
        <GenesErrorAlert
          message={explorer.errorMessage}
          onRetry={explorer.refetch}
        />
      )}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3 pt-2 sm:px-5",
          !explorer.showResults && "overflow-y-auto",
        )}
      >
        {explorer.showResults ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-5 lg:grid-rows-1">
            <GenesOverviewSection
              className="min-h-[18rem] max-h-[45vh] lg:col-span-3 lg:max-h-none lg:h-full"
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
              onIncludeName={(id) => {
                if (!explorer.excluded.has(id)) return
                const next = new Set(explorer.excluded)
                next.delete(id)
                explorer.setExcluded(next)
              }}
              viewRank={explorer.viewRank}
              rankOptions={explorer.rankOptions}
              hideAutoRank={explorer.hideAutoRank}
              rankSelectDisabled={explorer.rankSelectDisabled}
              rankSelectDisabledReason={explorer.rankSelectDisabledReason}
              onViewRankChange={explorer.setViewRank}
            />

            <GenesResultsSection
              className="min-h-0 lg:col-span-2 lg:h-full"
              adapter={explorer.adapter}
              filter={explorer.filter}
              taxonIndex={explorer.taxonIndex}
              taxonLabel={explorer.taxonLabel}
              panel={explorer.panel}
              loading={explorer.isLoading}
              isFetching={explorer.isFetching && !explorer.isLoading}
              hasSlice={explorer.hasSlice}
              activeNames={explorer.active}
              activeCount={explorer.active.length}
              resolvedCount={explorer.resolvedNames.length}
              matchedNothingCount={explorer.matchedNothing.length}
              annotationTotal={explorer.annotationTotal}
              overviewAnnotationTotal={explorer.overviewAnnotationTotal}
              overviewOrganismTotal={explorer.overviewOrganismTotal}
              downloadAllTotal={explorer.downloadAllTotal}
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
              onDownloadAll={explorer.downloadAllTsv}
              onDownloadSelection={explorer.downloadSelectionTsv}
              onOpenAnnotation={explorer.openAnnotation}
              onOpenGene={explorer.openGene}
              onPop={explorer.popPanel}
              onPopToList={explorer.resetPanel}
            />
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
