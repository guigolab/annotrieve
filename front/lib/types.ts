export type FilterType = "taxon" | "organism" | "assembly" | null

export interface FilterOption {
  value: string
  label: string
  count: number
  subtitle?: string
}

export interface TaxonNode {
  id: string
  name: string
  rank: string
  scientificName: string
  commonName?: string
  description: string
  annotationCount: number
  children?: TaxonNode[]
}

export interface Chromosome {
  chr_name: string
  length: number
  genbank_accession?: string
  refseq_accession?: string
  sequence_name?: string
  aliases: string[]
}


export interface CommonSearchResult<T = any> {
  id: string
  modelKey: string
  label: string
  title: string
  subtitle?: string
  meta?: string
  data: T
}
export interface Organism {
  id: string
  scientificName: string
  commonName?: string
  taxonId: string
  taxonName: string
  description: string
  assemblies: string[]
  annotationCount: number
}

export interface Assembly {
  id: string
  name: string
  accession: string
  organismId: string
  organismName: string
  level: string
  releaseDate: string
  submitter: string
  description: string
  annotationCount: number
}

export interface FeaturesSummary {
  root_type_counts: Record<string, number>
  attribute_keys: string[]
  types: string[]
  sources: string[]
  biotypes: string[]
  root_types: string[]
  types_missing_id: string[]
  has_biotype: boolean
  has_cds: boolean
  has_exon: boolean
}

export interface FeaturesStatistics {
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

export interface AnnotationBase {
  annotation_id: string
  features_summary: FeaturesSummary
  features_statistics?: FeaturesStatistics
}

export interface PortalAnnotation extends AnnotationBase {
  kind: "portal"
  taxid: string
  taxon_lineage: string[]
  organism_name: string
  assembly_accession: string
  assembly_name: string
  busco?: {
    busco_lineage?: string
    busco_version?: string
    total_count?: number
    complete?: number
    single_copy?: number
    duplicated?: number
    fragmented?: number
    missing?: number
  }
  source_file_info: {
    database: string
    provider: string
    last_modified: string
    uncompressed_md5: string
    pipeline: {
      name: string
      version: string
      method: string
    }
    release_date: string
    source_database: "GenBank" | "RefSeq" | "Ensembl" | "CommunityRegistry"
  }
  indexed_file_info: {
    file_size: number
    bgzipped_path: string
    csi_path: string
    uncompressed_md5: string
    processed_at: string
    pipeline: {
      name: string
      version: string
      method: string
    }
  }
}

export interface CustomAnnotation extends AnnotationBase {
  kind: "custom"
  custom_name: string
  uploaded_md5: string
  uploaded_at: string
  uploaded_file_size: number
}

export type Annotation = PortalAnnotation | CustomAnnotation

export interface SearchResult {
  type: "taxon" | "organism" | "assembly"
  id: string
  name: string
  subtitle: string
  annotationCount: number
  relatedObject: Record<string, any>
}
