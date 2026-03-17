from helpers import file as file_helper
from helpers import query_visitors as query_visitors_helper
from helpers import response as response_helper
from helpers import parameters as params_helper
from helpers import pysam_helper
from helpers import constants as constants_helper
from helpers import annotation as annotation_helper
from helpers import feature_stats as feature_stats_helper
from helpers import busco_stats as busco_stats_helper
from helpers import pipelines as pipelines_helper
from db.models import GenomeAnnotation, AnnotationError, AnnotationSequenceMap
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
from typing import Dict, Any
import os
from datetime import datetime
from db.embedded_documents import GFFStats
import itertools

def get_annotations(args: dict, field: str = None, response_type: str = 'metadata'):
    try:
        limit = args.pop('limit', 20)
        offset = args.pop('offset', 0)
        fields = args.pop('fields', None)
        annotations = annotation_helper.get_annotation_records(**args)
        total = annotations.count()
        if response_type == 'frequencies':
            return query_visitors_helper.get_frequencies(annotations, field, type='annotation')
        elif response_type == 'tsv':
            return stream_annotation_tsv(annotations)
        else:
            if fields:
                annotations = annotations.only(*fields.split(',') if isinstance(fields, str) else fields)
            return response_helper.json_response_with_pagination(annotations, total, offset, limit)

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching annotations: {e}")

TSV_BUFFER_SIZE = 5000


def stream_annotation_tsv(annotations):
    fields = list(constants_helper.FIELD_TSV_MAP.values())
    header = ("\t".join(constants_helper.FIELD_TSV_MAP.keys()) + "\n").encode()
    def row_iterator():
        yield header
        cursor = iter(annotations.batch_size(TSV_BUFFER_SIZE).scalar(*fields))
        while batch := list(itertools.islice(cursor, TSV_BUFFER_SIZE)):
            yield "".join(
                "\t".join("" if v is None else str(v) for v in row) + "\n"
                for row in batch
            ).encode()
    return StreamingResponse(
        row_iterator(),
        media_type='text/tab-separated-values',
        headers={
            "Content-Disposition": f'attachment; filename="annotations_{datetime.now().strftime("%Y%m%d_%H%M%S")}.tsv"',
        },
    )

def get_annotation_metadata(md5_checksum):
    annotation = GenomeAnnotation.objects(annotation_id=md5_checksum).exclude('id').first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Annotation {md5_checksum} not found")
    return annotation.to_mongo().to_dict()

def get_annotation(md5_checksum):
    annotation = GenomeAnnotation.objects(annotation_id=md5_checksum).first()
    if not annotation:
        raise HTTPException(status_code=404, detail=f"Annotation {md5_checksum} not found")
    return annotation

def update_annotation_stats(md5_checksum, payload):
    """
    Update the stats for an annotation
    """
    if not payload:
        raise HTTPException(status_code=400, detail="No payload provided")
    auth_key = payload.get('auth_key')
    if auth_key != os.getenv('AUTH_KEY'):
        raise HTTPException(status_code=401, detail="Unauthorized")
    annotation = get_annotation(md5_checksum)
    gene_stats, transcript_stats = annotation_helper.map_to_stats(payload.get('features_statistics'))
    gff_stats = GFFStats(gene_category_stats=gene_stats if gene_stats else {}, transcript_type_stats=transcript_stats if transcript_stats else {})
    annotation.modify(features_statistics=gff_stats)

