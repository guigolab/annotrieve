from typing import Iterable
from db.embedded_documents import (
    GFFStats,
    GeneCategoryFeatureStats,
    GenericLengthStats,
    AssociatedGenesStats,
    GenericTranscriptTypeStats,
    SubFeatureStats as SubFeatureStatsDoc,
)
from helpers import pysam_helper
from .utils import safe_dict_key, sanitize_counts


MISSING_BIOTYPE = "biotype_missing"

GENE_CODES = set([
    "gene",
    "ncRNA_gene",
    "pseudogene",
])

TRANSCRIPT_CODES = set([
    "mRNA",
    "ncRNA",
    "tRNA",
    "rRNA",
    "sRNA",
    "snRNA",
    "snoRNA",
    "misc_RNA",
    "miRNA",
    "piRNA",
    "siRNA",
    "lncRNA",
    "transcript",
])

SUB_FEATURE_CODES = set([
    "exon",
    "CDS",
]   )

DNA_REGION_CODES = set([
    "chromosome",
    "contig",
    "scaffold",
    "plasmid",
    "mitochondrion",
    "chloroplast",
    "mitogenome",
    "region",
    "biological_region",
    "telomere",
    "supercontig",
    "scaffold_region",
])


def _compute_features_statistics_from_lines(lines: Iterable[str]) -> GFFStats:
    """
    Internal helper that computes statistics from an iterable of GFF lines.
    """
    from collections import defaultdict
    from array import array

    # Helper classes for tracking stats (similar to verify.py)
    class FeatureStats:
        __slots__ = ('total_count', 'mean_length', 'min_length', 'max_length', 'sum_lengths')
        def __init__(self):
            self.total_count = 0
            self.mean_length = 0.0
            self.min_length = None
            self.max_length = None
            self.sum_lengths = 0

        def update_length(self, length):
            self.total_count += 1
            self.sum_lengths += length
            if self.min_length is None or length < self.min_length:
                self.min_length = length
            if self.max_length is None or length > self.max_length:
                self.max_length = length
            self.mean_length = self.sum_lengths / self.total_count

    class GeneCategoryStats:
        __slots__ = ('count', 'length_stats', 'biotype_counts', 'transcript_type_counts')
        def __init__(self):
            self.count = 0
            self.length_stats = FeatureStats()
            self.biotype_counts = defaultdict(int)
            self.transcript_type_counts = defaultdict(int)

    class TranscriptStats:
        __slots__ = ('count', 'transcript_lengths', 'exon_counts', 'cds_counts',
                     'concat_exon_lengths', 'concat_cds_lengths', 'n_genes',
                     'has_multiple_exons', 'has_cds', 'biotype_counts', 'gene_category_counts')
        def __init__(self):
            self.count = 0
            self.transcript_lengths = FeatureStats()
            self.exon_counts = FeatureStats()
            self.cds_counts = FeatureStats()
            self.concat_exon_lengths = FeatureStats()
            self.concat_cds_lengths = FeatureStats()
            # Unique genes are counted per seqid (a gene never spans seqids) and summed, instead of
            # keeping every gene id of the whole file in a set.
            self.n_genes = 0
            self.has_multiple_exons = False
            self.has_cds = False
            self.biotype_counts = defaultdict(int)
            self.gene_category_counts = defaultdict(int)

    def parse_attributes_full(attr_string):
        """Parse all attributes (more complete than parse_gff_line_fast)"""
        d = {}
        if not attr_string:
            return d
        for part in attr_string.strip().split(';'):
            part = part.strip()
            if '=' in part:
                k, v = part.split('=', 1)
                d[k.strip()] = v.strip()
        return d
        
    # Global accumulators
    gene_categories = {
        'coding': GeneCategoryStats(),
        'pseudogene': GeneCategoryStats(),
        'non_coding': GeneCategoryStats()
    }
    transcript_stats = defaultdict(TranscriptStats)
    known_transcript_types = set()
    
    class SeqidCollector:
        """
        Single pass over the lines of ONE seqid.

        Memory is proportional to the number of genes/transcripts, not to the number of lines:
        exon/CDS lines (the bulk of a GFF) are folded into per-parent length arrays and dropped,
        and every other feature keeps only a small tuple of the facts the statistics need.
        """
        __slots__ = ('exons_cds', 'transcript_cands', 'gene_first', 'other_first', 'order')

        def __init__(self):
            self.exons_cds = {}         # parent id -> (exon lengths, cds lengths)
            self.transcript_cands = {}  # feature id -> (type, length, biotype, gene id); last line wins
            self.gene_first = {}        # id -> (order, type, biotype, length); first gene-code line wins
            self.other_first = {}       # id -> (order, type, biotype, length); first non-transcript line wins
            self.order = 0

        def add(self, f):
            feature_type = f[2]
            try:
                length = int(f[4]) - int(f[3]) + 1
            except (ValueError, IndexError):
                return
            attr = parse_attributes_full(f[8])

            if feature_type in SUB_FEATURE_CODES:
                parent_ids = attr.get('Parent', '')
                if not parent_ids:
                    return
                for parent_id in parent_ids.split(','):
                    parent_id = parent_id.strip()
                    if not parent_id:
                        continue
                    entry = self.exons_cds.get(parent_id)
                    if entry is None:
                        entry = self.exons_cds[parent_id] = (array('i'), array('i'))
                    (entry[0] if feature_type == 'exon' else entry[1]).append(length)
                return

            feature_id = attr.get('ID')
            if not feature_id:
                return
            self.order += 1

            if feature_type not in DNA_REGION_CODES and feature_type not in GENE_CODES:
                self.transcript_cands[feature_id] = (
                    feature_type,
                    length,
                    attr.get('biotype') or attr.get('transcript_biotype'),
                    attr.get('Parent') or attr.get('gene') or attr.get('Gene') or None,
                )

            if feature_type in GENE_CODES:
                target = self.gene_first
            elif feature_type not in DNA_REGION_CODES and feature_type not in TRANSCRIPT_CODES:
                target = self.other_first
            else:
                return
            if feature_id not in target:
                gene_biotype = attr.get('biotype') or attr.get('gene_biotype') or attr.get('type')
                target[feature_id] = (
                    self.order,
                    feature_type.lower(),
                    gene_biotype.lower() if gene_biotype else MISSING_BIOTYPE,
                    length,
                )

    def process_seqid(collector):
        """Fold one seqid's collected facts into the global accumulators."""
        exons_cds = collector.exons_cds

        # Transcripts: features with an ID that own exons/CDS
        transcripts = {}
        for tid, (ttype, tlength, tbiotype, tgene) in collector.transcript_cands.items():
            entry = exons_cds.get(tid)
            if entry is None or (len(entry[0]) == 0 and len(entry[1]) == 0):
                continue
            transcripts[tid] = (ttype, tlength, tbiotype, tgene, entry[0], entry[1])

        # Genes that have transcripts with exons/CDS
        gene_has_exon = set()
        gene_has_cds = set()
        for ttype, tlength, tbiotype, tgene, exon_lengths, cds_lengths in transcripts.values():
            if tgene:
                if len(exon_lengths) > 0:
                    gene_has_exon.add(tgene)
                if len(cds_lengths) > 0:
                    gene_has_cds.add(tgene)

        # Genes: gene-code features always count; any other feature counts only if some transcript
        # points at it. When both exist for one id, the earliest line wins (as in file order).
        gene_info = {}
        for gene_id, (order, gtype, gbiotype, glength) in collector.gene_first.items():
            gene_info[gene_id] = (order, gtype, gbiotype, glength)
        for gene_id, record in collector.other_first.items():
            if gene_id in gene_has_exon or gene_id in gene_has_cds:
                current = gene_info.get(gene_id)
                if current is None or record[0] < current[0]:
                    gene_info[gene_id] = record

        gene_category_of = {}
        for gene_id, (_order, ftype, biotype, length) in gene_info.items():
            has_cds = gene_id in gene_has_cds
            has_exon = gene_id in gene_has_exon
            if ftype == 'pseudogene':
                category = 'pseudogene'
            elif has_cds or biotype == 'protein_coding':
                category = 'coding'
            elif has_exon:
                category = 'non_coding'
            else:
                continue
            gene_categories[category].count += 1
            gene_categories[category].length_stats.update_length(length)
            gene_categories[category].biotype_counts[biotype if biotype else MISSING_BIOTYPE] += 1
            gene_category_of[gene_id] = category

        # Transcript statistics
        genes_by_type = defaultdict(set)
        genes_by_type_category = defaultdict(lambda: defaultdict(set))
        for ts_type, transcript_length, ts_biotype, ts_gene, exon_lengths, cds_lengths in transcripts.values():
            known_transcript_types.add(ts_type)
            ts = transcript_stats[ts_type]

            exon_count = len(exon_lengths)
            cds_count = len(cds_lengths)
            if exon_count > 1:
                ts.has_multiple_exons = True
            if cds_count > 0:
                ts.has_cds = True

            for exon_len in exon_lengths:
                ts.exon_counts.update_length(exon_len)
            for cds_len in cds_lengths:
                ts.cds_counts.update_length(cds_len)

            concat_exon_len = sum(exon_lengths)
            if concat_exon_len > 0:
                ts.concat_exon_lengths.update_length(concat_exon_len)
            concat_cds_len = sum(cds_lengths)
            if concat_cds_len > 0:
                ts.concat_cds_lengths.update_length(concat_cds_len)

            ts.transcript_lengths.update_length(transcript_length)
            ts.count += 1

            if ts_gene:
                genes_by_type[ts_type].add(ts_gene)
                gene_category = gene_category_of.get(ts_gene)
                if gene_category:
                    genes_by_type_category[ts_type][gene_category].add(ts_gene)
                    gene_categories[gene_category].transcript_type_counts[ts_type] += 1

            ts.biotype_counts[ts_biotype if ts_biotype else MISSING_BIOTYPE] += 1

        for ts_type, genes in genes_by_type.items():
            transcript_stats[ts_type].n_genes += len(genes)
        for ts_type, by_category in genes_by_type_category.items():
            for category, genes in by_category.items():
                transcript_stats[ts_type].gene_category_counts[category] += len(genes)

    # Main loop: lines arrive sorted by seqid; each seqid is collected in one pass and folded in.
    current_seqid = None
    collector = SeqidCollector()

    for line in lines:
        if line.startswith("#") or not line.strip():
            continue

        f = line.rstrip('\n').split('\t')
        if len(f) < 9:
            continue

        if current_seqid is not None and f[0] != current_seqid:
            process_seqid(collector)
            collector = SeqidCollector()
        current_seqid = f[0]
        collector.add(f)

    if current_seqid is not None:
        process_seqid(collector)

    # Build embedded documents
    gene_category_stats_dict = {}
    for category in ['coding', 'pseudogene', 'non_coding']:
        stats = gene_categories[category]
        if stats.count > 0:
            ls = stats.length_stats
            gene_category_stats_dict[category] = GeneCategoryFeatureStats(
                total_count=stats.count,
                length_stats=GenericLengthStats(
                    min=ls.min_length if ls.min_length is not None else 0,
                    max=ls.max_length if ls.max_length is not None else 0,
                    mean=round(ls.mean_length if ls.mean_length > 0 else 0.0, 2)
                ),
                biotype_counts=sanitize_counts(stats.biotype_counts),
                transcript_type_counts=sanitize_counts(stats.transcript_type_counts)
            )
    
    transcript_type_stats_dict = {}
    # Sort transcript types by total_count in descending order
    sorted_transcript_types = sorted(
        [ttype for ttype in known_transcript_types 
         if ttype in transcript_stats and transcript_stats[ttype].count > 0],
        key=lambda ttype: transcript_stats[ttype].count,
        reverse=True
    )
    
    for ttype in sorted_transcript_types:
        ts = transcript_stats[ttype]
        
        tl = ts.transcript_lengths
        ec = ts.exon_counts
        cel = ts.concat_exon_lengths
        
        # Build exon_stats
        exon_length_stats = GenericLengthStats(
            min=ec.min_length if ec.min_length is not None else 0,
            max=ec.max_length if ec.max_length is not None else 0,
            mean=round(ec.mean_length if ec.mean_length > 0 else 0.0, 2)
        )
        
        exon_stats_data = {'length': exon_length_stats, 'total_count': ec.total_count}
        
        if ec.total_count > ts.count:  # Multiple exons
            exon_concat_stats = GenericLengthStats(
                min=cel.min_length if cel.min_length is not None else 0,
                max=cel.max_length if cel.max_length is not None else 0,
                mean=round(cel.mean_length if cel.mean_length > 0 else 0.0, 2)
            )
            exon_stats_data['concatenated_length'] = exon_concat_stats
        
        exon_stats = SubFeatureStatsDoc(**exon_stats_data)
        
        # Build cds_stats (only if present)
        cds_stats = None
        if ts.has_cds:
            cc = ts.cds_counts

            ccdl = ts.concat_cds_lengths
            cds_length_stats = GenericLengthStats(
                min=cc.min_length if cc.min_length is not None else 0,
                max=cc.max_length if cc.max_length is not None else 0,
                mean=round(cc.mean_length if cc.mean_length > 0 else 0.0, 2)
            )
            cds_concat_stats = GenericLengthStats(
                min=ccdl.min_length if ccdl.min_length is not None else 0,
                max=ccdl.max_length if ccdl.max_length is not None else 0,
                mean=round(ccdl.mean_length if ccdl.mean_length > 0 else 0.0, 2)
            )
            cds_stats = SubFeatureStatsDoc(
                total_count=cc.total_count,
                length=cds_length_stats,
                concatenated_length=cds_concat_stats
            )
        
        # Build associated_genes
        genes_by_category = dict(ts.gene_category_counts)
        total_unique_genes = ts.n_genes
        
        associated_genes = AssociatedGenesStats(
            total_count=total_unique_genes,
            gene_categories=dict(sorted(genes_by_category.items()))
        )
        
        transcript_type_stats_dict[safe_dict_key(ttype)] = GenericTranscriptTypeStats(
            length_stats=GenericLengthStats(
                min=tl.min_length if tl.min_length is not None else 0,
                max=tl.max_length if tl.max_length is not None else 0,
                mean=round(tl.mean_length if tl.mean_length > 0 else 0.0, 2)
            ),
            total_count=ts.count,
            biotype_counts=sanitize_counts(ts.biotype_counts),
            associated_genes=associated_genes,
            exon_stats=exon_stats,
            cds_stats=cds_stats
        )
    
    return GFFStats(
        gene_category_stats=gene_category_stats_dict,
        transcript_type_stats=transcript_type_stats_dict,
    )


def compute_features_statistics(bgzipped_path: str) -> GFFStats:
    """
    Public entry point used by the import pipeline.
    Keeps the existing bgzipped+indexed behaviour via the tabix-backed stream.
    """
    return _compute_features_statistics_from_lines(
        pysam_helper.stream_tabix_gff_file(bgzipped_path)
    )
