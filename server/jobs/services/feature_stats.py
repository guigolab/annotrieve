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
                     'concat_exon_lengths', 'concat_cds_lengths', 'genes_with_this_type',
                     'has_multiple_exons', 'has_cds', 'biotype_counts', 'gene_categories')
        def __init__(self):
            self.count = 0
            self.transcript_lengths = FeatureStats()
            self.exon_counts = FeatureStats()
            self.cds_counts = FeatureStats()
            self.concat_exon_lengths = FeatureStats()
            self.concat_cds_lengths = FeatureStats()
            self.genes_with_this_type = set()
            self.has_multiple_exons = False
            self.has_cds = False
            self.biotype_counts = defaultdict(int)
            self.gene_categories = defaultdict(set)

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
    
    def process_seqid_lines(lines):
        """Process all features from a single seqid in 3 steps"""
        
        # Step 1: Collect exons and CDS
        exons_cds = {}
        
        for line in lines:
            f = line.rstrip('\n').split('\t')
            if len(f) < 9:
                continue
            
            feature_type = f[2]
            if feature_type not in ('exon', 'CDS'):
                continue
            
            try:
                start, end = int(f[3]), int(f[4])
                length = end - start + 1
            except (ValueError, IndexError):
                continue
            
            attr = parse_attributes_full(f[8])
            parent_ids = attr.get('Parent', '')
            if not parent_ids:
                continue
            
            for parent_id in parent_ids.split(','):
                parent_id = parent_id.strip()
                if not parent_id:
                    continue
                
                if parent_id not in exons_cds:
                    exons_cds[parent_id] = {
                        'exon_lengths': array('i'),
                        'cds_lengths': array('i')
                    }
                
                if feature_type == 'exon':
                    exons_cds[parent_id]['exon_lengths'].append(length)
                else:  # CDS
                    exons_cds[parent_id]['cds_lengths'].append(length)
        
        # Step 2: Collect transcripts with exons/CDS
        transcripts = {}
        
        for line in lines:
            f = line.rstrip('\n').split('\t')
            if len(f) < 9:
                continue
            
            feature_type = f[2]
            
            # Skip DNA regions and genes (already handled elsewhere)
            if feature_type in DNA_REGION_CODES or feature_type in GENE_CODES:
                continue
            
            # Skip exons/CDS (already processed in Step 1)
            if feature_type in SUB_FEATURE_CODES:
                continue
            
            try:
                start, end = int(f[3]), int(f[4])
                length = end - start + 1
            except (ValueError, IndexError):
                continue
            
            attr = parse_attributes_full(f[8])
            tid = attr.get('ID')
            
            if not tid:
                continue
            
            # Only process transcripts that have exons or CDS
            if tid not in exons_cds:
                continue
            
            exon_lengths = exons_cds[tid]['exon_lengths']
            cds_lengths = exons_cds[tid]['cds_lengths']
            exon_count = len(exon_lengths)
            cds_count = len(cds_lengths)
            
            if exon_count == 0 and cds_count == 0:
                continue
            
            transcript_biotype = attr.get('biotype') or attr.get('transcript_biotype')
            
            transcripts[tid] = {
                'type': feature_type if feature_type in TRANSCRIPT_CODES else (feature_type if feature_type not in DNA_REGION_CODES else 'transcript'),
                'biotype': transcript_biotype,
                'gene': attr.get('Parent') or attr.get('gene') or attr.get('Gene') or None,
                'length': length,
                'exon_lengths': exon_lengths,
                'cds_lengths': cds_lengths
            }
        
        # Track which genes have transcripts with exons/CDS
        gene_has_exon = set()
        gene_has_cds = set()
        
        for tid, tdata in transcripts.items():
            gene_id = tdata.get('gene')
            if gene_id:
                exon_count = len(tdata.get('exon_lengths', array('i')))
                cds_count = len(tdata.get('cds_lengths', array('i')))
                if exon_count > 0:
                    gene_has_exon.add(gene_id)
                if cds_count > 0:
                    gene_has_cds.add(gene_id)
        
        # Step 3: Collect and categorize genes
        gene_info = {}
        
        for line in lines:
            f = line.rstrip('\n').split('\t')
            if len(f) < 9:
                continue
            
            feature_type = f[2]
            attr = parse_attributes_full(f[8])
            gene_id = attr.get('ID')
            
            if feature_type in GENE_CODES and gene_id:
                try:
                    start, end = int(f[3]), int(f[4])
                    gene_length = end - start + 1
                except (ValueError, IndexError):
                    continue
                
                gene_ftype = feature_type.lower()
                gene_biotype = (attr.get('biotype') or attr.get('gene_biotype') or 
                                   attr.get('type')).lower()
                gene_biotype = gene_biotype if gene_biotype else MISSING_BIOTYPE                
                if gene_id not in gene_info:
                    gene_info[gene_id] = {
                        'feature_type': gene_ftype,
                        'biotype': gene_biotype,
                        'length': gene_length
                    }
            
            elif (feature_type not in DNA_REGION_CODES and 
                  feature_type not in TRANSCRIPT_CODES and
                  feature_type not in ('exon', 'CDS') and
                  gene_id):
                if gene_id in gene_has_exon or gene_id in gene_has_cds:
                    try:
                        start, end = int(f[3]), int(f[4])
                        gene_length = end - start + 1
                    except (ValueError, IndexError):
                        continue
                    
                    gene_ftype = feature_type.lower()
                    gene_biotype = (attr.get('biotype') or attr.get('gene_biotype') or 
                                   attr.get('type'))
                    gene_biotype = gene_biotype.lower() if gene_biotype else MISSING_BIOTYPE
                    
                    if gene_id not in gene_info:
                        gene_info[gene_id] = {
                            'feature_type': gene_ftype,
                            'biotype': gene_biotype,
                            'length': gene_length
                        }
        
        # Categorize and update global gene stats
        for gene_id, info in gene_info.items():
            ftype = info.get('feature_type', '')
            biotype = info.get('biotype', '')
            length = info.get('length', 0)
            has_cds = gene_id in gene_has_cds
            has_exon = gene_id in gene_has_exon
            
            related_biotype = None
            #handle missing biotypes 
            if ftype == 'pseudogene':
                category = 'pseudogene'
                related_biotype = 'pseudogene'
            elif has_cds or biotype == 'protein_coding':
                category = 'coding'
                related_biotype = 'protein_coding'
            elif has_exon:
                category = 'non_coding'
            else:
                continue
            
            gene_categories[category].count += 1
            gene_categories[category].length_stats.update_length(length)
            
            biotype_key = biotype if biotype else MISSING_BIOTYPE
            gene_categories[category].biotype_counts[biotype_key] += 1
            
            gene_info[gene_id]['category'] = category
        
        # Update global transcript stats
        for tid, tdata in transcripts.items():
            ts_type = tdata.get('type', 'transcript')
            ts_biotype = tdata.get('biotype', '')
            ts_gene = tdata.get('gene')
            known_transcript_types.add(ts_type)
            ts = transcript_stats[ts_type]
            
            exon_lengths = tdata.get('exon_lengths', array('i'))
            cds_lengths = tdata.get('cds_lengths', array('i'))
            transcript_length = tdata.get('length', 0)
            
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
                ts.genes_with_this_type.add(ts_gene)
                
                if ts_gene in gene_info:
                    gene_category = gene_info[ts_gene].get('category')
                    if gene_category:
                        ts.gene_categories[gene_category].add(ts_gene)
                        gene_categories[gene_category].transcript_type_counts[ts_type] += 1
            
            biotype_key = ts_biotype if ts_biotype else MISSING_BIOTYPE
            ts.biotype_counts[biotype_key] += 1
    
    # Main processing loop - accumulate lines across seqids until threshold
    LINE_THRESHOLD = 200000  # Number of lines before flushing
    current_seqid = None
    seqid_lines = []
    line_counter = 0
    
    for line in lines:
        if line.startswith("#") or not line.strip():
            continue
        
        f = line.rstrip('\n').split('\t')
        if len(f) < 9:
            continue
        
        seq_id = f[0]
        
        # Check if seqid changed and we have enough lines accumulated
        if current_seqid is not None and seq_id != current_seqid and line_counter >= LINE_THRESHOLD:
            # Flush the accumulated batch
            process_seqid_lines(seqid_lines)
            seqid_lines = []
            line_counter = 0
        
        current_seqid = seq_id
        seqid_lines.append(line)
        line_counter += 1
    
    # Process any remaining lines
    if seqid_lines:
        process_seqid_lines(seqid_lines)
    
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
                biotype_counts=dict(sorted(stats.biotype_counts.items())),
                transcript_type_counts=dict(sorted(stats.transcript_type_counts.items()))
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
        genes_by_category = {cat: len(gene_set) for cat, gene_set in ts.gene_categories.items()}
        total_unique_genes = len(ts.genes_with_this_type)
        
        associated_genes = AssociatedGenesStats(
            total_count=total_unique_genes,
            gene_categories=dict(sorted(genes_by_category.items()))
        )
        
        transcript_type_stats_dict[ttype] = GenericTranscriptTypeStats(
            length_stats=GenericLengthStats(
                min=tl.min_length if tl.min_length is not None else 0,
                max=tl.max_length if tl.max_length is not None else 0,
                mean=round(tl.mean_length if tl.mean_length > 0 else 0.0, 2)
            ),
            total_count=ts.count,
            biotype_counts=dict(sorted(ts.biotype_counts.items())),
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
