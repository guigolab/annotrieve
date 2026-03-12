"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  LayoutDashboard,
  Network,
  AlertTriangle,
  GripVertical,
  ChevronDown,
  SlidersHorizontal,
  BookOpen,
  Search,
  Compass,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TaxonomyHelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const sectionTitle =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-1.5 first:mt-0"
const bodyText = "text-sm text-foreground leading-relaxed"
const listItem = "text-sm text-foreground leading-snug flex items-start gap-2"

export function TaxonomyHelpDialog({ open, onOpenChange }: TaxonomyHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">How to use the Taxonomy Explorer</DialogTitle>
        </DialogHeader>

        <p className={bodyText}>
          Explore the taxonomic tree: switch views, change the root node, filter by rank, and search.
          Click a node in any visualization to open its details in the side panel.
        </p>

        {/* Floating strip */}
        <h3 className={sectionTitle}>Floating control strip</h3>
        <p className={bodyText}>
          The strip at the top center holds all main controls. You can drag it by the grip handle to move it.
        </p>
        <ul className="space-y-1.5 list-none pl-0">
          <li className={listItem}>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Drag handle</strong> — Click and drag to reposition the strip anywhere on the canvas.</span>
          </li>
          <li className={listItem}>
            <ChevronDown className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
            <span><strong>Root dropdown</strong> — Shows the current root taxon. Open it to see the lineage (breadcrumb), re-root by clicking an ancestor, view root stats (rank, record and gene counts), or open the details panel for the root.</span>
          </li>
          <li className={listItem}>
            <span className="flex items-center gap-1.5 shrink-0">
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-medium">Overview</span>
            </span>
            <span><strong>Overview tab</strong> — Circle-pack view of the tree: nested circles by hierarchy. Zoom and pan; click a circle to select and open details.</span>
          </li>
          <li className={listItem}>
            <span className="flex items-center gap-1.5 shrink-0">
              <Network className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-medium">Tree</span>
            </span>
            <span><strong>Tree tab</strong> — Radial tree with constant-length branches. Good for structure; supports “Show labels” and gene-type toggles in view options.</span>
          </li>
          <li className={listItem}>
            <span className="flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-xs font-medium">Outliers</span>
            </span>
            <span><strong>Outliers tab</strong> — Stacked radial bar chart of leaf taxa: compares coding / non-coding / pseudogene counts to spot outliers. Use view options to toggle gene types and labels.</span>
          </li>
          <li className={listItem}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Leaf rank</strong> — Filter which rank is shown as “leaves” in the tree (e.g. show down to genus). Opens the rank list; “All leaves” shows every leaf under the root.</span>
          </li>
          <li className={listItem}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>View options</strong> — (Tree and Outliers only) Toggle coding / non-coding / pseudogene and “Show labels”.</span>
          </li>
          <li className={listItem}>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Search</strong> — Type to search taxa by name; pick a result to set it as root and open its details.</span>
          </li>
        </ul>

        {/* Visualizations */}
        <h3 className={sectionTitle}>Visualizations</h3>
        <ul className="space-y-2 list-none pl-0">
          <li>
            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", listItem)}>
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
              Overview (circle pack)
            </span>
            <p className="text-sm text-muted-foreground pl-6 mt-0.5">
              Nested circles: each circle is a taxon; children are drawn inside the parent. Size can reflect count. Use mouse wheel to zoom, drag to pan. Click a circle to select and open the details panel.
            </p>
          </li>
          <li>
            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", listItem)}>
              <Network className="h-4 w-4 shrink-0" aria-hidden />
              Tree (radial, constant branch)
            </span>
            <p className="text-sm text-muted-foreground pl-6 mt-0.5">
              Radial layout with fixed branch length. Shows hierarchy from root at center. Optional labels and gene-type colors. For large trees a warning may suggest switching to Overview for performance.
            </p>
          </li>
          <li>
            <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", listItem)}>
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              Outliers (stacked radial bar)
            </span>
            <p className="text-sm text-muted-foreground pl-6 mt-0.5">
              One wedge per leaf taxon; segments show coding / non-coding / pseudogene counts. Helps compare composition and spot outliers. Use view options to show/hide gene types.
            </p>
          </li>
        </ul>

        {/* Rank filter */}
        <h3 className={sectionTitle}>Rank filter (leaf rank)</h3>
        <p className={bodyText}>
          The rank control limits which rank is shown as “leaves” in the tree (e.g. only genus-level nodes as leaves). Ranks below the current root are listed with counts; choose one or “All leaves”. If you change the root to a rank above the selected one, the filter resets and a toast explains.
        </p>

        {/* Details panel */}
        <h3 className={sectionTitle}>Details panel</h3>
        <p className={bodyText}>
          When you click a node, a panel opens on the right with:
        </p>
        <ul className="space-y-1 list-disc pl-5 text-sm text-foreground">
          <li><strong>Navigate</strong> — Parent and children of the selected taxon; click to change selection.</li>
          <li><strong>Identity</strong> — Name, rank, TaxID; links to full details and annotations.</li>
          <li>
            <span className="inline-flex items-center gap-1">
              <Compass className="h-3.5 w-3.5" aria-hidden />
              <strong>Explore lineage</strong>
            </span>
            {" "}— Set this taxon as the new root and focus the tree on its lineage.
          </li>
          <li>Record counts (annotations, assemblies, organisms) and gene counts (coding, non-coding, pseudogene).</li>
          <li>Full path (ancestors) and a short wiki summary when available.</li>
        </ul>
        <p className={cn(bodyText, "mt-1.5")}>
          Use the <X className="h-3.5 w-3.5 inline align-middle mx-0.5" aria-hidden /> button in the panel header to close it.
        </p>

        {/* User flow */}
        <h3 className={sectionTitle}>Typical flow</h3>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-foreground">
          <li>Start from the default root (e.g. Eukaryota). Use the root dropdown or search to change root.</li>
          <li>Switch tabs (Overview, Tree, Outliers) to compare views.</li>
          <li>Optionally set a leaf rank filter so only that rank appears as leaves.</li>
          <li>Click a node in any viz to open the details panel; use “Explore lineage” to drill in, or pick parent/child in Navigate.</li>
          <li>Use the breadcrumb in the root dropdown to jump back to an ancestor as root.</li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}
