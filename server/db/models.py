from datetime import datetime
from .embedded_documents import (
    AssemblyStats,
    AssemblyReportBackfill,
    SourceFileInfo,
    IndexedFileInfo,
    FeatureOverview,
    GFFStats,
    TaxonAnnotationStats,
    BuscoScore,
)
from mongoengine import (
    Document,
    DynamicDocument,
    StringField,
    ListField,
    IntField,
    BooleanField,
    EmbeddedDocumentField,
    URLField,
    DateTimeField,
)


def drop_all_collections():
    GenomeAssembly.objects().delete()
    Organism.objects().delete()
    AnnotationSequenceMap.objects().delete()
    GenomicSequence.objects().delete()
    AnnotationError.objects().delete()
    GenomeAnnotation.objects().delete()
    TaxonNode.objects().delete()
    BioProject.objects().delete()


class GenomeAssembly(DynamicDocument):
    assembly_accession = StringField(required=True, unique=True)
    paired_assembly_accession = StringField() #if the assembly is a pair, the accession of the paired assembly
    assembly_name = StringField(required=True)
    source_database = StringField() #GenBank (INSDC), RefSeq
    assembly_level = StringField() #chromosome, contig, scaffold, complete genome, etc.
    assembly_status = StringField() #current, suppressed.
    assembly_type = StringField() #haploid etc.
    refseq_category = StringField() #reference genome, etc.
    taxid = StringField(required=True)
    organism_name = StringField(required=True)
    taxon_lineage = ListField(StringField()) #ordered list of taxonomic ranks from the organism to the root
    assembly_stats = EmbeddedDocumentField(AssemblyStats)
    release_date = DateTimeField()
    bioprojects = ListField(StringField()) #list of bioprojects
    submitter = StringField()
    annotations_count = IntField()
    ncbi_ftp_directory_url = URLField()
    download_url = URLField(required=True, unique=True)
    assembly_report = EmbeddedDocumentField(
        AssemblyReportBackfill, default=AssemblyReportBackfill
    )
    meta = {
        'indexes': [
            "assembly_accession", 
            "source_database",
            "taxid",
            "organism_name",
            "taxon_lineage",
            "bioprojects",
            "assembly_level",
            "assembly_status",
            "refseq_category",
        ],
    }


class UserAnalytics(DynamicDocument):
    fingerprint = StringField(required=True, unique=True) #hmac of the user's IP address to ensure full anonymity
    country = StringField(required=True)
    first_visit = DateTimeField()
    last_visit = DateTimeField()
    visits_count = IntField()
    meta = {
        'indexes': [
            'country',
            'fingerprint',
            'first_visit',
            'last_visit',
        ]
    }
    def parse_iso_date(iso_date: str) -> datetime:
        """
        Parse an ISO date string to a datetime object
        """
        return datetime.fromisoformat(iso_date)

    def to_iso_date(self, date: datetime) -> str:
        """
        Convert a datetime object to an ISO date string
        """
        return date.isoformat().split('T')[0]


class UploadRateLimit(DynamicDocument):
    """
    Track upload requests per client (IP + User-Agent) to enforce per-day limits.
    Documents are short-lived thanks to a TTL index on created_at.
    """

    ip = StringField(required=True)
    user_agent = StringField(required=True)
    created_at = DateTimeField(default=datetime.utcnow)
    task_id = StringField()

    meta = {
        "indexes": [
            ("ip", "user_agent"),
            {
                "fields": ["created_at"],
                # 48h TTL – application logic enforces a rolling 24h window
                "expireAfterSeconds": 60 * 60 * 48,
            },
        ]
    }


class BioProject(DynamicDocument):
    accession = StringField(required=True, unique=True)
    title = StringField(required=True)
    assemblies_count = IntField()
    meta = {
        'indexes': [
            'accession',
            'title',
        ]
    }


class Organism(DynamicDocument):
    taxid = StringField(required=True, unique=True)
    organism_name = StringField(required=True)
    common_name = StringField()
    taxon_lineage = ListField(StringField())
    annotations_count = IntField()
    assemblies_count = IntField()
    meta = {
        'indexes': [
            'taxid', 
            'organism_name', 
            'taxon_lineage', 
            'common_name',
            ]
    }


