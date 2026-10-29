"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Dna } from "lucide-react"

import { GenesCompareView } from "@/components/genes/genes-compare-view"
import { GenesEmptyState } from "@/components/genes/genes-empty-state"
import { GenesErrorAlert } from "@/components/genes/genes-error-alert"
import { GenesAnnotationsView } from "@/components/genes/genes-annotations-view"
import {
  filterFromSelection,
  GenesOverviewSection,
} from "@/components/genes/genes-overview"
import { GenesPrefixSheet } from "@/components/genes/genes-prefix-sheet"
import { GenesQueryBar } from "@/components/genes/genes-query-bar"
import { GenesViewTabs } from "@/components/genes/genes-view-tabs"
import { useCompareStore } from "@/lib/genes/compare-store"
import { EMPTY_LIST_FILTERS } from "@/lib/genes/list-filters"
import { taxaFromIds } from "@/lib/genes/taxa"
import { flattenHitTree } from "@/lib/genes/tree"
import { useGeneSetInput } from "@/lib/hooks/use-gene-set-input"
import { useGenesExplorer } from "@/lib/hooks/use-genes-explorer"
import { cn } from "@/lib/utils"

function GenesPageContent() {
  const explorer = useGenesExplorer()
  const geneSet = useGeneSetInput()
  const pinCount = useCompareStore((s) => s.pins.length)
  const [selectionNameMatch, setSelectionNameMatch] = useState<"any" | "all">(
    "any",
  )
  const [annSelectionNameMatch, setAnnSelectionNameMatch] = useState<
    "any" | "all"
  >("any")
  const [editorOpenSignal, setEditorOpenSignal] = useState(0)

  const visibleRowIds = useMemo(() => {
    if (!explorer.tree) return [] as string[]
    return flattenHitTree(explorer.tree.roots, explorer.expanded).map(
      (r) => r.node.id,
    )
  }, [explorer.tree, explorer.expanded])

  const visibleColNames = useMemo(
    () => explorer.adapterTerms.map((t) => t.name),
    [explorer.adapterTerms],
  )

  // Prune selection when tree ids / active genes change.
  useEffect(() => {
    const rowIds = new Set(visibleRowIds)
    const colNames = new Set(
      explorer.adapterTerms.map((t) => t.id.toLowerCase()),
    )
    explorer.dispatchSelection({ type: "prune", rowIds, colNames })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prune on identity of sets
  }, [visibleRowIds.join(","), explorer.adapterTerms.map((t) => t.id).join(",")])

  const selectionCounts = useMemo(() => {
    if (!explorer.adapter) return { annotations: 0, species: 0 }
    const pred = filterFromSelection(
      explorer.filter,
      explorer.distributionSelection,
      selectionNameMatch,
    )
    return {
      annotations: explorer.adapter.annotations(pred, {
        limit: 1,
        offset: 0,
      }).total,
      species: explorer.adapter.speciesCount(pred),
    }
  }, [
    explorer.adapter,
    explorer.filter,
    explorer.distributionSelection,
    selectionNameMatch,
  ])

  const dispatchSelection = explorer.dispatchSelection
  const setSelectionAnchor = explorer.setSelectionAnchor
  const selectionAnchor = explorer.selectionAnchor

  const onSelectRow = useCallback(
    (id: string, opts: { toggle: boolean; shift: boolean }) => {
      const mod = opts.toggle ? "toggle" : "replace"
      dispatchSelection({
        type: "click-row",
        id,
        mod,
        visibleRows: visibleRowIds,
        shiftAnchor: opts.shift ? selectionAnchor.row : null,
      })
      if (!opts.shift) setSelectionAnchor({ row: id })
    },
    [dispatchSelection, setSelectionAnchor, selectionAnchor.row, visibleRowIds],
  )

  const onSelectCol = useCallback(
    (name: string, opts: { toggle: boolean; shift: boolean }) => {
      const mod = opts.toggle ? "toggle" : "replace"
      dispatchSelection({
        type: "click-col",
        name,
        mod,
        visibleCols: visibleColNames,
        shiftAnchor: opts.shift ? selectionAnchor.col : null,
      })
      if (!opts.shift) setSelectionAnchor({ col: name })
    },
    [dispatchSelection, setSelectionAnchor, selectionAnchor.col, visibleColNames],
  )

  const onSelectCell = useCallback(
    (
      taxid: string,
      gene: string,
      opts: { toggle: boolean; shift: boolean },
    ) => {
      const mod = opts.toggle ? "toggle" : "replace"
      dispatchSelection({
        type: "click-cell",
        taxid,
        gene,
        mod,
        visibleRows: visibleRowIds,
        visibleCols: visibleColNames,
        shiftAnchor: opts.shift ? selectionAnchor.cell : null,
      })
      if (!opts.shift) setSelectionAnchor({ cell: { taxid, gene } })
    },
    [
      dispatchSelection,
      setSelectionAnchor,
      selectionAnchor.cell,
      visibleRowIds,
      visibleColNames,
    ],
  )

  const distributionSelection = explorer.distributionSelection
  const setListFilters = explorer.setListFilters
  const clearDistributionSelection = explorer.clearDistributionSelection
  const setView = explorer.setView
  const setTaxa = explorer.setTaxa
  const excludeTaxa = explorer.excludeTaxa

  const onShowOnly = useCallback(() => {
    const sel = distributionSelection
    if (!sel.kind) return
    if (sel.kind === "rows") {
      setListFilters({
        ...EMPTY_LIST_FILTERS,
        includeTaxids: [...sel.rows],
        nameMatch: selectionNameMatch,
      })
    } else if (sel.kind === "cols") {
      setListFilters({
        ...EMPTY_LIST_FILTERS,
        includeNames: [...sel.cols],
        nameMatch: selectionNameMatch,
      })
    } else {
      setListFilters({
        ...EMPTY_LIST_FILTERS,
        includeCells: sel.cells.map((c) => ({
          taxid: c.taxid,
          gene: c.gene,
        })),
        nameMatch: selectionNameMatch,
      })
    }
    clearDistributionSelection()
    setView("annotations")
  }, [
    distributionSelection,
    setListFilters,
    clearDistributionSelection,
    setView,
    selectionNameMatch,
  ])

  const onRestrictSearch = useCallback(() => {
    const sel = distributionSelection
    if (sel.kind !== "rows" || !sel.rows.length) return
    const taxids = sel.rows
      .map((id) => Number(id))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (!taxids.length) return
    setTaxa(taxaFromIds(taxids), excludeTaxa)
    clearDistributionSelection()
  }, [
    distributionSelection,
    setTaxa,
    excludeTaxa,
    clearDistributionSelection,
  ])

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
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
              explorer.showResults && "sr-only",
            )}
          >
            <Dna className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1
              className={cn(
                "text-base font-semibold tracking-tight",
                explorer.showResults && "sr-only",
              )}
            >
              Genes
            </h1>
            {!explorer.showResults ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Explore and download annotations that contain a gene set across
                the taxonomy.
              </p>
            ) : null}
          </div>
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
          onApplyText={(names) =>
            geneSet.commitNames(names, { replace: true })
          }
          onPreparePrefixDraft={geneSet.setQueryText}
          onRemoveName={geneSet.removeName}
          onRemoveZeroHits={geneSet.removeZeroHitNames}
          onClearAll={geneSet.clearAll}
          includeTaxa={explorer.includeTaxa}
          excludeTaxa={explorer.excludeTaxa}
          onApplyTaxa={explorer.setTaxa}
          editorOpenSignal={editorOpenSignal}
        />
      </header>

      {explorer.errorMessage && (
        <GenesErrorAlert
          message={explorer.errorMessage}
          onRetry={explorer.refetch}
        />
      )}

      {explorer.showResults ? (
        <GenesViewTabs
          view={explorer.view}
          onViewChange={explorer.setView}
          annotationTotal={explorer.annotationTotal}
          pinCount={pinCount}
        />
      ) : null}

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
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {explorer.view === "distribution" ? (
              <GenesOverviewSection
                className="h-full min-h-0"
                adapter={explorer.adapter}
                filter={explorer.filter}
                tree={explorer.tree}
                expanded={explorer.expanded}
                loading={explorer.isLoading}
                onToggleExpand={explorer.toggleExpanded}
                selection={explorer.distributionSelection}
                selectionNameMatch={selectionNameMatch}
                onSelectionNameMatchChange={setSelectionNameMatch}
                onSelectRow={onSelectRow}
                onSelectCol={onSelectCol}
                onSelectCell={onSelectCell}
                onClearSelection={explorer.clearDistributionSelection}
                onShowOnly={onShowOnly}
                onRestrictSearch={onRestrictSearch}
                selectionAnnotationCount={selectionCounts.annotations}
                selectionSpeciesCount={selectionCounts.species}
                unit={explorer.unit}
                onUnitChange={explorer.setUnit}
                overviewAnnotationTotal={explorer.overviewAnnotationTotal}
                overviewSpeciesTotal={explorer.overviewSpeciesTotal}
                zeroHitCount={explorer.matchedNothing.length}
                onReviewZeroHits={() =>
                  setEditorOpenSignal((n) => n + 1)
                }
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
                onCoverageChange={(range) =>
                  explorer.setCoverage(range, explorer.termCount)
                }
                coverageOpen={explorer.openPopover === "coverage"}
                onCoverageOpenChange={(open) =>
                  explorer.setPopover(open ? "coverage" : null)
                }
                matchedCounts={explorer.coverageData.matchedCounts}
                termCount={explorer.termCount}
                keep={explorer.keep}
                onKeepChange={explorer.setKeep}
                sort={explorer.sort}
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
                loading={explorer.isLoading}
              />
            ) : null}

            {explorer.view === "compare" ? (
              <GenesCompareView
                className="h-full min-h-0"
                onGoToAnnotations={() => explorer.setView("annotations")}
              />
            ) : null}
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
