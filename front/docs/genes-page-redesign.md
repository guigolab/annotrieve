# Genes page redesign: reference spec (v1)

> Status: **complete** (rev 5, P0–P7). Reference for the refactor of `app/genes/page.tsx`. Do not contradict
> **§13 Decisions** without amending it. Anything beyond v1 is in §15 *Later / not planned*.
>
> **P0–P6 complete** (see phase table §12). **P7 complete:** flat §10 chrome; heatmap/table `role="grid"`;
> polite count live region; dead heatmap kinds / tray copy removed; manual QA checklist below.

Contents

1. [Why redesign](#1-why-redesign)
2. [Principles](#2-principles)
3. [Overview: one query, three views](#3-overview-one-query-three-views)
4. [The query bar](#4-the-query-bar)
5. [View: Distribution](#5-view-distribution)
6. [View: Annotations](#6-view-annotations)
7. [View: Compare](#7-view-compare)
8. [State and URL](#8-state-and-url)
9. [Touch / keep / delete](#9-touch--keep--delete)
10. [Visual rules](#10-visual-rules)
11. [Scale](#11-scale)
12. [Phased plan and tests](#12-phased-plan-and-tests)
13. [Decisions and open questions](#13-decisions-and-open-questions)
14. [Backlog and known bugs](#14-backlog-and-known-bugs)
15. [Later / not planned](#15-later--not-planned)

---

## 1. Why redesign

`GET /hits` returns one payload (`terms` + `rows[annotationId, taxid, source, matchedTerms, releaseDate,
assemblyName]`). `createClientHitsAdapter` derives everything the page shows from it. The current UI puts several
different jobs under one "focus" (`t`, `g`):

| Job | Unit | Output |
|---|---|---|
| Distribution: where are my genes across clades? | clade × gene | an insight or an image |
| Annotations: collect annotations | annotation / species | TSV |
| Browse genes: what is inside this annotation? | gene in one annotation | understanding, pins |
| Compare: how do transcripts differ? | pinned gene / transcript | an insight |

Problems today (`page.tsx`, `use-genes-explorer.ts`, `store.ts`):

1. Three kinds of state are mixed: server query (`queryNames`, `includeTaxa`, `excludeTaxa`), client hide
   (`excluded`), view filters (`t`, `g`, `sources`, `coverage`, `viewRank`, `expanded`, `panel`).
2. The same intent has several controls (dropping a gene: chip ✕, review popover, prefix sheet, heatmap column;
   restricting taxa: two popovers, heatmap row click, rank select).
3. The right column holds competing things (list, annotation, gene drill-in, compare tray, results toolbar).
4. Comparing is expensive (about 8 clicks for one gene in two species).
5. The header is three stacked rows; drill-in is three levels with breadcrumbs.
6. Scale: one gene can match ~8k annotations, a kingdom ~5k, and the list shows 52px cards in a narrow column.

Goals: one view per job with only its own controls; one place to change the query; fewer clicks; works from 1 to
200 gene names and 5k to 8k annotations.

---

## 2. Principles

1. **One intent, one control.** If two controls do the same thing, delete one.
2. **Query vs view.** The query (genes + scope) changes only in the query bar. Views read it.
3. **Progressive disclosure.** Common controls visible; the rest in one popover per view.
4. **Explicit hand-offs.** Moving between views is a tab or a labelled action and leaves visible filter chips.
5. **No silent data changes.** Hidden rows are always counted (`1,284 of 8,012`) with a one-click reset.
6. **Recoverable actions.** Removing genes or clearing: toast with Undo, no confirm dialogs.
7. **Stable layout.** Reserved toolbar heights; loading never shifts controls.
8. **Quiet visuals.** Neutral surfaces, one accent, flat sections, no nested cards.

---

## 3. Overview: one query, three views

```
┌───────────────────────────────────────────────────────────────────────────┐
│ QUERY BAR  [ add genes… ]  Genes: BRCA1, TP53 +10 ▾     Scope: Eukaryota ▾ │
├───────────────────────────────────────────────────────────────────────────┤
│ [ Distribution ]  [ Annotations ]  [ Compare (3) ]                         │
├───────────────────────────────────────────────────────────────────────────┤
│ full-width view with only its own controls                                │
│ (Annotations only: gene drawer on the right)                              │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Query** (global): genes and scope. `/hits` is fetched once; switching views never refetches.
- **Distribution**: the heatmap. Default after a search.
- **Annotations**: the annotation list, plus the gene drawer (browse genes of one annotation).
- **Compare**: transcript tracks of pinned genes.

**Flow.** The only path is

```
Distribution (heatmap) ──show only──▶ Annotations (list) ──pin──▶ Compare
```

There is **no direct path from the heatmap to Compare**.

---

## 4. The query bar

One row (~56px, wraps below `md`). No name-chips row, no review popover, no second taxa popover. The intro
sentence appears only in the empty state.

```
[ 🔍 Add genes (BRCA1, TP53 or prefix*)… ][ Prefix… ]   Genes: BRCA1, TP53, MYC +9 ▾    Scope: Metazoa, −Aves ▾
```

### 4.1 Add-genes input (it only adds)

- Enter commits typed tokens and **merges** them into the set (`commitNames` / `mergeGeneNames`), then empties the
  input. It never replaces the set.
- Pasting 2+ tokens commits at once with a toast `Added 12 genes · Undo`.
- A token with `*` is a prefix: Enter (or `Prefix…`) opens the existing prefix sheet; after Apply the names are
  ordinary genes in the set.
- Limit `MAX_NAMES_GET` (200), shown as `142/200` in the editor.

### 4.2 Gene set chip and editor

The chip shows up to 3 names then `+N`. Clicking opens the **gene set editor** (popover ≥ `md`, sheet below), the
only place to edit the set.

```
┌ Gene set · 12 genes ────────────────────── 12/200 ┐
│ [ textarea: BRCA1, TP53, MYC …            ]       │
│ [Apply text]                      [Add by prefix…]│
│ BRCA1            5,012 annotations            ✕   │
│ TP53             4,980                        ✕   │
│ FOO1   no hits                                ✕   │  ← amber, sorted last
│ [Remove all with no hits]            [Clear all]  │
└───────────────────────────────────────────────────┘
```

- Rows sorted by annotation count (`adapter.activeTerms()`), zero-hit genes last; `viaAlias` badge kept. The
  counts are how users find genes that gave nothing or too much.
- ✕ removes one gene immediately with `Removed BRCA1 · Undo`.
- `Apply text` replaces the set in bulk; prefixes always go through the sheet.

### 4.3 Scope

One `Scope: …` chip opening the existing taxa picker (body of `GenesTaxaPopover`). Summary: `All eukaryotes`,
`Metazoa`, `Metazoa, −Aves`. Changing scope refetches, resets the Distribution rank to auto and clears list
filters that reference clades. The heatmap selection bar can also offer **Restrict search to selected clades**
(clade rows only); it uses the same code path.

### 4.4 Empty state

`GenesEmptyState` stays (centred card with example gene sets). Tabs are hidden until a set exists.

---

## 5. View: Distribution

Purpose: see where genes occur across the taxonomy and pick clades, genes or cells to filter the annotation list.

### 5.1 Toolbar

```
Rank: [Order ▾ · 47 taxa]   Count: ( Annotations | Species )        5,012 annotations · 2,300 species   [⬇ Export ▾]
```

- **Rank select** (`GenesRankSelect`, moved here): auto-chosen so rows stay about 30 to 80; ranks above
  `GENES_RANK_TAXON_CAP` (1000) are disabled with a reason.
- **Count unit**: *Annotations* (today) or *Species* (a species counts once if any of its annotations has the gene;
  species = `speciesForTaxid(row.taxid, taxonIndex).id`). It drives cell numbers, colour fraction, row-label
  counts, tooltips and exports. URL `unit`.
- **Export** (download heatmap): `PNG`, `SVG`, `TSV matrix`. PNG/SVG export the visible rank rows (title notes a
  truncation, e.g. "top 200 of 5,012"); TSV has every row at the current rank × every active gene in the chosen
  unit. Reuse `onExportHeatmap` / `heatmap-export.ts`.

### 5.2 Body

Keep `GenesHeatmapTable` (sticky label column, expand/collapse tree, load more by `GENES_TREE_PAGE_SIZE`;
P3 does **not** add row virtualization). Gene tiles are canvas-drawn with horizontal column virtualization;
tip vectors are cached without `nodeIds` so Load more / export reuse them. Heatmap clicks accumulate a selection and no longer auto-switch to
Annotations — **Show only →** applies filters and switches. Changes:

- Row headers (clades), column headers (genes) and cells are selectable (§5.3).
- Columns are exactly the active genes; no ✕ and no "excluded"/"empty" column kinds. Zero-hit genes appear in the
  gene set editor and as a one-line notice (`2 genes had no hits · Review`).
- Colour: keep the blue ramp (`cellColorT`); show counts when cells are wide enough.
- **Single-gene mode** (1 active gene): the fraction colour is always ~100%, so draw horizontal bars proportional to
  the absolute count instead.
- Legend: colour = share of hit annotations (or species) under the clade that contain the gene.

### 5.3 Multi-selection (rows, columns, cells)

Purpose: **select rows, columns or cells to narrow the annotation list to them (Show only).** There is no "hide"
or exclude action. It never leads to Compare.

| Gesture | Effect |
|---|---|
| Click a header or cell | Replace the selection with it |
| `Ctrl/Cmd`+click | Toggle |
| `Shift`+click | Range (cells: rectangle) |
| Header checkbox (visible on hover/focus; always on touch) | Toggle without modifiers |
| Arrows, `Shift`+arrows, `Space`, `Esc` | Move, extend, toggle, clear |

A selection is of one kind at a time (rows, or columns, or cells); starting another kind replaces it. It lives in
memory, survives tab switches, and is pruned when its ids disappear (rank or query change). Store it as id
rectangles plus a small exclusion set (never materialise cell pairs). One reducer, `lib/genes/selection.ts`, is
shared with the Annotations table (§6.5).

The **selection bar** is pinned at the bottom of the view while something is selected:

```
3 clades selected · 640 annotations · 410 species      [ Show only → ]  [ Clear ]
2 genes selected  · 812 annotations                    Match: ( any | all )  [ Show only → ]  [ Clear ]
5 cells selected  · 96 annotations · 80 species        [ Show only → ]  [ Clear ]
```

- **Show only** narrows the list to the selection. From the heatmap it switches to the Annotations view with the
  filter applied and visible as a chip (§6.4); removing the chip undoes it.
- Counts are live and use the same predicate as the list.
- Genes: `Match: any | all` applies to *Show only*.
- Clade rows only: `Restrict search ▾` (§4.3).

---

## 6. View: Annotations

Purpose: collect annotations. One wide, virtualized table with its filters, a download, and a gene drawer.

### 6.1 Layout

```
Only: Primates ✕   Only genes: BRCA1, TP53 (all) ✕                              1,284 annotations · 612 species   (of 8,012)
🔍 Search organisms…   Keep ▾   Source chips   Coverage…   Sort ▾   [Reset]   [⬇ Download TSV]

 ☐  Organisms (●src)  Assembly   Release  Cov   BRCA1 TP53 MYC …    (gene columns scroll horizontally)
 ☐  ● Homo sapiens     GRCh38      2024     3/3     ●    ●    ●
 ☐  ● Pan troglodytes  Clint       2023     2/3     ●    ●    ○
```

### 6.2 Toolbar

- **Species search**: first control, always visible; input with ✕ and `/` shortcut. Client-side, case-insensitive
  substring on scientific name, common name and assembly name; debounced ~150 ms; the count updates live. URL `q`.
- **Keep policy** (the only dedupe control):

| Option | Meaning |
|---|---|
| **All** (default) | Every annotation |
| **Best match per species** | One per species: the annotation matching the **most genes** (`k` of the active genes); ties → newest release, then `annotationId` |
| **Latest per species** | One per *(species × source)*: newest `releaseDate` (nulls last), then `annotationId` |

  The user chooses the source: the Source filter runs *before* Keep, so "best match" with only RefSeq enabled gives
  the best RefSeq annotation per species. There is no built-in source preference.
- **Source**: compact multi-select (Ensembl / GenBank / RefSeq with counts), default all.
- **Keep**: select (All / Best match / Latest). **Coverage…** opens `GenesCoveragePopover` (no Match any/all shortcuts).
- **Sort**: Coverage (default), Organism A–Z, Release newest, Source. **Group** removed; list is always flat.
- **Counts**: always `filtered (of total)`; when Keep hides rows add `showing 612 of 1,284`.
- **Reset** appears only when something differs from defaults. It restores list filters (including
  `includeAnnotationIds`), Source, coverage, Keep, Sort, search, and clears `excluded` / annotations
  selection; it does **not** touch the query, Distribution `viewRank` / unit, or pins. Distribution heatmap
  uses `effectiveViewRank = viewRank ?? (no include taxa ? "kingdom" : null)` so Reset can leave the URL free
  of `rank=`.
- **Pipeline order** (document in code): `scope (query) → list filters → sources → coverage → keep →
  search → sort` (group always none). Filters run before Keep, so "latest" means "latest of those that match".

### 6.3 Table

Full width, virtualized vertically (variable heights, `useVariableVirtualWindow`) and horizontally for gene
columns (`useVirtualColumns`); sticky column header; sticky left columns (checkbox, species).

| Column | Notes |
|---|---|
| ☐ | Row checkbox; header tri-state selects all filtered rows |
| Organisms | Source color dot + italic name |
| Assembly | `assemblyName ?? annotationId`, muted |
| Release | `formatReleaseDate` |
| Cov | `k/N` numbers only |
| *Gene columns* | One per active gene, ordered by prevalence: ● present / ○ absent (`text-primary` / muted). Header = gene name (always horizontal, truncated; column width 72–96px via `annotationsGeneColumnWidth`; heatmap may still rotate) and clickable to select the column |

- Row click (outside the checkbox) opens the drawer (§6.6). Present ● opens the drawer and expands that gene; absent cells stay inert. Pin from the drawer gene row (or the subject-gene row pin), not from the matrix cell.
- **Pin button** on each row when the list has exactly one subject gene (§7.2).
- Zero rows: `No annotations match` + `Reset`. Row height 40px; group header 32px.

**Sticky group headers.** Taxonomic **labels, not folders** (no expand/collapse): a row such as `Primates · 210
annotations · 180 species` above the group's annotations. While you scroll through a group its header stays pinned
under the column header, then the next one pushes it away.

- Rows are a flat sorted list (no taxonomic group headers).
- Implementation: rows are absolutely positioned in a virtual window, so CSS `sticky` does not work across windowed
  rows. Render the current group's header as an overlay computed from the first visible row, plus real header rows
  in the flow (`aria-hidden` on the overlay).

### 6.4 List filters (what selection and the heatmap produce)

The list has one **Show only** filter with four dimensions (no exclude set):

| Dimension | Keeps |
|---|---|
| Clades | annotations under **any** of the clades |
| Genes | annotations containing **any** or **all** (`Match`) of the genes |
| Cells | annotations under the clade **and** containing the gene, for any cell |
| Annotations | only these annotation ids |

An annotation passes when it satisfies every non-empty dimension (AND across dimensions, OR inside a dimension).
These filters are ANDed with Source, coverage, Keep and search.

**Chips** above the table: `Only: Primates, Rodentia`, `Only genes: BRCA1, TP53 (all)`, `Only cells: 3`,
`Only annotations: 5`. Clicking a chip lists its items with a ✕ each; the chip's ✕ removes the whole dimension.

### 6.5 Multi-selection in the table

Same gestures, same reducer and same bar as §5.3. In the table:

- **Rows** = annotations → `Show only` maps to the *Annotations* dimension.
- **Columns** = genes → `Show only` (with `Match: any | all`) maps to the *Genes* dimension.
- Heatmap-style cell selection is not used here (present cells open a gene in the drawer instead). Filters apply in place (no view switch).

### 6.6 Gene drawer (gene-focused from the matrix)

Right-side **non-modal** sheet (~560px; full-screen below `lg`); the table stays visible. Store field is
`drawer: { annotationId, localId, species, source } | null` (not a three-level panel stack).

```
┌ Homo sapiens                    Open ↗  ✕ ┐
│ ● Ensembl · GRCh38                        │
│ cf8c21fc…                                 │
│ [optional: N genes share this locus · IDs]│
│ BRCA1  [pin]                              │
│ locus · length · strand · source id       │
│ transcripts / xrefs…                      │
└───────────────────────────────────────────┘
```

- **Header:** species, source color + label · assembly, mono `annotationId`, Open↗, Close.
- **Matrix cell (●)** opens an anchored **gene detail popover** (not URL-synced); the drawer stays row-oriented for now.
  Row open without `localId` still shows “Click a filled gene cell…”.
- Same-locus duplicates (identical `seqid/start/end/strand` among name matches) share one panel with a chooser;
  switching updates `localId` so GFF/xrefs/pin follow the chosen `source_gene_id`.
- Pin on the gene-detail chrome (`togglePin`). Transcript drawing (`streamAnnotationGff`) unchanged.
- Keyboard: `↑/↓` updates the drawer annotation; `Enter` opens; `Esc` closes and returns focus to the row.
- URL: `ann` (and `gene`). Opening pushes history; closing goes back.

### 6.7 Download

One **Download TSV** button on the Annotations toolbar acting on the **post-pipeline filtered list** (use *Show
only* to narrow first). Client-side via `hitsToTsv`, cap `GENES_TSV_DOWNLOAD_CAP` (10,000) with a visible
"first N" note. Dual all/selection download and the GFF stub menu were removed in P4. The heatmap export lives
in the Distribution toolbar (§5.1).

---

## 7. View: Compare

Purpose: compare transcript structures of pinned genes. Full width. Fed only from the Annotations view.

### 7.1 Layout

```
Compare · 3 pinned                    Transcript: ( Longest | Choose per track )         [Clear]  [Add genes →]
Homo sapiens     BRCA1   ▇▇▇▇──▇▇──▇▇▇▇▇      NM_007294 ▾    ✕
Mus musculus     Brca1   ▇▇▇──▇▇▇─▇▇▇          NM_009764 ▾    ✕
```

- Tracks: `GenesCompareTracks` with a shared bp ruler, vertical grid lines, zoom (−/+), and All / Exons / CDS
  feature filter. Per-track download opens a stub popover (export handlers TBD). Compact centered labels sit on
  each track; GFF resolution and longest / choose-per-track unchanged.
- **Default = longest transcript** (`pickLongestTranscript`; `transcriptId: null` already resolves to it).
- **No cap on pins.** Remove `COMPARE_PIN_CAP`; `pinGene` never refuses. The view is a plain list of tracks.
- `Add genes →` returns to Annotations with the previous filters intact. The empty state explains how to pin. The
  tab shows a badge with the pin count.
- `Clear` → toast `Cleared 3 pins · Undo`. Pins are in memory only.

### 7.2 How genes get pinned

- **From the drawer**: pin button on a gene row (existing).
- **From the list**: when exactly one *subject gene* exists — `listFilters.includeNames.length === 1`, else
  `activeNames.length === 1` (`subjectGeneName`) — each row shows a pin button. It resolves the gene in that
  annotation with `listAnnotationGenes(names=[gene])` (spinner on the button) and pins it. With several subject
  genes, open the drawer.
- Never directly from the heatmap.

---

## 8. State and URL

### 8.1 State slices

One zustand store split into slices (pins stay in `compare-store`). Keep existing action names where possible.

| Slice | Fields | Fetch impact |
|---|---|---|
| **Query** (global) | `queryText`, `queryNames`, `includeTaxa`, `excludeTaxa`, `view`, `urlReady` | Refetches `/hits` |
| **Distribution** | `viewRank`, `unit`, `expanded`, `selection` (rows \| columns \| cells) | none |
| **Annotations** | `filters` (Show only, §6.4), `sources`, `coverage`, `keep`, `group`, `sort`, `search`, `selection` (rows \| columns), `drawer { annotationId, localId }` | none |
| **Compare** | `pins` (existing store) | GFF fetch per pin |

Removed: `excluded` as a user concept, `panel`, `openPopover`, `trayExpanded`, the single `t`/`g` pair (replaced by
`filters`), `COMPARE_PIN_CAP`.

- Changing the **query** resets list `filters`, both selections, `expanded`, `drawer`, and `viewRank` when the scope
  changed. It does not reset `sources`, `keep`, `group`, `sort` and does not clear pins.
- Changing `viewRank` prunes Distribution selection ids that no longer exist.

### 8.2 URL

| Param | Meaning | Default (omitted) |
|---|---|---|
| `names`, `itax`, `etax` | query: genes, include/exclude taxids | none |
| `view` | `distribution` \| `annotations` \| `compare` | `distribution` |
| `rank`, `unit` | Distribution rank; `annotations` \| `species` | auto; `annotations` |
| `t`, `g`, `gm`, `c` | Only clades, only genes, gene match `any` \| `all`, only cells (`taxid:gene`, written when ≤ 100) | none; `any` |
| `sources`, `lo`, `hi` | source codes; coverage range | all; full |
| `keep`, `group`, `sort`, `q` | `all\|best\|latest`; `auto\|<rank>\|none`; `coverage\|species\|release\|source`; search text | `all`, `auto`, `coverage`, none |
| `ann`, `gene` | drawer annotation / expanded gene | none |

Annotation-id filters, selections and pins are in memory only. `view` changes and drawer open/close push history;
everything else replaces. Keep the "external URL change re-hydrates the store" logic in `useGenesUrlSync`.
Parse with allow-list validation. Old links without `view`: if `ann` is present open Annotations (so existing
gene/annotation deep links still show their panel); otherwise Distribution (`resolveViewFromUrl`).

---

## 9. Touch / keep / delete

Legend: **Keep** unchanged · **Touch** modify · **New** · **Delete** · **Verify** confirm first.

### 9.1 Pages, hooks, library

| File | Action | Notes |
|---|---|---|
| `app/genes/page.tsx` | Touch (rewrite shell) | Query bar, tabs, active view, drawer, selection bar. Remove the 3/5–2/5 grid and `collapseResults`; keep `Suspense` and the progress bar. |
| `lib/hooks/use-genes-explorer.ts` | Touch (split) | Into `useGenesQuery`, `useDistributionModel`, `useAnnotationsModel`. Keep query keys, `hitsRetry`, `staleTime`, `keepPreviousData`. |
| `lib/hooks/use-gene-set-input.ts` | Touch | Keep `commitNames`, `runSearch`; add `removeNames` with undo and paste-commit; fix the prefix bug (§14). Sheet reducer lives in `prefix-sheet.ts`. |
| `lib/hooks/use-genes-url-sync.ts` | Touch | §8.2 and push rules. |
| `lib/genesv1/*` | **Deleted in P0** | Confirmed unused (only self-imports). |
| `lib/genes/prefix-sheet.ts` (+ test) | New (P0) | Pure `sheetReducer` / `namesToCommitFromSheet`, extracted so node:test can cover the prefix flow. |
| `lib/genes/store.ts` (+ `store.test.ts`) | Touch | Slices; remove `panel`, `excluded`, `openPopover`, `t`/`g`; add `view`, `unit`, selections, `filters`, `keep`, `group`, `sort`, `search`, `drawer`; fix filter reset (§14). |
| `lib/genes/adapter.ts`, `filters.ts`, `heatmap.ts`, `tree.ts`, `url.ts`, `heatmap-export.ts` | Touch | Species unit, Show only filters, keep, search, group, selection counts; update tests. |
| `lib/genes/compare-store.ts` | Touch (P1 / P6) | **P1:** removed `trayExpanded`. **P6:** removed `COMPARE_PIN_CAP`; `setPins` + `transcriptMode`. |
| `lib/genes/view.ts` (+ test) | New (P1) | `GenesView`, `parseView`, `resolveViewFromUrl`. |
| `lib/genes/keep.ts`, `selection.ts` | New | Keep policies + group helper; shared selection reducer. |
| `species.ts`, `coverage.ts`, `hits.ts`, `taxa.ts`, `taxon-index.ts`, `tokenize.ts`, `prefix.ts`, `sort.ts`, `matches.ts`, `gff.ts`, `gene-category.ts`, `format.ts`, `curie.ts`, `namespace-groups.ts`, `virtual.ts`, `ui.ts` | Keep | |
| `lib/api/annotations.ts`, `lib/api/xrefs.ts` | Keep | Reused as is. |

**Data layer notes**

- Species unit: `overviewRowCounts(..., unit)` / `nodeCounts(...)`; build species-keyed vectors (`byName[i] = 1`
  if any annotation of the species has gene *i*) and de-duplicate species when folding a node. Add `unit` to cache
  keys. Add `HitTreeNode.speciesCount` so row labels follow the unit.
- Generalise `filterIndexed`'s single `taxid`/`name` to the Show only filters of §6.4 (cell sets as
  `Map<cladeId, Set<termIndex>>`, built once per filter key); `filterKey` canonicalises everything.
- `excludeTerms` remains only as an internal optimistic mask while a gene-removal refetch is in flight.

### 9.2 Components (`components/genes`)

| File | Action | Notes |
|---|---|---|
| `genes-search-bar.tsx` | **Deleted in P2** | Replaced by `genes-query-bar.tsx`. |
| `genes-query-bar.tsx`, `genes-gene-set-editor.tsx` | New (P2) | Add-only input, summary chip + editor, Scope chip. |
| `genes-view-tabs.tsx`, `genes-selection-bar.tsx`, `genes-filter-chips.tsx` | New | §3 (P1 tabs); §5.3 / §6.4 later. |
| `genes-name-chips.tsx`, `genes-review-names.tsx` | **Deleted in P2** | Replaced by chip + editor; no hide-gene UI (D-3). |
| `genes-taxa-popover.tsx`, `genes-prefix-sheet.tsx`, `genes-error-alert.tsx` | Keep / touch | Taxa popover is scope-only (single mount in the query bar). |
| `lib/genes/gene-set.ts` (+ test) | New (P2) | `planOpenPrefix`, `formatScopeSummary`, `buildGeneSetEditorRows`, chip label. |
| `genes-empty-state.tsx` | Touch (copy only) | Intro paragraph lives here only. |
| `genes-overview.tsx` | Touch → `genes-distribution-view.tsx` | Toolbar, unit, export menu. Rename + `useGenesExplorer` split deferred (post-alignment). |
| `genes-heatmap-table.tsx` | Touch | Selection of rows/columns/cells; drop ✕ and excluded/empty column kinds; single-gene bars; keep virtualization and tree. |
| `genes-rank-select.tsx` | Keep (move) | Distribution toolbar. |
| `genes-results-section.tsx`, `genes-filter-bar.tsx`, `genes-results-toolbar.tsx`, `genes-panel-header.tsx`, `genes-annotation-list.tsx`, `genes-download-menu.tsx` | **Deleted in P4** | Replaced by `genes-annotations-view/toolbar/table`; single Download TSV on the toolbar. |
| `genes-compare-tray.tsx` | **Deleted in P1** | Replaced by `genes-compare-view.tsx`. |
| `genes-view-tabs.tsx`, `genes-compare-view.tsx` | New (P1) | Tablist + Compare tab body (tracks, empty state). |
| `genes-annotations-view.tsx`, `genes-annotations-toolbar.tsx`, `genes-annotations-table.tsx` | **New in P4** / touch P5 | §6.1–6.3; P5 adds drawer beside table, keyboard, subject-gene pin column. |
| `lib/genes/keep.ts`, `annotations-pipeline.ts`, `annotations-controls.ts` | **New in P4** | Keep policies, group/sort helpers, pipeline order. |
| `genes-coverage-popover.tsx` | Keep | Behind **More**. |
| `genes-annotation-detail.tsx` | **P5** drawer body | Inline gene expand; no panel levels. |
| `genes-annotation-drawer.tsx` | **New in P5** | Non-modal right sheet; Esc/focus; Open↗ + ✕. |
| `genes-gene-row.tsx` | Keep | Pin already there. |
| `genes-gene-detail.tsx`, `genes-gene-browser.tsx`, `genes-gene-xrefs.tsx`, `genes-match-chips.tsx` | Keep | Inline in the drawer; GFF transcript drawing unchanged. |
| `genes-pagination.tsx` | Keep | Used by `genes-gene-xrefs.tsx`. |
| `genes-compare-tracks.tsx` | Keep | Hosted by `genes-compare-view.tsx`. |
| `genes-download-menu.tsx` | **Deleted in P4** | Toolbar Download TSV replaces the dual all/selection + GFF stub menu. |

---

## 10. Visual rules

- **Flat sections**: query bar, tabs, toolbar and body separated by 1px `border-border`. Remove the
  `rounded-xl border bg-card/50 shadow-sm` panels. Only popovers, the drawer and dialogs have elevation.
- **Reserved heights**: query bar 56, tabs 40, toolbar 44–88, selection bar 48; the body scrolls inside
  `h-[calc(100vh-4rem)]`.
- **Type/density**: table text 13px, headers 11–12px medium muted, `tabular-nums` counts, gene symbols `font-mono`,
  species italic. Row 40px (table), 28–32px (heatmap). Targets ≥ 32px (≥ 44px on touch).
- **Colour**: neutral surfaces, one accent (`primary`) for the active tab, selection and focus. Keep the blue heat
  ramp and `sourceColor`. Amber only for warnings. Never colour alone (●/○ glyphs, counts in cells).
- **Controls**: one primary button per view. Segmented controls for 2–3 exclusive options (Count, Keep, Has,
  Transcript); selects for ≥ 4 (Rank, Sort); popovers for secondary filters. Sentence-case verbs.
- **Feedback**: skeletons while loading; previous data plus the top progress bar on refetch; toast with Undo for
  removals and clears; 120–150ms transitions, respect `prefers-reduced-motion`.
- **A11y**: tabs with roving tabindex; heatmap and table as `role="grid"` with `aria-multiselectable` and
  `aria-selected`; counts in a polite live region; non-modal drawer with focus moved in and restored on close.

---

## 11. Scale

| Concern | Approach |
|---|---|
| 8k rows × up to ~12 gene columns | Vertical + horizontal virtualization; 40px rows; no per-row network calls |
| 200 gene names | Gene set shown as a summary chip; heatmap canvas tiles + virtual headers (`useVirtualColumns`); Annotations table gene columns virtualized and ordered by prevalence |
| Heatmap rows | Auto rank targets 30–80 rows; ranks above 1000 taxa disabled; tree expansion paged; tip-vector cache shared across Load more / export |
| Heatmap PNG | Soft scale-down when width×height is huge (SVG/TSV stay full fidelity) |
| Filtering | Client-side from one payload; predicates cached by `filterKey`; no refetch on view switch |
| Selections | Id rectangles + exclusion set; never materialise cell pairs |
| Sticky headers | Overlay technique (no CSS sticky inside the virtual window) |
| Downloads | TSV capped at 10,000 rows with a visible note |

---

## 12. Phased plan and tests

Each phase ships in a working state.

| Phase | Scope | Exit criteria |
|---|---|---|
| **P0** Prep | Delete `lib/genesv1`; extract `prefix-sheet.ts`; **reproduce the two known bugs with todo-marked tests** (§14); correct this table | `lib/genesv1` gone; `tsc` / lint / `npm test` no worse than baseline; root causes written in §14; todo tests point at P2/P4 |
| **P1** Shell | `view`, tabs, thin `page.tsx`; existing views mounted per tab; remove `collapseResults` and the grid; Compare tab replaces the tray | Tab switch makes no `/hits` call; URL carries `view`; Back/Forward restores the tab; `?ann=` without `view` opens Annotations |
| **P2** Query bar | Add-only input, chip, editor, scope chip; **fix prefix add**; delete name chips, review popover, second taxa popover | **Done:** `seleno*` + Enter / Prefix…; bare-stem Prefix… seeds only; Undo toasts; one Scope chip |
| **P3** Distribution | Toolbar (rank, unit, export PNG/SVG/TSV), species counting, single-gene bars; `selection.ts` + selection bar; *Show only* hand-off | **Done:** count unit in store/URL; active-only columns + single-gene bars; multi-select (no auto tab jump); Show only → `listFilters`; load-more paging kept (no new virtualization) |
| **P4** Annotations | Toolbar, species search, chips, Keep, Source, Has, Sort, Group; table with gene columns; sticky group headers; row/column selection; Download TSV; **fix filter reset**; delete filter bar, results toolbar/section, panel header | **Done:** virtualized table; Keep/group/sort/search in store+URL; Reset clears list controls + `excluded` (leaves `viewRank`); `effectiveViewRank`; temporary Back+detail until P5 |
| **P5** Drawer and pin | Non-modal drawer, inline gene detail, pin (drawer + single-subject row button), `ann`/`gene` URL | **Done:** `drawer` state; non-modal sheet; inline expand; Esc + focus return; subject-gene list pin; `ann`/`gene` push |
| **P6** Compare | Longest by default, no pin cap, Clear with Undo (tray already gone in P1) | **Done:** uncapped pins; Clear+Undo; Add genes →; Transcript Longest\|Choose; `toastUndo` shared |
| **P7** Polish | A11y pass, responsive, empty/error states, clean-up of dead code | **Done:** flat chrome; grid a11y + live region; empty/error copy; QA checklist |

**Tests (node:test via `tsx --test`, `lib/**/*.test.ts` only)**: selection reducer (click/toggle/range/rectangle/pruning); Show only predicate; Keep policies (best match by matched-gene count, ties, source filter before Keep); species unit; group header windowing; URL round-trip; the two bug regressions. Component logic worth testing must live in pure `lib/` modules (as with `prefix-sheet.ts`). There is no Vitest, jsdom or React Testing Library in this package.

### Manual QA checklist (P7)

- [ ] Tab switch Distribution ↔ Annotations ↔ Compare does not refetch `/hits`
- [ ] Distribution: Show only → Annotations with list filters; Restrict search updates Scope
- [ ] Annotations: Keep / Group / Sort / search / Reset; counts show filtered (of total)
- [ ] Drawer: row open, Esc closes and restores focus; inline gene expand; Open↗
- [ ] Single-subject list pin → Compare tab; Clear → Undo restores pins
- [ ] Download TSV respects cap note; heatmap Export PNG/SVG/TSV
- [ ] Responsive: drawer full-width below `lg`; table usable on narrow viewports

---

## 13. Decisions and open questions

| # | Decision |
|---|---|
| D-1 | One query, three views (Distribution, Annotations, Compare); one `/hits` fetch; no refetch on tab switch. |
| D-2 | The query changes only in the query bar. |
| D-3 | Removing a gene is immediate with Undo; there is no separate "hide gene" concept. Review UI removed in P2; Prefix… with a bare stem seeds the sheet without committing. |
| D-4 | One Scope chip; "Restrict search to selected clades" from the heatmap uses the same path. |
| D-5 | Multi-selection (rows, columns, cells) exists to narrow the annotation list (**Show only**); it never leads to Compare. There is no Hide / exclude action. |
| D-6 | Selection works on the heatmap (clades, genes, cells) and in the Annotations table (annotations, genes). |
| D-7 | Distribution counts annotations or species via a toggle; Keep does not affect the heatmap. |
| D-8 | Keep policies: All, Best match per species (most matched genes, ties → newest, then id), Latest per (species × source). The user chooses the source through the Source filter, which runs first. |
| D-9 | Annotations has a species search as its first toolbar control. |
| D-10 | Sticky taxonomic group headers (labels, not folders); `Group: Auto` is off below 50 rows. |
| D-11 | Drawer is non-modal and one level; pin from the drawer, or from a row when there is exactly one subject gene. |
| D-12 | Compare is fed only from the Annotations view; no cap; longest transcript by default; plain list. |
| D-13 | The existing GFF transcript drawing (`GenesGeneDetail`, `GenesCompareTracks`) is kept unchanged. No GFF download button, no bulk GFF. |
| D-14 | The disabled "Annotation files (GFF)" menu item is removed; downloads act on the current filtered list. |
| D-15 | "nuccore fetch" is deferred. |

**Open questions**

None at the moment.

---

## 14. Backlog and known bugs

Source: `GENES PAGE.txt` at the repository root.

| Item | Type | Covered by | Notes |
|---|---|---|---|
| Download heatmap | Feature | P3 | §5.1 Export |
| GFF slice (transcript drawing from the GFF) | Exists | none | Kept unchanged (D-13) |
| Transcripts compare, longest by default | Feature | **Done in P6** | §7: uncapped pins, Clear Undo, Transcript mode |
| **Prefix add is not working** | Bug | **Fixed in P2** | `planOpenPrefix` + rewritten `openPrefix`: bare stem seeds only (no commit); `*` path commits exacts then opens. Covered by `gene-set.test.ts`. |
| **Filter reset is not working** | Bug | **Fixed in P4** | List Reset clears `listFilters`, sources, coverage, keep/group/sort/search, `excluded`, annotations selection; leaves `viewRank` / query / unit / pins. Heatmap uses `effectiveViewRank` so null store rank no longer writes `rank=kingdom`. Covered by `store.test.ts` / `url.test.ts`. |
| nuccore fetch | Feature (undefined) | Deferred (D-15) | See §15 |

**P0 baseline (recorded):** `npx tsc --noEmit` clean; `npm run lint` exits 0 (warns about ESLint 6.x and `output: export` rewrites); `npm test` → 2 pre-existing failures in `lib/api/annotations.test.ts` ("upload flow"), unrelated to genes. After P0: same 2 failures, plus new passing prefix/reset coverage and 3 todo-marked regressions.

---

## 15. Later / not planned

Not v1. Do not implement without an explicit decision.

- nuccore fetch (undefined; deferred).
- GFF download buttons and bulk GFF / manifest downloads (no bulk endpoint exists).
- Compare representatives or any shortcut from the heatmap to Compare.
- Compare extras: grouping, sticky headers, virtualization, lazy GFF queue.
- Selection of table cells and "pin selected" actions.
- Suggestion banner for large lists, legacy-URL mapping, pin persistence across sessions or in the URL.
