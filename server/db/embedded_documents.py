from datetime import datetime
from mongoengine import (
    StringField,
    IntField,
    BooleanField,
    EmbeddedDocument,
    EmbeddedDocumentField,
    ListField,
    DateTimeField,
    URLField,
    FloatField,
    DictField,
    DynamicEmbeddedDocument
)

class AssemblyStats(EmbeddedDocument):
    
    total_number_of_chromosomes = IntField()
    total_sequence_length = StringField()
    total_ungapped_length = StringField()
    number_of_contigs = IntField()
    contig_n50 = IntField()
    contig_l50 = IntField()
    number_of_scaffolds = IntField()
    scaffold_n50 = IntField()
    scaffold_l50 = IntField()
    gaps_between_scaffolds_count = IntField()
    number_of_component_sequences = IntField()
    atgc_count = StringField()
    gc_count = StringField()
    gc_percent = IntField()
    genome_coverage = StringField()
    number_of_organelles = IntField()


class AssemblyReportBackfill(EmbeddedDocument):
    """Sync state for NCBI assembly_report → chromosomes.json on disk."""

    report_status = StringField(default="pending")  # pending | ok | failed
    report_fetched_at = DateTimeField()

    meta = {"strict": False}  # tolerate legacy fields e.g. sequence_stored_count


class BuscoScore(EmbeddedDocument):
    """
    This class is used to store the busco score of the assembly.
    """
    busco_lineage = StringField() #lineage of the busco genes (eukaryota_odb12, etc.)
    busco_version = StringField() #version of busco used
    total_count = IntField() #number of busco genes in the lineage
    complete = FloatField() #percentage of complete genes
    single_copy = FloatField() #percentage of single copy genes
    duplicated = FloatField() #percentage of duplicated genes
    fragmented = FloatField() #percentage of fragmented genes
    missing = FloatField() #percentage of missing genes


class PipelineInfo(EmbeddedDocument):
    name = StringField()
    version = StringField()
    method = StringField()

class SourceFileInfo(EmbeddedDocument):
    database = StringField(required=True)
    provider = StringField()
    release_date = DateTimeField(required=True)
    url_path = URLField(required=True, unique=True)
    last_modified = DateTimeField(required=True)
    uncompressed_md5 = StringField(required=True, unique=True) # 32-hex
    pipeline = EmbeddedDocumentField(PipelineInfo)

class IndexedFileInfo(EmbeddedDocument):
    bgzipped_path = StringField(required=True, unique=True)
    csi_path = StringField(required=True, unique=True)
    uncompressed_md5 = StringField(required=True, unique=True) # 32-hex
    file_size = IntField(required=True)
    processed_at = DateTimeField(default=datetime.now())
    pipeline = EmbeddedDocumentField(PipelineInfo)

class FeatureOverview(EmbeddedDocument):

    attribute_keys = ListField(StringField()) # Keys of the attributes of the features, e.g. ID, Parent, biotype, gene_biotype, transcript_biotype, gbkey, gene_id, transcript_id, exon_id
    types = ListField(StringField()) # Third column of GFF, e.g. gene, transcript, exon, etc.
    sources = ListField(StringField()) # Second column of GFF, e.g. RefSeq, Ensembl, etc.
    biotypes = ListField(StringField()) # Ninth column of GFF if present, e.g. protein_coding, etc.
    types_missing_id = ListField(StringField()) # Types of features that are present in features without an ID, e.g. gene, transcript, exon
    root_type_counts = DictField(field=IntField()) # Count of root-level feature types (features without Parent), e.g. {"gene": 1234, "lnc_RNA": 567}
    has_biotype = BooleanField() # Whether the GFF file has a biotype attr
    has_cds = BooleanField() # Whether the GFF file has a CDS feature
    has_exon = BooleanField() # Whether the GFF file has an exon feature
    
class GeneLengthStats(EmbeddedDocument):
    min = IntField()
    max = IntField()
    mean = FloatField()
    median = FloatField()

class GenericLengthStats(DynamicEmbeddedDocument):
    min = IntField()
    max = IntField()
    mean = FloatField()

class LengthStats(EmbeddedDocument):
    mean = FloatField()
    median = FloatField()

class TranscriptTypeStats(EmbeddedDocument):
    count = IntField()
    per_gene = FloatField()
    exons_per_transcript = FloatField()
    length_stats = EmbeddedDocumentField(LengthStats)
    spliced_length_stats = EmbeddedDocumentField(LengthStats)
    exon_length_stats = EmbeddedDocumentField(LengthStats)

