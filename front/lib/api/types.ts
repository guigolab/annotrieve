export interface SourceFileInfo {
  database: string
  provider: string
  release_date: string
  last_modified: string
  uncompressed_md5: string
}

export interface AssemblyStats {
  total_number_of_chromosomes: number
  total_sequence_length: string
  total_ungapped_length: string
  number_of_contigs: number
  contig_n50: number
  contig_l50: number
  number_of_scaffolds: number
  scaffold_n50: number
  scaffold_l50: number
  gaps_between_scaffolds_count: number
  number_of_component_sequences: number
  atgc_count: string
  gc_count: string
  gc_percent: number
  genome_coverage: string
  number_of_organelles: number
  number_of_plasmids: number
  number_of_chloroplasts: number
  number_of_mitochondria: number
}

export interface Pagination<T> {
  total: number
  offset: number
  limit: number
  results: T[]
}

export interface BuscoScore {
  busco_lineage?: string
  busco_version?: string
  total_count?: number
  complete?: number
  single_copy?: number
  duplicated?: number
  fragmented?: number
  missing?: number
}

export interface AnnotationRecord {
  md5_checksum?: string
  annotation_id: string
  name?: string
  organism_name?: string
  assembly_accession?: string
  assembly_name?: string
  taxid?: string
  busco?: BuscoScore
  source_file_info?: SourceFileInfo
  features_statistics?: {
    // New structure - primary fields to use
    gene_category_stats?: Record<string, {
      total_count?: number
      length_stats?: {
        min?: number
        max?: number
        mean?: number
      }
      biotype_counts?: Record<string, number>
      transcript_type_counts?: Record<string, number>
    }>
    transcript_type_stats?: Record<string, {
      total_count?: number
      length_stats?: {
        min?: number
        max?: number
        mean?: number
      }
      biotype_counts?: Record<string, number>
      associated_genes?: {
        total_count?: number
        gene_categories?: Record<string, number>
      }
      exon_stats?: {
        total_count?: number
        length?: {
          min?: number
          max?: number
          mean?: number
        }
        concatenated_length?: {
          min?: number
          max?: number
          mean?: number
        }
      }
      cds_stats?: {
        total_count?: number
        length?: {
          min?: number
          max?: number
          mean?: number
        }
        concatenated_length?: {
          min?: number
          max?: number
          mean?: number
        }
      }
    }>
    // Deprecated: Old fields kept for backwards compatibility only - do not use
    /** @deprecated Use gene_category_stats['coding'] instead */
    coding_genes?: {
      count?: number
      length_stats?: {
        min?: number
        max?: number
        mean?: number
        median?: number
      }
      transcripts?: {
        count?: number
        per_gene?: number
        types?: Record<string, any>
      }
      features?: {
        exons?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        cds?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        introns?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
      }
    }
    /** @deprecated Use gene_category_stats['non_coding'] instead */
    non_coding_genes?: {
      count?: number
      length_stats?: {
        min?: number
        max?: number
        mean?: number
        median?: number
      }
      transcripts?: {
        count?: number
        per_gene?: number
        types?: Record<string, any>
      }
      features?: {
        exons?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        cds?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        introns?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
      }
    }
    /** @deprecated Use gene_category_stats['pseudogene'] instead */
    pseudogenes?: {
      count?: number
      length_stats?: {
        min?: number
        max?: number
        mean?: number
        median?: number
      }
      transcripts?: {
        count?: number
        per_gene?: number
        types?: Record<string, any>
      }
      features?: {
        exons?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        cds?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
        introns?: {
          count?: number
          length_stats?: {
            mean?: number
            median?: number
          }
        }
      }
    }
  }
  [key: string]: unknown
}

export interface OrganismRecord {
  taxid: string
  organism_name?: string
  common_name?: string
  annotations_count?: number
  assemblies_count?: number
  [key: string]: unknown
}

export interface AssemblyRecord {
  assembly_accession: string
  assembly_name: string
  paired_assembly_accession?:string
  organism_name: string
  taxon_lineage?: string[]
  assembly_level?: string
  refseq_category?: string
  assembly_status?:string
  assembly_type?:string
  taxid: string
  annotations_count?: number
  assembly_stats?: AssemblyStats
  release_date?: string
  submitter?: string
  download_url?: string
  [key: string]: unknown
}

export interface TaxonRecord {
  taxid: string
  scientific_name?: string
  rank?: string
  organisms_count?: number
  annotations_count?: number
  assemblies_count?: number
  children?: TaxonRecord[]
  [key: string]: unknown
}

export interface BioProjectRecord {
  accession: string
  title: string
  assemblies_count?: number
  species_count?: number
  annotations_count?: number
  [key: string]: unknown
}
