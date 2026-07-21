export const DATABASE_NAMES = ["GenBank", "Ensembl", "RefSeq", "CommunityRegistry"] as const

export type DatabaseName = (typeof DATABASE_NAMES)[number]

export const DATABASE_COLORS: Record<DatabaseName, string> = {
  Ensembl: "#6366f1",
  RefSeq: "#10b981",
  GenBank: "#f59e0b",
  CommunityRegistry: "#0d9488",
}

export const DATABASE_INFO: Record<
  DatabaseName,
  {
    description: string
    color: string
    bgColor: string
    downloadUrl: string
  }
> = {
  Ensembl: {
    description: "Rapid release and curated annotations",
    color: DATABASE_COLORS.Ensembl,
    bgColor: "bg-indigo-500/10",
    downloadUrl:
      "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/ensembl_annotations.tsv",
  },
  RefSeq: {
    description: "Curated high-quality annotations",
    color: DATABASE_COLORS.RefSeq,
    bgColor: "bg-emerald-500/10",
    downloadUrl:
      "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/refseq_annotations.tsv",
  },
  GenBank: {
    description: "Community submitted annotations",
    color: DATABASE_COLORS.GenBank,
    bgColor: "bg-amber-500/10",
    downloadUrl:
      "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/genbank_annotations.tsv",
  },
  CommunityRegistry: {
    description: "Third-party pipelines and labs, submitted via GitHub",
    color: DATABASE_COLORS.CommunityRegistry,
    bgColor: "bg-teal-500/10",
    downloadUrl:
      "https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/community_annotations.tsv",
  },
}
