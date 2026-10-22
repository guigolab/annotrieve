/**
 * Gene category palette shared with the annotation overview cards
 * (coding = primary cyan, non-coding = secondary amber, pseudogene = accent purple).
 */

export type GeneCategory = "coding" | "non_coding" | "pseudogene"

export interface GeneCategoryInput {
  feature_type?: string | null
  biotype?: string | null
  /** True when the gene / transcript has at least one CDS feature. */
  hasCds?: boolean
}

export interface GeneCategoryStyle {
  label: string
  /** Short chip label. */
  shortLabel: string
  /** CSS color for SVG stroke/fill: `var(--primary)` etc. */
  token: string
  textClass: string
  bgClass: string
  borderClass: string
}

export const GENE_CATEGORY_STYLE: Record<GeneCategory, GeneCategoryStyle> = {
  coding: {
    label: "Coding",
    shortLabel: "coding",
    token: "var(--primary)",
    textClass: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary",
  },
  non_coding: {
    label: "Non-coding",
    shortLabel: "non-coding",
    token: "var(--secondary)",
    textClass: "text-secondary",
    bgClass: "bg-secondary/10",
    borderClass: "border-secondary",
  },
  pseudogene: {
    label: "Pseudogene",
    shortLabel: "pseudo",
    token: "var(--accent)",
    textClass: "text-accent",
    bgClass: "bg-accent/10",
    borderClass: "border-accent",
  },
}

function includesPseudo(value: string | null | undefined): boolean {
  return Boolean(value && /pseudo/i.test(value))
}

/**
 * Classify a gene or transcript the same way as the overview statistics:
 * 1. Pseudogene when feature type or biotype mentions "pseudo"
 * 2. Coding when there is CDS or biotype is protein_coding
 * 3. Otherwise non-coding
 */
export function geneCategoryOf(input: GeneCategoryInput): GeneCategory {
  const { feature_type, biotype, hasCds } = input
  if (includesPseudo(feature_type) || includesPseudo(biotype)) {
    return "pseudogene"
  }
  if (hasCds || (biotype && /protein_coding/i.test(biotype))) {
    return "coding"
  }
  return "non_coding"
}

/** Theme-safe SVG tint via color-mix (never wrap oklch tokens in hsl()). */
export function categoryTint(token: string, percent: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)))
  return `color-mix(in oklch, ${token} ${pct}%, transparent)`
}
