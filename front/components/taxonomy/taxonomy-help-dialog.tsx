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
  BarChart2,
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
const shortBullet = "text-sm text-foreground leading-snug"

export function TaxonomyHelpDialog({ open, onOpenChange }: TaxonomyHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">How to use the Taxonomy Explorer</DialogTitle>
        </DialogHeader>

        {/* TL;DR */}
        <p className={cn(bodyText, "font-medium")}>
          Switch views, change root, filter by rank. Click any node → details open on the right.
        </p>

        {/* Top strip */}
        <h3 className={sectionTitle}>Top strip (drag to move)</h3>
        <ul className="space-y-1 list-none pl-0">
          <li className={listItem}>
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Handle</strong> — Drag to reposition.</span>
          </li>
          <li className={listItem}>
            <ChevronDown className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
            <span><strong>Root</strong> — Current taxon. Open for lineage, re-root, stats (genes/transcripts/BUSCO), or “View details”.</span>
          </li>
          <li className={listItem}>
            <LayoutDashboard className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Overview</strong> — Circle pack. Zoom/pan; click circle = details.</span>
          </li>
          <li className={listItem}>
            <Network className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Tree</strong> — Radial tree. Bottom strip picks category + labels.</span>
          </li>
          <li className={listItem}>
            <BarChart2 className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Top 50</strong> — Radial bar chart of top leaves by count or BUSCO. Bottom strip picks category.</span>
          </li>
          <li className={listItem}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Leaf rank</strong> — Show leaves down to e.g. genus. “All leaves” = no filter.</span>
          </li>
          <li className={listItem}>
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>View options</strong> — (Tree / Top 50) Gene types + “Show labels” in a popover.</span>
          </li>
          <li className={listItem}>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
            <span><strong>Search</strong> — By name; pick result = set root + open details.</span>
          </li>
        </ul>

        {/* Bottom strip */}
        <h3 className={sectionTitle}>Bottom strip (Tree & Top 50 only)</h3>
        <p className={cn(shortBullet, "text-muted-foreground mb-1")}>
          Bar at bottom center. One control set for both views.
        </p>
        <ul className="space-y-1 list-none pl-0 text-sm">
          <li className={shortBullet}><strong>Category</strong> — Genes / Transcripts / BUSCO. Drives what the bars and tooltips show.</li>
          <li className={shortBullet}><strong>Checkboxes</strong> — Which types in that category (e.g. Coding, Non-cod, Pseudo for Genes).</li>
          <li className={shortBullet}><strong>Show labels</strong> — Toggle taxon names on the chart.</li>
        </ul>

        {/* What the stats are */}
        <h3 className={sectionTitle}>What the stats are</h3>
        <p className={cn(shortBullet, "text-muted-foreground mb-1")}>
          All values are <strong>mean counts</strong> over the annotations under each taxon.
        </p>
        <ul className="space-y-1 list-none pl-0 text-sm text-muted-foreground">
          <li className={shortBullet}><strong>Genes</strong> — Coding, non-coding, pseudogene.</li>
          <li className={shortBullet}><strong>Transcripts</strong> — A few types only: mRNA, lncRNA, tRNA, miRNA.</li>
          <li className={shortBullet}><strong>BUSCO</strong> — From <strong>eukaryota_odb12</strong> (C+S, C+D, F, M).</li>
        </ul>

        {/* Visualizations (short) */}
        <h3 className={sectionTitle}>Views in one line</h3>
        <ul className="space-y-0.5 list-none pl-0 text-sm">
          <li className={shortBullet}><LayoutDashboard className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" aria-hidden /><strong>Overview</strong> — Nested circles; zoom/pan; click = details.</li>
          <li className={shortBullet}><Network className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" aria-hidden /><strong>Tree</strong> — Radial; fixed branch length; optional labels. Big trees → may suggest Overview.</li>
          <li className={shortBullet}><BarChart2 className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" aria-hidden /><strong>Top 50</strong> — One wedge per leaf; segments = Genes / Transcripts / BUSCO (from bottom strip). Compare and spot outliers.</li>
        </ul>

        {/* Rank filter */}
        <h3 className={sectionTitle}>Leaf rank</h3>
        <p className={cn(shortBullet, "text-muted-foreground")}>
          Limits which rank appears as leaves (e.g. genus only). Change root above that rank → filter resets (toast).
        </p>

        {/* Details panel */}
        <h3 className={sectionTitle}>Details panel (click a node)</h3>
        <ul className="space-y-0.5 list-disc pl-5 text-sm">
          <li className={shortBullet}><strong>Navigate</strong> — Parent/children; click to change selection.</li>
          <li className={shortBullet}><strong>Identity</strong> — Name, rank, TaxID; links to full details & annotations.</li>
          <li className={shortBullet}><Compass className="h-3 w-3 inline mr-1 align-middle" aria-hidden /><strong>Explore lineage</strong> — Set as new root.</li>
          <li className={shortBullet}>Record counts + <strong>Genes / Transcripts / BUSCO</strong> (same categories as bottom strip).</li>
          <li className={shortBullet}>Full path + wiki summary. Close with <X className="h-3 w-3 inline align-middle mx-0.5" aria-hidden />.</li>
        </ul>

        {/* Flow */}
        <h3 className={sectionTitle}>Quick flow</h3>
        <ol className="list-decimal pl-5 space-y-0.5 text-sm">
          <li className={shortBullet}>Pick root (dropdown or search).</li>
          <li className={shortBullet}>Switch tab: Overview / Tree / Top 50.</li>
          <li className={shortBullet}>(Tree or Top 50) Pick category + types in bottom strip.</li>
          <li className={shortBullet}>Click node → details; “Explore lineage” to drill; breadcrumb in root dropdown to go back.</li>
        </ol>
      </DialogContent>
    </Dialog>
  )
}
