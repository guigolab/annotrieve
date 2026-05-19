from array import array
from db.models import GenomeAnnotation, AnnotationError, Organism, TaxonNode, GenomicSequence, GenomeAssembly   
from db.embedded_documents import SourceFileInfo, PipelineInfo, AssemblyStats, BuscoScore
import re

class AnnotationToProcess:
    """
    This class is used to map the incoming annotation data to the GenomeAnnotation model
    """
    def __init__(
        self, 
        **kwargs
    ):
        self.source_database = kwargs.get('source_database')
        self.annotation_provider = kwargs.get('annotation_provider')
        self.release_date = kwargs.get('release_date')
        self.last_modified = kwargs.get('last_modified_date')
        self.md5_checksum = kwargs.get('md5_checksum')
        self.access_url = kwargs.get('access_url')
        self.taxon_id = kwargs.get('taxon_id')
        self.organism_name = kwargs.get('organism_name')
        self.pipeline_name = kwargs.get('pipeline_name')
        self.pipeline_version = kwargs.get('pipeline_version')
        self.pipeline_method = kwargs.get('pipeline_method')
        self.assembly_accession = kwargs.get('assembly_accession')
        self.assembly_name = kwargs.get('assembly_name')

    def to_genome_annotation(self, **kwargs) -> GenomeAnnotation:
        """
        Convert the AnnotationToProcess object to a GenomeAnnotation document
        """
        source_info = SourceFileInfo(
            database=self.source_database,
            provider=self.annotation_provider,
            release_date=GenomeAnnotation.parse_iso_date(self.release_date),
            url_path=self.access_url,
            last_modified=GenomeAnnotation.parse_iso_date(self.last_modified),
            uncompressed_md5=self.md5_checksum,
        )
        if self.pipeline_name:
            source_info.pipeline = PipelineInfo(
                name=self.pipeline_name,
                version=self.pipeline_version,
                method=self.pipeline_method,
            )
        return GenomeAnnotation(
                assembly_accession=self.assembly_accession,
                assembly_name=self.assembly_name,
                taxid=self.taxon_id,
                organism_name=self.organism_name,
                source_file_info=source_info,
                **kwargs
            )     

    def to_annotation_error(self, error_message: str) -> AnnotationError:
        """
        Convert the AnnotationToProcess object to an AnnotationError document
        """
        return AnnotationError(
            assembly_accession=self.assembly_accession,
            taxid=self.taxon_id,
            organism_name=self.organism_name,
            error_message=error_message,
            url_path=self.access_url,
            source_md5=self.md5_checksum,
            release_date=self.release_date,
            last_modified=self.last_modified,
            source_database=self.source_database,
        )


class OrganismToProcess:
    """
    This class is used to map the incoming organism data to the Organism model
    """
    def __init__(
        self, 
        taxid: str,
        organism_name: str,
        common_name: str,
        taxon_lineage: list[str],
        parsed_taxon_lineage: list[TaxonNode],
    ):
        self.taxon_id = taxid
        self.organism_name = organism_name
        self.common_name = common_name
        self.taxon_lineage = taxon_lineage  
        self.parsed_taxon_lineage = parsed_taxon_lineage

    def to_organism(self) -> Organism:
        """
        Convert the OrganismToProcess object to an Organism document
        """
        return Organism(
            taxid=self.taxon_id,
            organism_name=self.organism_name,
            common_name=self.common_name,
            taxon_lineage=self.taxon_lineage
        )


def genomic_sequence_canonical_id(
    genbank_accession: str | None,
    refseq_accession: str | None,
) -> str | None:
    """
    Stable cross-collection id: genbank, refseq, or 'genbank|refseq' when both are set.
    """
    gb = (genbank_accession or "").strip()
    rs = (refseq_accession or "").strip()
    if gb and rs:
        return f"{gb}|{rs}"
    if gb:
        return gb
    if rs:
        return rs
    return None


def genomic_sequence_canonical_id_from_doc(doc: GenomicSequence) -> str | None:
    if getattr(doc, "canonical_id", None):
        return doc.canonical_id
    return genomic_sequence_canonical_id(
        doc.genbank_accession, doc.refseq_accession
    )


