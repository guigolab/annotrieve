import type { TaxonRecord } from "@/lib/api/types"
import type { FlatTreeNode } from "@/lib/api/taxons"

export type ViewTab = "overview" | "tree" | "constant-branch" | "gene-stack"

export type FeatureType = "coding" | "non_coding" | "pseudogene" | "mrna" | "lncrna"

export const FEATURE_COLORS: Record<FeatureType, string> = {
  coding:    "#3b82f6",
  non_coding: "#10b981",
  pseudogene: "#f59e0b",
  mrna:      "#8b5cf6",
  lncrna:    "#ec4899",
}

export const FEATURE_LABELS: Record<FeatureType, string> = {
  coding:    "Coding",
  non_coding: "Non-coding",
  pseudogene: "Pseudogene",
  mrna:      "mRNA",
  lncrna:    "lncRNA",
}

export interface TaxonomyPayload {
  taxid: string
  taxon: TaxonRecord
}

/** Emitted by every chart component on a single-click with viewport-relative coordinates. */
export interface NodeClickEvent {
  taxid: string
  node: FlatTreeNode
  screenX: number
  screenY: number
}

/**
 * Tailwind class string for floating overlay pills and panels.
 * Transparent background so the viz shows through; backdrop-blur keeps text readable.
 */
export const GLASS_CLASSNAME =
  "bg-transparent backdrop-blur-[10px] border border-border"

/** Glass container with standard shape and shadow for floating bar elements */
export const GLASS_PANEL =
  GLASS_CLASSNAME + " rounded-lg shadow-sm"

/** Shared padding for floating panels (compact but usable) */
export const GLASS_PANEL_PADDING = "p-2"

/** Trigger button on the floating bar (e.g. Features, Leaf rank) */
export const GLASS_TRIGGER =
  GLASS_PANEL + " flex items-center gap-2 px-3 py-[5px] text-xs text-muted-foreground hover:text-foreground transition-colors"

/** Dropdown panel under a trigger; add left-0 or right-0 for alignment */
export const GLASS_DROPDOWN =
  GLASS_CLASSNAME + " absolute top-full mt-1.5 rounded-lg p-1.5 w-44 z-50 shadow-lg"

/** Item inside a taxonomy dropdown (menu row) */
export const TAXONOMY_MENU_ITEM_BASE =
  "flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-xs w-full text-left transition-colors hover:bg-muted"

/** Muted icon/close button used in taxonomy UI */
export const TAXONOMY_ICON_BTN =
  "shrink-0 text-muted-foreground hover:text-foreground transition-colors"

/** Muted text that highlights on hover (e.g. breadcrumb links) */
export const TAXONOMY_LINK_MUTED =
  "text-muted-foreground hover:text-foreground transition-colors"

/** Current root pill in the floating bar (primary accent, not glass) */
export const ROOT_PILL =
  "root-pill-pulse flex items-center gap-2 rounded-lg text-sm px-3 py-[5px] font-semibold shadow-sm border border-primary/60 text-primary bg-primary/10 hover:bg-primary/15 transition-colors truncate max-w-[200px]"

/** @deprecated Use GLASS_CLASSNAME instead */
export const GLASS_STYLE: import("react").CSSProperties = {}

/** Threshold above which the radial tree shows a performance warning (leaf count at selected rank). */
export const LARGE_TAXON_THRESHOLD = 2000

/** Hex color for taxonomy node highlight/hover (selected, hover). Use for canvas and inline styles. */
export const TAXONOMY_HIGHLIGHT_COLOR = {
  dark: "#fbbf24",
  light: "#f59e0b",
} as const

/** Returns the dominant feature color for a FlatTreeNode. */
export function dominantFeatureColor(
  coding: number,
  nonCoding: number,
  pseudogene: number,
  fallback = "#475569"
): string {
  const max = Math.max(coding, nonCoding, pseudogene)
  if (max === 0) return fallback
  if (max === coding)    return FEATURE_COLORS.coding
  if (max === nonCoding) return FEATURE_COLORS.non_coding
  return FEATURE_COLORS.pseudogene
}
