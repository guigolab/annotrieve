"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface StatisticsInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function StatisticsInfoDialog({ open, onOpenChange }: StatisticsInfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>How Statistics Are Computed</DialogTitle>
          <DialogDescription>
            Understanding how genes are categorized in the GFF statistics
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold mb-2">How Statistics Are Computed</h4>
            <p className="text-muted-foreground mb-3">
              Statistics are computed in three sequential steps for each genomic region (seqid):
            </p>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground ml-2">
              <li>
                <span className="font-semibold text-foreground">Collect Exons and CDS:</span> First, we scan all exon and CDS features and group them by their parent transcript ID.
              </li>
              <li>
                <span className="font-semibold text-foreground">Collect Transcripts:</span> We identify all transcripts that have associated exons or CDS, recording their type, biotype, length, and linked gene.
              </li>
              <li>
                <span className="font-semibold text-foreground">Categorize Genes:</span> We analyze each gene based on its feature type, biotype, and whether it has transcripts with exons or CDS to assign it to a category.
              </li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Gene Categorization</h4>
            <p className="text-muted-foreground mb-3">
              Genes are automatically assigned to one of three categories based on their characteristics:
            </p>
            <ul className="space-y-2 list-disc list-inside text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">Pseudogenes:</span> Genes where the feature type is explicitly 'pseudogene'
              </li>
              <li>
                <span className="font-semibold text-foreground">Coding Genes:</span> Genes that have CDS segments in their transcripts, or have 'protein_coding' in their biotype
              </li>
              <li>
                <span className="font-semibold text-foreground">Non-coding Genes:</span> Genes that have exons in their transcripts but don't meet the criteria for pseudogenes or coding genes (includes tRNA, rRNA, lncRNA, miRNA, snRNA, etc.)
              </li>
            </ul>
            <p className="text-muted-foreground mt-3 text-xs italic">
              For each category, we compute: total gene count, length statistics (min, max, mean), biotype distribution, and transcript type distribution.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Transcript Statistics</h4>
            <p className="text-muted-foreground mb-3">
              For each transcript type (e.g., mRNA, ncRNA, tRNA), we aggregate statistics across all transcripts of that type:
            </p>
            <ul className="space-y-2 list-disc list-inside text-muted-foreground">
              <li>
                <span className="font-semibold text-foreground">Length Statistics:</span> Minimum, maximum, and mean transcript length
              </li>
              <li>
                <span className="font-semibold text-foreground">Biotype Distribution:</span> Count of transcripts by biotype (e.g., protein_coding, lncRNA)
              </li>
              <li>
                <span className="font-semibold text-foreground">Associated Genes:</span> Total unique genes and breakdown by gene category (coding, non-coding, pseudogene)
              </li>
              <li>
                <span className="font-semibold text-foreground">Exon Statistics:</span> Total exon count, individual exon lengths (min, max, mean), and concatenated exon length (sum of all exons per transcript)
              </li>
              <li>
                <span className="font-semibold text-foreground">CDS Statistics:</span> Total CDS count, individual CDS lengths, and concatenated CDS length (only for transcripts with CDS)
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