class TranscriptStats(EmbeddedDocument):
    count = IntField()
    per_gene = FloatField()
    types = DictField(field=EmbeddedDocumentField(TranscriptTypeStats))

class FeatureTypeStats(EmbeddedDocument):
    count = IntField()
    length_stats = EmbeddedDocumentField(LengthStats)

class FeatureStats(EmbeddedDocument):
    exons = EmbeddedDocumentField(FeatureTypeStats)
    cds = EmbeddedDocumentField(FeatureTypeStats)
    introns = EmbeddedDocumentField(FeatureTypeStats)

class GeneStats(EmbeddedDocument):
    count = IntField()
    length_stats = EmbeddedDocumentField(GeneLengthStats)
    transcripts = EmbeddedDocumentField(TranscriptStats)
    features = EmbeddedDocumentField(FeatureStats)

class GeneCategoryFeatureStats(DynamicEmbeddedDocument):
    """
    This class is used to store the stats of a gene category feature.
    """
    total_count = IntField()
    length_stats = EmbeddedDocumentField(GenericLengthStats)
    biotype_counts = DictField(field=IntField())
    transcript_type_counts = DictField(field=IntField())

class SubFeatureStats(DynamicEmbeddedDocument):
    total_count = IntField()
    length = EmbeddedDocumentField(GenericLengthStats)
    concatenated_length = EmbeddedDocumentField(GenericLengthStats)

class AssociatedGenesStats(DynamicEmbeddedDocument):
    total_count = IntField()
    gene_categories = DictField(field=IntField())

class GenericTranscriptTypeStats(DynamicEmbeddedDocument):
    length_stats = EmbeddedDocumentField(GenericLengthStats)
    total_count = IntField()
    biotype_counts = DictField(field=IntField())
    associated_genes = EmbeddedDocumentField(AssociatedGenesStats)
    exon_stats = EmbeddedDocumentField(SubFeatureStats)
    cds_stats    = EmbeddedDocumentField(SubFeatureStats)

class GFFStats(DynamicEmbeddedDocument):
    #keep the old fields for backwards compatibility
    coding_genes = EmbeddedDocumentField(GeneStats)
    non_coding_genes = EmbeddedDocumentField(GeneStats)
    pseudogenes = EmbeddedDocumentField(GeneStats)

    #new fields
    gene_category_stats = DictField(field=EmbeddedDocumentField(GeneCategoryFeatureStats))
    transcript_type_stats = DictField(field=EmbeddedDocumentField(GenericTranscriptTypeStats))


class DistributionStats(EmbeddedDocument):
    mean = FloatField()
    median = FloatField()
    std = FloatField()
    min = FloatField()
    max = FloatField()
    n = IntField()

class TaxonGeneCategoryStats(EmbeddedDocument):
    count = EmbeddedDocumentField(DistributionStats)

class TaxonTranscriptTypeStats(EmbeddedDocument):
    count = EmbeddedDocumentField(DistributionStats)

class TaxonBuscoScore(EmbeddedDocument):
    """
    This class is used to store the busco distribution stats of the taxon.
    """
    single_copy = EmbeddedDocumentField(DistributionStats)
    duplicated = EmbeddedDocumentField(DistributionStats)
    fragmented = EmbeddedDocumentField(DistributionStats)
    missing = EmbeddedDocumentField(DistributionStats)
    complete = EmbeddedDocumentField(DistributionStats)
    busco_lineage = StringField()
    busco_version = StringField()
    total_count = IntField()


class TaxonGeneStats(EmbeddedDocument):
    # coding genes
    coding = EmbeddedDocumentField(TaxonGeneCategoryStats)
    # non-coding genes
    non_coding = EmbeddedDocumentField(TaxonGeneCategoryStats)
    # pseudogenes
    pseudogene = EmbeddedDocumentField(TaxonGeneCategoryStats)

class TranscriptTypeStats(EmbeddedDocument):
    """
    we hard code them (yes I know it's not ideal)
    """
    #messenger RNA
    mRNA = EmbeddedDocumentField(TaxonTranscriptTypeStats)
    #long non-coding transcripts
    lncRNA = EmbeddedDocumentField(TaxonTranscriptTypeStats)
    #small nuclear RNA
    tRNA = EmbeddedDocumentField(TaxonTranscriptTypeStats)
    #microRNA
    miRNA = EmbeddedDocumentField(TaxonTranscriptTypeStats)

class TaxonAnnotationStats(EmbeddedDocument):
    genes = EmbeddedDocumentField(TaxonGeneStats)
    transcripts = EmbeddedDocumentField(TranscriptTypeStats)
    busco = EmbeddedDocumentField(TaxonBuscoScore)