class AssemblyReportSequence:
    """
    This class is used to map the incoming assembly report sequence data to the GenomicSequence model
    """
    def __init__(
        self,
        chr_name: str,
        sequence_name: str,
        genbank_accn: str,
        refseq_accn: str,
        sequence_length: int,
        ucsc_style_name: str,
        sequence_role: str = "",
    ):
        self.chr_name = chr_name
        self.sequence_name = sequence_name
        self.genbank_accn = genbank_accn
        self.refseq_accn = refseq_accn
        self.sequence_length = sequence_length
        self.ucsc_style_name = ucsc_style_name
        self.sequence_role = sequence_role

    def to_genomic_sequence(self, assembly_accession: str, assembly_name: str) -> GenomicSequence:
        """
        Convert the AssemblyReportSequence object to a GenomicSequence document
        """
        return GenomicSequence(
            assembly_accession=assembly_accession,
            assembly_name=assembly_name,
            sequence_name=self.sequence_name,
            chr_name=self.chr_name,
            sequence_role=self.sequence_role,
            genbank_accession=self.genbank_accn,
            refseq_accession=self.refseq_accn,
            ucsc_style_name=self.ucsc_style_name,
            length=self.sequence_length,
            aliases=self.get_aliases(),
            canonical_id=genomic_sequence_canonical_id(
                self.genbank_accn, self.refseq_accn
            ),
        )

    def get_aliases(self) -> list[str]:
        """
        Build a comprehensive, deduplicated list of aliases for a chromosome.
        Variants include:
        - Provided fields: ucsc_style_name, genbank_accession, refseq_accession, sequence_name, chr_name
        - Normalizations: space→underscore, lower/strip
        - Numeric variants: N, zero-padded (e.g., 01), with/without 'chr' prefix
        - Extract numeric tail from chromosome-like names (not accession IDs)
        """
        aliases_set = set()

        def add(value: str):
            if value:
                v = value.strip()
                if v:
                    aliases_set.add(v)
                    if '.' in v: #remove the version number if it exists
                        aliases_set.add(v.split('.')[0])

        # Base identifiers from record
        add(self.genbank_accn)

        add(self.refseq_accn)

        ucsc_style_name = self.ucsc_style_name
        add(self.ucsc_style_name)

        sequence_name = self.sequence_name
        add(sequence_name)

        chr_name = self.chr_name
        add(chr_name)

        # Space → underscore variant for relevant fields
        if chr_name and (' ' in chr_name):
            add(chr_name.replace(' ', '_'))
        if ucsc_style_name and (' ' in ucsc_style_name):
            add(ucsc_style_name.replace(' ', '_'))
        if sequence_name and (' ' in sequence_name):
            add(sequence_name.replace(' ', '_'))
        # Only derive numeric tails from chromosome-like fields (chr_name, ucsc_style_name)
        digit_tails = set()

        if chr_name:
            m = re.search(r"(\d+)$", chr_name)
            if m:
                tail = m.group(1)
                digit_tails.add(tail)
                digit_tails.add(tail.lstrip('0') or '0')
            # pure numeric chr_name
            if chr_name.isdigit():
                digit_tails.add(chr_name)
                digit_tails.add(chr_name.lstrip('0') or '0')

        if ucsc_style_name:
            m = re.match(r"^chr_?(\d+)$", ucsc_style_name)
            if m:
                tail = m.group(1)
                digit_tails.add(tail)
                digit_tails.add(tail.lstrip('0') or '0')
        if sequence_name:
            m = re.match(r"^(\d+)$", sequence_name)
            if m:
                tail = m.group(1)
                digit_tails.add(tail)
                digit_tails.add(tail.lstrip('0') or '0')
        # Build variants for digit tails
        for d in digit_tails:
            add(d)
            if d.isdigit():
                add(d.zfill(2))
            add(f"chr{d}")
            add(f"chr_{d}")

        return list(aliases_set)

class AssemblyToProcess:
    """
    This class is used to map the incoming assembly data to the GenomeAssembly model
    """
    def __init__(
        self,
        accession: str,
        paired_accession: str|None,
        assembly_stats: dict,
        assembly_info: dict,
        organism: dict,
        source_database: str,
        **kwargs
    ):
        self.accession = accession
        self.paired_accession = paired_accession
        self.assembly_stats = assembly_stats
        self.assembly_info = assembly_info
        self.organism = organism
        self.source_database = source_database
        self.taxid = self.get_tax_id()

    def get_assembly_name(self) -> str:
        """
        Get the assembly name from the assembly info
        """
        return self.assembly_info.get('assembly_name')

    def get_organism_name(self) -> str:
        """
        Get the organism name from the organism info
        """
        return self.organism_info.get('organism_name')

    def get_tax_id(self) -> str:
        """
        Get the tax id from the organism info
        """
        return str(self.organism_info.get('tax_id'))

    def to_genome_assembly(self, lineage: list[str]) -> GenomeAssembly:
        """
        Convert the AssemblyToProcess object to a GenomeAssembly document
        """
        from . import assembly as assembly_service

        assembly_stats = self.assembly_stats
        taxid = self.get_tax_id()
        assembly_name = self.get_assembly_name()
        return GenomeAssembly(
            assembly_accession=self.accession,
            paired_assembly_accession=self.paired_accession,
            assembly_name=assembly_name,
            organism_name=self.organism.get("organism_name"),
            ncbi_ftp_directory_url=None,
            download_url=assembly_service.placeholder_download_url(self.accession),
            assembly_report=assembly_service.initial_assembly_report(
                self.assembly_info.get("assembly_level")
            ),
            taxid=taxid,
            assembly_stats=AssemblyStats(**assembly_stats),
            source_database=self.source_database,
            taxon_lineage=lineage,
        )