# Deprecated: per-annotation seqids live in {gff}.contigs.txt on disk.
class AnnotationSequenceMap(DynamicDocument):
    sequence_id = StringField(required=True) #id in the gff file
    annotation_id = StringField(required=True) #indexed_file_info.uncompressed_md5 of the annotation
    aliases = ListField(StringField()) #aliases for the sequence_id, e.g. chr1, 1, 1_1, 1_1_1,ucsc_style_name, refseq_accession, insdc_accession, etc.
    feature_count = IntField(default=0)
    length = IntField()
    canonical_id = StringField()
    meta = {
        'indexes': [
            'annotation_id',
            'sequence_id',
            'aliases',
            'canonical_id',
        ]
    }

# Deprecated: assembly chromosomes live in chromosomes.json on disk.
class GenomicSequence(DynamicDocument):
    #ASSEMBLY
    assembly_accession = StringField(required=True)
    assembly_name = StringField(required=True)

    ucsc_style_name = StringField()
    genbank_accession = StringField()
    refseq_accession = StringField()
    canonical_id = StringField()

    chr_name = StringField()
    sequence_role = StringField()
    sequence_name = StringField()
    length = IntField()

    aliases = ListField(StringField(), required=True) #all possible aliases for the chromosome
    meta = {
        'indexes': ['assembly_accession', 'aliases', 'canonical_id', 'chr_name', 'sequence_name', 'sequence_role']
    }

class AnnotationError(DynamicDocument):
    """
    This document is used to store errors that occur when processing the annotation files.
    It is used to track the errors and to help with debugging.
    """
    assembly_accession = StringField(required=True)
    taxid = StringField(required=True)
    organism_name = StringField(required=True)
    error_message = StringField(required=True)
    url_path = StringField(required=True, unique=True)
    source_md5 = StringField(required=True, unique=True) # 32-hex
    release_date = DateTimeField(required=True)
    last_modified = DateTimeField(required=True)
    source_database = StringField(required=True)
    created_at = DateTimeField(default=datetime.now())
    meta = {
        'indexes': ['assembly_accession', 'taxid', 'organism_name', 'uri_path', 'source_md5', 'source_database'],
        'ordering': ['-created_at']
    }

class GenomeAnnotation(DynamicDocument):

    annotation_id = StringField(required=True, unique=True) #indexed_file_info.uncompressed_md5
    #ASSEMBLY
    assembly_accession = StringField(required=True)
    assembly_name = StringField(required=True)

    #TAXONOMY
    organism_name = StringField(required=True)
    taxid = StringField(required=True)
    taxon_lineage = ListField(StringField(), required=True)

    #BUSCO SCORE
    busco = EmbeddedDocumentField(BuscoScore)

    #MAPPED REGIONS
    mapped_regions = ListField(StringField())  # Deprecated; use AnnotationSequenceMap collection

    #SOURCE
    source_file_info = EmbeddedDocumentField(SourceFileInfo)

    #INDEXED FILE
    indexed_file_info = EmbeddedDocumentField(IndexedFileInfo)

    #FEATURE OVERVIEW
    features_summary = EmbeddedDocumentField(FeatureOverview)

    #FEATURE STATISTICS gene and transcript types
    features_statistics = EmbeddedDocumentField(GFFStats)

    # Time
    meta = {
        "indexes": [
            "annotation_id",
            "organism_name",
            "taxid",
            "assembly_accession",
            "assembly_name",
            "taxon_lineage",
            "features_summary.sources",
            "features_summary.types",
            "features_summary.biotypes",
            "source_file_info.database",
            "source_file_info.provider",
            "source_file_info.release_date",
            "source_file_info.last_modified",
            "source_file_info.pipeline.name",
            "busco.complete",
            "busco.single_copy",
            "busco.duplicated",
            "busco.fragmented",
            "busco.missing",  
        ]
    }
    def parse_iso_date(iso_date: str) -> datetime:
        """
        Parse an ISO date string to a datetime object
        """
        return datetime.fromisoformat(iso_date)

class TaxonNode(Document):
    children = ListField(StringField())
    parent_id = StringField()
    scientific_name = StringField(required=True)
    taxid = StringField(required= True,unique=True)
    rank = StringField()
    assemblies_count = IntField()
    annotations_count = IntField()
    organisms_count = IntField() #how many leaves under this node
    stats = EmbeddedDocumentField(TaxonAnnotationStats)
    meta = {
        'indexes': [
            'taxid', 'scientific_name', 'children', 'parent_id', 'rank'
        ]
    }
