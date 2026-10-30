import { DATABASE_COLORS } from "@/lib/constants/annotation-sources"

/** Source toggle pills on the Genes filter bar. */
export const SOURCE_DEFS = [
  { code: 1, label: "Ensembl", color: DATABASE_COLORS.Ensembl },
  { code: 3, label: "RefSeq", color: DATABASE_COLORS.RefSeq },
  { code: 2, label: "GenBank", color: DATABASE_COLORS.GenBank },
] as const

/** Shared control height for Genes page chrome (matches Annotations desktop). */
export const GENES_CONTROL_H = "h-9"

/** Toggle chip aligned with FilterChip sizing. */
export const TOGGLE_CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** @deprecated Use TOGGLE_CHIP_CLASS */
export const PILL_CLASS = TOGGLE_CHIP_CLASS

/** Soft cap for client-side hits TSV download. */
export const GENES_TSV_DOWNLOAD_CAP = 10_000

/** Example gene sets shown on the empty landing state. */
export const EXAMPLE_GENE_SETS: { label: string; names: string[] }[] = [
  { label: "Cancer genes", names: ["TP53", "BRCA1", "EGFR"] },
  { label: "Housekeeping", names: ["GAPDH", "ACTB", "RPL13A"] },
  { label: "Selenoproteins", names: ["seleno*"] },
]