class GeneToCategorize:
    __slots__ = ("feature_type", "biotype", "length")
    def __init__(self, feature_type: str, biotype: str | None=None, length: int=0):
        self.feature_type = feature_type
        self.biotype = biotype
        self.length = length
        self.has_cds = False
        self.has_exon = False

class FeatureToCategorize:
    __slots__ = ("parent_id", "feature_type", "biotype", "length")
    def __init__(self, parent_id: str | None=None, feature_type: str | None=None, biotype: str | None=None, length: int=0):
        self.parent_id = parent_id
        self.feature_type = feature_type
        self.biotype = biotype
        self.length = length

class SubFeatureStats:
    __slots__ = ("total_count", "mean_length", "min_length", "max_length", "concatenated_mean_length", "concatenated_min_length", "concatenated_max_length")
    def __init__(self):
        self.total_count = 0
        self.mean_length = 0.0
        self.min_length = 0
        self.max_length = 0
        self.concatenated_mean_length = 0.0
        self.concatenated_min_length = 0
        self.concatenated_max_length = 0

class TranscriptStats:
    __slots__ = ("total_count", "mean_length", "min_length", "max_length", "gene_counts")

    def __init__(self):
        self.total_count = 0
        self.mean_length = 0.0
        self.min_length = 0
        self.max_length = 0
        # gene_id → transcript count for this feature_type
        self.gene_counts = {}

        
class TranscriptBuffer: 
    __slots__ = ("type", "exon_intervals", "cds_intervals")

    def __init__(self, type: str):
        self.type = type
        self.exon_lengths = [] #list of tuples (start, end)
        self.cds_lengths = [] #list of tuples (start, end)

    def add_exon_length(self, length: int):
        self.exon_lengths.append(length)
        self.length += length

    def add_cds_length(self, length: int):
        self.cds_lengths.append(length)
        self.length += length

class Gene:
    __slots__ = ("feature_type", "biotype", "length", "has_cds", "has_exon","category")

    def __init__(self, feature_type: str | None=None, biotype: str | None=None, length: int=0):
        self.feature_type = feature_type
        self.biotype = biotype
        self.length = length
        self.has_cds = False
        self.has_exon = False
        self.category = None

    def set_category(self):
        if self.feature_type == "pseudogene":
            self.category = "pseudogene"
        elif self.has_cds or self.biotype == "protein_coding":
            self.category = "coding"
        elif self.has_exon:
            self.category = "non_coding"


class Transcript:
    __slots__ = (
        "gene_id",
        "type",
        "exons_lengths",
        "exon_len_sum",
        "exon_count",
        "cds_len_sum",
        "cds_count",
        "cds_lengths",
        "length",
    )

    def __init__(self, gene_id: str | None=None, ttype: str | None=None, length: int=0):
        self.gene_id = gene_id
        self.type = ttype
        self.length = length
        self.exons_lengths = array("i")
        self.exon_len_sum = 0
        self.exon_count = 0
        self.cds_len_sum = 0
        self.cds_count = 0
        self.cds_lengths = array("i")

    def add_exon_length(self, length: int):
        self.exons_lengths.append(length)
        self.exon_len_sum += length
        self.exon_count += 1

    def add_cds_length(self, length: int):
        self.cds_lengths.append(length)
        self.cds_len_sum += length
        self.cds_count += 1


class MiscFeature:
    __slots__ = (
        "count",
        "mean",
        "min",
        "max",
    )

    def __init__(self):
        self.count = 0
        self.mean = 0
        self.min = 0
        self.max = 0
    
    def add_length(self, length: int):
        self.count += 1
        self.mean = (self.mean * (self.count - 1) + length) / self.count
        self.min = min(self.min, length)
        self.max = max(self.max, length)

    __slots__ = ("annotation_id",  "complete", "single_copy", "duplicated", "fragmented", "missing")
    def __init__(self, annotation_id: str, lineage: str, complete: float, single_copy: float, duplicated: float, fragmented: float, missing: float, busco_count: int):
        self.annotation_id = annotation_id
        self.complete = complete
        self.single_copy = single_copy
        self.duplicated = duplicated
        self.fragmented = fragmented
        self.missing = missing

    def to_busco_score(self, busco_version: str, busco_lineage: str, busco_count: int) -> BuscoScore:
        """
        Convert the BuscoScoreToProcess object to a BuscoScore document
        """
        return BuscoScore(
            busco_lineage=busco_lineage,
            busco_version=busco_version,
            total_count=busco_count,
            complete=self.complete,
            single_copy=self.single_copy,
            duplicated=self.duplicated,
            fragmented=self.fragmented,
            missing=self.missing,
        )