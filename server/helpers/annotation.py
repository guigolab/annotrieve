from helpers import parameters as parameters_helper
from typing import Optional, Dict, List, Any
from db.embedded_documents import GeneStats, GeneLengthStats, TranscriptStats, LengthStats, FeatureStats, TranscriptTypeStats, FeatureTypeStats, GFFStats, GeneCategoryFeatureStats, GenericTranscriptTypeStats, GenericLengthStats, AssociatedGenesStats, SubFeatureStats
import statistics
from fastapi import HTTPException
from db.models import GenomeAnnotation, GenomeAssembly
from helpers import pysam_helper
from helpers import assembly_sequence_files as seq_files
from helpers import query_visitors as query_visitors_helper


DEFAULT_FIELD_MAP: Dict[str, str] = {
    "taxids": "taxon_lineage__in",
    "bioproject_accessions": "bioprojects__in",
    "db_sources": "source_file_info__database__in",
    "assembly_accessions": "assembly_accession__in",
    "md5_checksums": "annotation_id__in",
    "feature_types": "features_summary__types__in",
    "feature_sources": "features_summary__sources__in",
    "attribute_keys": "features_summary__attribute_keys__in",
    "biotypes": "features_summary__biotypes__in",
    "has_stats": "features_statistics__exists",
    "pipelines": "source_file_info__pipeline__name__in",
    "providers": "source_file_info__provider__in",
    "release_date_from": "source_file_info__release_date__gte",
    "release_date_to": "source_file_info__release_date__lte",
    "busco_complete_from": "busco__complete__gte",
    "busco_complete_to": "busco__complete__lte",
}


def get_annotation_records(
    filter: str = None,
    taxids: Optional[str] = None,
    db_sources: Optional[str] = None,
    feature_sources: Optional[str] = None,
    assembly_accessions: Optional[str] = None,
    bioproject_accessions: Optional[str] = None,
    biotypes: Optional[str] = None,
    feature_types: Optional[str] = None,
    has_stats: Optional[bool] = None,
    pipelines: Optional[str] = None,
    providers: Optional[str] = None,
    md5_checksums: Optional[str] = None,
    refseq_categories: str = None,
    assembly_levels: str = None,
    assembly_statuses: str = None,
    assembly_types: str = None,
    sort_by: str = None,
    sort_order: str = None,
    release_date_from: str = None,
    release_date_to: str = None,
    busco_complete_from: str = None,
    busco_complete_to: str = None,
):
    mongoengine_query = query_params_to_mongoengine_query(
        taxids=taxids,
        db_sources=db_sources,
        assembly_accessions=assembly_accessions,
        md5_checksums=md5_checksums,
        feature_sources=feature_sources,
        biotypes=biotypes,
        feature_types=feature_types,
        has_stats=has_stats,
        pipelines=pipelines,
        providers=providers,
        release_date_from=release_date_from,
        release_date_to=release_date_to,
        busco_complete_from=busco_complete_from,
        busco_complete_to=busco_complete_to,
    )
    annotations = GenomeAnnotation.objects(**mongoengine_query).exclude("id")
    if any(
        [
            refseq_categories,
            assembly_levels,
            assembly_statuses,
            assembly_types,
            bioproject_accessions,
        ]
    ):
        query = {}
        if refseq_categories:
            query["refseq_category__in"] = (
                refseq_categories.split(",")
                if isinstance(refseq_categories, str)
                else refseq_categories
            )
        if assembly_levels:
            query["assembly_level__in"] = (
                assembly_levels.split(",")
                if isinstance(assembly_levels, str)
                else assembly_levels
            )
        if assembly_statuses:
            query["assembly_status__in"] = (
                assembly_statuses.split(",")
                if isinstance(assembly_statuses, str)
                else assembly_statuses
            )
        if assembly_types:
            query["assembly_type__in"] = (
                assembly_types.split(",")
                if isinstance(assembly_types, str)
                else assembly_types
            )
        if bioproject_accessions:
            query["bioprojects__in"] = (
                bioproject_accessions.split(",")
                if isinstance(bioproject_accessions, str)
                else bioproject_accessions
            )
        assemblies = GenomeAssembly.objects(**query).scalar("assembly_accession")
        annotations = annotations.filter(assembly_accession__in=assemblies)
    if filter:
        annotations = annotations.filter(query_visitors_helper.annotation_query(filter))
    if sort_by:
        sort = "-" + sort_by if sort_order == "desc" else sort_by
        annotations = annotations.order_by(sort)
    return annotations