def get_mapped_regions(md5_checksum, offset_param, limit_param):
    try:
        regions = AnnotationSequenceMap.objects(annotation_id=md5_checksum)
        count = regions.count()
        offset, limit = params_helper.handle_pagination_params(offset_param, limit_param, count)    
        return response_helper.json_response_with_pagination(regions, count, offset, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching mapped regions: {e}")

def get_contigs(md5_checksum):
    try:
        annotation = get_annotation(md5_checksum)
        file_path = file_helper.get_annotation_file_path(annotation)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Annotation {md5_checksum} not found")
        return StreamingResponse(
            pysam_helper.stream_contigs(file_path), 
            media_type='text/plain', 
            headers={
                "Content-Disposition": f'attachment; filename="{md5_checksum}_contigs.txt"',
                "Cache-Control": "public, max-age=86400",
                "X-Accel-Buffering": "no",
            }
        )  
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching contigs: {e}")

def stream_annotation_tabix(md5_checksum:str, region:str=None, start:int=None, end:int=None, feature_type:str=None, feature_source:str=None, biotype:str=None):
    try:
        annotation = get_annotation(md5_checksum)
        file_path = file_helper.get_annotation_file_path(annotation)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Annotation file not found at {file_path}")
        
        start = params_helper.coerce_optional_int(start, 'start')
        end = params_helper.coerce_optional_int(end, 'end')
        
        #if there is no filter raise an error suggesting to download the file instead
        if not feature_type and not feature_source and not biotype and not region:
            raise HTTPException(status_code=400, detail="No filters provided, please provide a region, feature type, feature source or biotype to filter the annotation file, or download the file instead.")

        if start is not None and end is not None and start > end:
            raise HTTPException(status_code=400, detail="start must be less than end")
        
        seq_id = annotation_helper.resolve_sequence_id(region, md5_checksum, file_path) if region else None

        #check if biotype, feature_type and feature_source are valid values
        if biotype and biotype not in annotation.features_summary.biotypes:
            raise HTTPException(status_code=400, detail=f"Invalid biotype: {biotype}, expected values are: {annotation.features_summary.biotypes}")
        if feature_type and feature_type not in annotation.features_summary.types:
            raise HTTPException(status_code=400, detail=f"Invalid feature type: {feature_type}, expected values are: {annotation.features_summary.types}")
        if feature_source and feature_source not in annotation.features_summary.sources:
            raise HTTPException(status_code=400, detail=f"Invalid feature source: {feature_source}, expected values are: {annotation.features_summary.sources}")

        def stream_buffered_gff():
            buffer: list[str] = []
            for line in pysam_helper.stream_gff_file(file_path, index_format='csi', seqid=seq_id, start=start, end=end, feature_type=feature_type, feature_source=feature_source, biotype=biotype):
                buffer.append(line)
                if len(buffer) >= TSV_BUFFER_SIZE:
                    yield "".join(buffer)
                    buffer.clear()
            if buffer:
                yield "".join(buffer)

        return StreamingResponse(
            stream_buffered_gff(),
            media_type='text/plain',
            headers={"X-Accel-Buffering": "no"},
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error processing annotation {md5_checksum}: {e}")

def get_annotation_errors(offset_param=0, limit_param=20):
    try:
        errors = AnnotationError.objects()
        count = errors.count()
        offset, limit = params_helper.handle_pagination_params(offset_param, limit_param, count)
        return response_helper.json_response_with_pagination(errors, count, offset, limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching annotation errors: {e}")

def get_gene_stats_summary(commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get gene stats summary with specific structure for coding, non_coding, and pseudogene categories
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_gene_stats_summary(annotations)
    
def get_gene_category_details(category: str, commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get details for a specific gene category
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_gene_category_details(category, annotations)

def get_gene_category_metric_values(category: str, metric: str, include_annotations: bool = False, commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get raw values for a specific metric in a specific gene category
    """

    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_gene_category_metric_values(category, metric, annotations, include_annotations)


def get_transcript_stats_summary(commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get transcript stats summary: types, occurrences, and aggregated statistics
    Optimized to use MongoDB aggregation for grouping and calculations instead of Python
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_transcript_stats_summary(annotations)


def get_transcript_type_details(transcript_type: str, commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get details for a specific transcript type
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_transcript_type_details(transcript_type, annotations)

def get_transcript_type_metric_values(transcript_type: str, metric: str, include_annotations: bool = False, commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get raw values for a transcript type & metric
    Returns tuples of (annotation_id, value) for non-empty values,
    and a list of annotation_ids for empty values.
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return feature_stats_helper.get_transcript_type_metric_values(transcript_type, metric, annotations, include_annotations)


def get_busco_stats_summary(commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get busco stats summary: metrics (complete, single_copy, duplicated, fragmented, missing)
    with mean and counts. No categories.
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return busco_stats_helper.get_busco_stats_summary(annotations)


def get_busco_metric_values(metric: str, include_annotations: bool = False, commons: Dict[str, Any] = None, payload: Dict[str, Any] = None):
    """
    Get raw values for a single busco metric (for histograms).
    """
    params = params_helper.handle_request_params(commons or {}, payload or {})
    annotations = annotation_helper.get_annotation_records(**params)
    return busco_stats_helper.get_busco_metric_values(metric, annotations, include_annotations)


def get_annotations_aggregates_by_taxon_rank(rank: str):
    """
    Get annotations aggregates by taxon at the given rank. Returns one record per taxon
    at that rank (e.g. ~20 for rank "class") with average coding/non_coding/pseudogene
    counts and annotation count.
    """
    cursor = GenomeAnnotation.objects.aggregate(pipelines_helper.aggregate_by_taxon_pipeline(rank))
    fields = [
        "taxid",
        "taxon_name",
        "annotations_count",
        "avg_coding_genes_count",
        "avg_non_coding_genes_count",
        "avg_pseudogenes_count",

    ]
    values = [[*record.values()] for record in cursor]
    return {
        "fields": fields,
        "rows": values,
    }