def _chromosome_identifiers(row: dict) -> set[str]:
    ids: set[str] = set()
    for key in (
        "chr_name",
        "sequence_name",
        "ucsc_style_name",
        "genbank_accession",
        "refseq_accession",
        "canonical_id",
    ):
        val = row.get(key)
        if val:
            v = str(val).strip()
            if v:
                ids.add(v)
                if "|" in v:
                    ids.update(part.strip() for part in v.split("|") if part.strip())
                if "." in v:
                    ids.add(v.split(".")[0])
    return ids


def resolve_sequence_id(region: str | int, md5_checksum: str, file_path: str):
    """
    Resolve a region name to the GFF sequence_id using chr_aliases.tsv, chromosomes.json,
    and contigs.txt (exact seqid match).
    """
    region_str = str(region)
    annotation = GenomeAnnotation.objects(annotation_id=md5_checksum).only(
        "assembly_accession", "taxid", "indexed_file_info"
    ).first()
    if not annotation or not annotation.indexed_file_info:
        raise HTTPException(
            status_code=404,
            detail=f"Annotation {md5_checksum} not found",
        )

    rel_path = annotation.indexed_file_info.bgzipped_path.lstrip("/")
    contig_candidates: set[str] = {region_str}

    assembly = GenomeAssembly.objects(
        assembly_accession=annotation.assembly_accession
    ).only("paired_assembly_accession").first()
    paired = assembly.paired_assembly_accession if assembly else None

    alias_index = seq_files.load_chr_aliases_index(
        annotation.taxid, annotation.assembly_accession, paired
    )
    ref_name = alias_index.get(region_str)
    if ref_name:
        contig_candidates.add(ref_name)

    chr_path = seq_files.resolve_chromosomes_path(
        annotation.taxid, annotation.assembly_accession, paired
    )
    if chr_path:
        import json

        with open(chr_path, encoding="utf-8") as fh:
            chromosomes = json.load(fh)
        for row in chromosomes:
            identifiers = _chromosome_identifiers(row)
            if region_str in identifiers or (ref_name and ref_name in identifiers):
                contig_candidates.update(identifiers)

    contig_ids = seq_files.load_contig_ids_set(rel_path)
    if contig_ids:
        for candidate in contig_candidates:
            if candidate and candidate in contig_ids:
                return candidate
    else:
        for contig in pysam_helper.stream_contigs_names(file_path):
            if contig in contig_candidates:
                return contig

    if region_str in contig_ids:
        return region_str

    raise HTTPException(
        status_code=404,
        detail=f"Region '{region}' not found in annotation {md5_checksum}",
    )


# Utility to flatten nested dictionaries
def flatten_dict(d: Dict[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)


def map_to_gff_stats(features_stats: Dict[str, Any]) -> GFFStats:
    """
    Map the feature stats to the FeatureStats embedded document
    """
    return GFFStats(
        **{
            key: map_to_gene_stats(value) 
            for key, value in features_stats.items() if value
            }
        )

def map_to_stats(features_stats: Dict[str, Any]) -> tuple[Dict[str, GeneCategoryFeatureStats], Dict[str, GenericTranscriptTypeStats]]:
    """
    Map the feature stats to the new GeneCategoryFeatureStats and GenericTranscriptTypeStats embedded documents.
    Returns dictionaries mapping category/type names to their respective embedded document instances.
    """
    gene_category_stats_dict = {}
    transcript_type_stats_dict = {}
    
    # Process gene_category_stats
    gene_category_stats = features_stats.get('gene_category_stats', {})
    if gene_category_stats:
        for category, stats in gene_category_stats.items():
            if not stats:
                continue
            
            # Build length_stats
            length_stats_data = stats.get('length_stats', {})
            length_stats = None
            if length_stats_data:
                length_stats = GenericLengthStats(
                    min=length_stats_data.get('min', 0),
                    max=length_stats_data.get('max', 0),
                    mean=length_stats_data.get('mean', 0.0)
                )
            
            gene_category_stats_dict[category] = GeneCategoryFeatureStats(
                total_count=stats.get('total_count', 0),
                length_stats=length_stats,
                biotype_counts=stats.get('biotype_counts', {}),
                transcript_type_counts=stats.get('transcript_type_counts', {})
            )
    
    # Process transcript_type_stats
    transcript_type_stats = features_stats.get('transcript_type_stats', {})
    if transcript_type_stats:
        for transcript_type, stats in transcript_type_stats.items():
            if not stats:
                continue
            
            # Build length_stats
            length_stats_data = stats.get('length_stats', {})
            length_stats = None
            if length_stats_data:
                length_stats = GenericLengthStats(
                    min=length_stats_data.get('min', 0),
                    max=length_stats_data.get('max', 0),
                    mean=length_stats_data.get('mean', 0.0)
                )
            
            # Build associated_genes
            associated_genes_data = stats.get('associated_genes', {})
            associated_genes = None
            if associated_genes_data:
                associated_genes = AssociatedGenesStats(
                    total_count=associated_genes_data.get('total_count', 0),
                    gene_categories=associated_genes_data.get('gene_categories', {})
                )
            
            # Build exon_stats
            exon_stats_data = stats.get('exon_stats', {})
            exon_stats = None
            if exon_stats_data:
                exon_length_data = exon_stats_data.get('length', {})
                exon_length = None
                if exon_length_data:
                    exon_length = GenericLengthStats(
                        min=exon_length_data.get('min', 0),
                        max=exon_length_data.get('max', 0),
                        mean=exon_length_data.get('mean', 0.0)
                    )
                
                exon_concat_data = exon_stats_data.get('concatenated_length', {})
                exon_concat = None
                if exon_concat_data:
                    exon_concat = GenericLengthStats(
                        min=exon_concat_data.get('min', 0),
                        max=exon_concat_data.get('max', 0),
                        mean=exon_concat_data.get('mean', 0.0)
                    )
                
                exon_stats = SubFeatureStats(
                    total_count=exon_stats_data.get('total_count', 0),
                    length=exon_length,
                    concatenated_length=exon_concat
                )
            
            # Build cds_stats
            cds_stats_data = stats.get('cds_stats', {})
            cds_stats = None
            if cds_stats_data:
                cds_length_data = cds_stats_data.get('length', {})
                cds_length = None
                if cds_length_data:
                    cds_length = GenericLengthStats(
                        min=cds_length_data.get('min', 0),
                        max=cds_length_data.get('max', 0),
                        mean=cds_length_data.get('mean', 0.0)
                    )
                
                cds_concat_data = cds_stats_data.get('concatenated_length', {})
                cds_concat = None
                if cds_concat_data:
                    cds_concat = GenericLengthStats(
                        min=cds_concat_data.get('min', 0),
                        max=cds_concat_data.get('max', 0),
                        mean=cds_concat_data.get('mean', 0.0)
                    )
                
                cds_stats = SubFeatureStats(
                    total_count=cds_stats_data.get('total_count', 0),
                    length=cds_length,
                    concatenated_length=cds_concat
                )
            
            transcript_type_stats_dict[transcript_type] = GenericTranscriptTypeStats(
                length_stats=length_stats,
                total_count=stats.get('total_count', 0),
                biotype_counts=stats.get('biotype_counts', {}),
                associated_genes=associated_genes,
                exon_stats=exon_stats,
                cds_stats=cds_stats
            )
    
    return gene_category_stats_dict, transcript_type_stats_dict


def map_to_gene_stats(gene_stats: Dict[str, Any]) -> GeneStats:
    """
    Map the gene stats to the GeneStats embedded document
    """
    return GeneStats(
        count=gene_stats.get('count'),
        length_stats=GeneLengthStats(**gene_stats.get('length_stats')),
        transcripts=TranscriptStats(
            count=gene_stats.get('transcripts').get('count'),
            per_gene=gene_stats.get('transcripts').get('per_gene'),
            types={
                transcript_type: TranscriptTypeStats(
                    count=transcript_type_stats.get('count'),
                    per_gene=transcript_type_stats.get('per_gene'),
                    exons_per_transcript=transcript_type_stats.get('exons_per_transcript'),
                    length_stats=LengthStats(**transcript_type_stats.get('length_stats')),
                    spliced_length_stats=LengthStats(**transcript_type_stats.get('spliced_length_stats')) if transcript_type_stats.get('spliced_length_stats') else None,
                    exon_length_stats=LengthStats(**transcript_type_stats.get('exon_length_stats')) if transcript_type_stats.get('exon_length_stats') else None,
                )
                for transcript_type, transcript_type_stats in gene_stats.get('transcripts').get('types').items()
            }
        ),
        features=FeatureStats(
            exons=FeatureTypeStats(
                count=gene_stats.get('features', {}).get('exons', {}).get('count'),
                length_stats=LengthStats(**gene_stats.get('features', {}).get('exons', {}).get('length_stats')),
            ),
            cds=FeatureTypeStats(
                count=gene_stats.get('features', {}).get('cds', {}).get('count'),
                length_stats=LengthStats(**gene_stats.get('features', {}).get('cds', {}).get('length_stats')),
            ) if gene_stats.get('features').get('cds') else None,
            introns=FeatureTypeStats(
                count=gene_stats.get('features', {}).get('introns', {}).get('count'),
                length_stats=LengthStats(**gene_stats.get('features', {}).get('introns', {}).get('length_stats')),
            ),
        ),
    )

def query_params_to_mongoengine_query(
    taxids: Optional[List[str] | str] = None,
    db_sources: Optional[List[str] | str] = None,
    assembly_accessions: Optional[List[str] | str] = None,
    md5_checksums: Optional[List[str] | str] = None,
    feature_types: Optional[List[str] | str] = None,
    feature_sources: Optional[List[str] | str] = None,
    biotypes: Optional[List[str] | str] = None,
    has_stats: Optional[bool] = None,
    pipelines: Optional[List[str] | str] = None,
    providers: Optional[List[str] | str] = None,
    release_date_from: Optional[str] = None,
    release_date_to: Optional[str] = None,
    field_map: Optional[Dict[str, str]] = None,
    busco_complete_from: Optional[str] = None,
    busco_complete_to: Optional[str] = None,
) -> Dict[str, Any]:
    """Convert API query parameters to MongoDB query format."""
    query: Dict[str, Any] = {}
    mapping = {**DEFAULT_FIELD_MAP, **(field_map or {})}

    param_configs = {
        "taxids": {"type": "list", "normalize": True, "required": False},
        "db_sources": {"type": "list", "normalize": True, "required": False},
        "assembly_accessions": {"type": "list", "normalize": True, "required": False},
        "md5_checksums": {"type": "list", "normalize": True, "required": False},
        "feature_types": {"type": "list", "normalize": True, "required": False},
        "feature_sources": {"type": "list", "normalize": True, "required": False},
        "biotypes": {"type": "list", "normalize": True, "required": False},
        "has_stats": {"type": "bool", "normalize": False, "required": False},
        "pipelines": {"type": "list", "normalize": True, "required": False},
        "providers": {"type": "list", "normalize": True, "required": False},
        "release_date_from": {"type": "date", "normalize": False, "required": False},
        "release_date_to": {"type": "date", "normalize": False, "required": False},
        "busco_complete_from": {"type": "float", "normalize": False, "required": False},
        "busco_complete_to": {"type": "float", "normalize": False, "required": False},
    }

    inputs = {
        "taxids": taxids,
        "db_sources": db_sources,
        "assembly_accessions": assembly_accessions,
        "md5_checksums": md5_checksums,
        "feature_types": feature_types,
        "feature_sources": feature_sources,
        "biotypes": biotypes,
        "has_stats": has_stats,
        "pipelines": pipelines,
        "providers": providers,
        "release_date_from": release_date_from,
        "release_date_to": release_date_to,
        "busco_complete_from": busco_complete_from,
        "busco_complete_to": busco_complete_to,
    }

    for param_name, raw_value in inputs.items():
        if raw_value is None:
            continue
            
        config = param_configs.get(param_name, {"type": "list", "normalize": True, "required": False})
        field = mapping.get(param_name)
        
        if not field:
            continue
            
        try:
            processed_value = _process_parameter_value(raw_value, config)
            if processed_value is not None:
                query[field] = processed_value
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid value for parameter '{param_name}': {raw_value}. {str(e)}")

    return query


def _process_parameter_value(raw_value: Any, config: Dict[str, Any]) -> Any:
    param_type = config.get("type", "list")
    should_normalize = config.get("normalize", True)
    
    if param_type == "bool":
        return _process_boolean_value(raw_value)
    elif param_type == "list":
        return _process_list_value(raw_value, should_normalize)
    elif param_type == "int":
        return _process_int_value(raw_value)
    elif param_type == "float":
        return _process_float_value(raw_value)
    elif param_type == "date":
        return _process_date_value(raw_value)
    elif param_type == "string":
        return _process_string_value(raw_value, should_normalize)
    else:
        raise ValueError(f"Unsupported parameter type: {param_type}")


def _process_boolean_value(raw_value: Any) -> bool:
    if isinstance(raw_value, bool):
        return raw_value
    elif isinstance(raw_value, str):
        normalized = raw_value.lower().strip()
        if normalized in ('true', '1', 'yes', 'on'):
            return True
        elif normalized in ('false', '0', 'no', 'off'):
            return False
        else:
            raise ValueError(f"Invalid boolean value: {raw_value}")
    elif isinstance(raw_value, (int, float)):
        return bool(raw_value)
    else:
        raise ValueError(f"Cannot convert to boolean: {type(raw_value).__name__}")

def _process_float_value(raw_value: Any) -> float:
    if isinstance(raw_value, float):
        return raw_value
    elif isinstance(raw_value, str):
        try:
            return float(raw_value.strip())
        except ValueError:
            raise ValueError(f"Invalid float value: {raw_value}")
    elif isinstance(raw_value, int):
        return float(raw_value)
    else:
        raise ValueError(f"Invalid float value: {raw_value}")

def _process_list_value(raw_value: Any, should_normalize: bool = True) -> List[str] | None:
    if isinstance(raw_value, list):
        values = raw_value
    elif isinstance(raw_value, str):
        if should_normalize:
            values = parameters_helper.normalize_to_list(raw_value)
        else:
            values = [v.strip() for v in raw_value.split(',') if v.strip()]
    else:
        values = [str(raw_value)] if raw_value is not None else []
    
    return values if values else None


def _process_int_value(raw_value: Any) -> int:
    if isinstance(raw_value, int):
        return raw_value
    elif isinstance(raw_value, str):
        try:
            return int(raw_value.strip())
        except ValueError:
            raise ValueError(f"Invalid integer value: {raw_value}")
    elif isinstance(raw_value, float):
        return int(raw_value)
    else:
        raise ValueError(f"Cannot convert to integer: {type(raw_value).__name__}")


def _process_date_value(raw_value: Any) -> str:
    if isinstance(raw_value, str):
        date_str = raw_value.strip()
        if not date_str:
            raise ValueError("Empty date string")
        return date_str
    else:
        raise ValueError(f"Date must be a string, got: {type(raw_value).__name__}")


def _process_string_value(raw_value: Any, should_normalize: bool = True) -> str:
    if isinstance(raw_value, str):
        if should_normalize:
            return raw_value.strip()
        else:
            return raw_value
    else:
        return str(raw_value).strip() if should_normalize else str(raw_value)
        
def map_to_gene_category_stats(data: Dict[str, Any], counts: List[int], mean_lengths: List[float]) -> dict[str, Any]:
    return {
        'total_count': data.get('total_count', 0),
        'mean_count': round(data.get('avg_count', 0), 2) if data.get('avg_count') else 0,
        'median_count': round(statistics.median(counts), 2) if counts else 0,
        'mean_length': round(data.get('avg_mean_length', 0), 2) if data.get('avg_mean_length') else 0,
        'median_length': round(statistics.median(mean_lengths), 2) if mean_lengths else 0,
        'transcript_types': data.get('transcript_types_array', [])
    }

def map_to_transcript_type_stats(data: Dict[str, Any], counts: List[int], mean_lengths: List[float]) -> dict[str, Any]:
    return {
        'total_count': data.get('total_count', 0),
        'mean_count': round(data.get('avg_count', 0), 2) if data.get('avg_count') else 0,
        'median_count': round(statistics.median(counts), 2) if counts else 0,
        'mean_length': round(data.get('avg_mean_length', 0), 2) if data.get('avg_mean_length') else 0,
        'median_length': round(statistics.median(mean_lengths), 2) if mean_lengths else 0,
    }

def category_stats_to_dict(dict_data: dict[str, Any]) -> dict[str, Any]:
    return {
        'total_count': dict_data.get('total_count'),
        'mean_count': dict_data.get('mean_count'),
        'median_count': dict_data.get('median_count'),
        'mean_length': dict_data.get('mean_length'),
        'median_length': dict_data.get('median_length'),
    }
