from fastapi import APIRouter, Depends, Body, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
from celery.result import AsyncResult

from services import annotations_service
from services import upload_gff_service
from helpers import parameters as params_helper
from helpers import query_visitors as query_visitors_helper
from celery_app.celery_worker import app as celery_app

router = APIRouter()

@router.get("/annotations")
@router.post("/annotations")
async def get_annotations(commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get annotations metadata
    """
    params = params_helper.handle_request_params(commons, payload)
    
    return annotations_service.get_annotations(params)

# @router.get("/annotations/download")
# @router.post("/annotations/download")
# async def download_async(background_tasks: BackgroundTasks, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
#     """
#     Download annotations
#     """
#     params = params_helper.handle_request_params(commons, payload)
#     return annotations_service.get_annotations(params, response_type='tar', background_tasks=background_tasks)

@router.get("/annotations/report")
@router.post("/annotations/report")
async def get_annotations_report(commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get annotations report
    """
    params = params_helper.handle_request_params(commons, payload)
    return annotations_service.get_annotations(params, response_type='tsv')

@router.get("/annotations/frequencies")
async def get_frequency_fields():
    """
    Get allowed fields for frequencies endpoint
    """
    return {"fields": list(query_visitors_helper.ALLOWED_FIELDS_MAP.keys())}

@router.get("/annotations/frequencies/{field}")
@router.post("/annotations/frequencies/{field}")
async def get_annotations_frequencies(field: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get annotations frequencies for a given field
    """
    params = params_helper.handle_request_params(commons, payload)
    
    return annotations_service.get_annotations(params, response_type='frequencies', field=field)

@router.get("/annotations/errors")
async def get_annotation_errors(offset: int = 0, limit: int = 20):
    """
    Get annotation errors
    """
    return annotations_service.get_annotation_errors(offset, limit)

@router.get("/annotations/aggregates/taxons")
async def get_annotations_aggregates_by_taxon_rank(rank: str):
    """
    Get annotations aggregates, group by a given field (for the moment only taxon), rank and fields. Fields are comma separated list of dot-notation fields to include in the aggregation.
    """
    return annotations_service.get_annotations_aggregates_by_taxon_rank(rank)

@router.get("/annotations/gene-stats")
@router.post("/annotations/gene-stats")
async def get_gene_stats(commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get gene stats summary with aggregated statistics across all categories.
    
    Returns:
    - total_annotations: Total number of annotations in queryset
    - summary.genes: Aggregated stats for each category (coding, non_coding, pseudogene)
    - categories: List of available gene categories
    - metrics: List of available metrics
    """
    return annotations_service.get_gene_stats_summary(commons, payload)

@router.get("/annotations/gene-stats/{category}")
@router.post("/annotations/gene-stats/{category}")
async def get_gene_category_details(category: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get detailed statistics for a specific gene category.
    
    Returns:
    - category: The gene category name
    - annotations_count: Number of annotations with this category
    - missing_annotations_count: Number of annotations missing this category
    - summary: Aggregated statistics (mean, median) for all metrics
    - metrics: List of metrics available for this category
    """
    return annotations_service.get_gene_category_details(category, commons, payload)

@router.get("/annotations/gene-stats/{category}/{metric}")
@router.post("/annotations/gene-stats/{category}/{metric}")
async def get_gene_category_metric_values(category: str, metric: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get raw values for a specific metric in a specific gene category (for plotting histograms).
    
    Parameters:
    - include_annotations: If True, include annotation_ids list (default: False). Can be passed as query param or in payload.
    
    Returns:
    - category: The gene category name
    - metric: The metric name
    - values: List of values (ordered by annotation_id)
    - annotation_ids: List of annotation_ids (only if include_annotations=True, ordered to match values)
    """
    # Extract include_annotations from payload (preferred) or query params
    include_annotations = False
    if payload and 'include_annotations' in payload:
        include_annotations = payload.pop('include_annotations')
        include_annotations = params_helper.format_boolean_param(include_annotations)
    elif commons and 'include_annotations' in commons:
        include_annotations = commons.pop('include_annotations')
        include_annotations = params_helper.format_boolean_param(include_annotations)
    
    return annotations_service.get_gene_category_metric_values(category, metric, include_annotations, commons, payload)

@router.get("/annotations/transcript-stats")
@router.post("/annotations/transcript-stats")
async def get_transcript_stats(commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get transcript stats summary with aggregated statistics across all types.
    
    Returns:
    - total_annotations: Total number of annotations in queryset
    - summary.types: Aggregated stats for each transcript type
    - types: List of available transcript types
    - metrics: List of available metrics
    """
    return annotations_service.get_transcript_stats_summary(commons, payload)

@router.get("/annotations/transcript-stats/{type}")
@router.post("/annotations/transcript-stats/{type}")
async def get_transcript_type_details(type: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get detailed statistics for a specific transcript type.
    
    Returns:
    - type: The transcript type name
    - annotations_count: Number of annotations with this type
    - missing_annotations_count: Number of annotations missing this type
    - summary: Aggregated statistics (mean, median) for all metrics
    - metrics: List of metrics available for this type
    """
    return annotations_service.get_transcript_type_details(type, commons, payload)

@router.get("/annotations/transcript-stats/{type}/{metric}")
@router.post("/annotations/transcript-stats/{type}/{metric}")
async def get_transcript_type_metric_values(type: str, metric: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get raw values for a specific metric in a specific transcript type (for plotting histograms).
    
    Parameters:
    - include_annotations: If True, include annotation_ids list (default: False). Can be passed as query param or in payload.
    
    Returns:
    - type: The transcript type name
    - metric: The metric name
    - values: List of values (ordered by annotation_id)
    - annotation_ids: List of annotation_ids (only if include_annotations=True, ordered to match values)
    """
    # Extract include_annotations from payload (preferred) or query params
    include_annotations = False
    if payload and 'include_annotations' in payload:
        #pop payload['include_annotations']
        include_annotations = payload.pop('include_annotations')
        include_annotations = params_helper.format_boolean_param(include_annotations)
    elif commons and 'include_annotations' in commons:
        include_annotations = commons.pop('include_annotations')
        include_annotations = params_helper.format_boolean_param(include_annotations)
    
    return annotations_service.get_transcript_type_metric_values(type, metric, include_annotations, commons, payload)


@router.get("/annotations/busco-stats")
@router.post("/annotations/busco-stats")
async def get_busco_stats(commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get busco stats summary with aggregated statistics for metrics only (no categories).
    
    Returns:
    - total_annotations: Total number of annotations in queryset
    - summary: Per-metric stats (complete, single_copy, duplicated, fragmented, missing) with mean, annotations_count, missing_annotations_count
    - metrics: List of available metrics
    """
    return annotations_service.get_busco_stats_summary(commons, payload)


@router.get("/annotations/busco-stats/{metric}")
@router.post("/annotations/busco-stats/{metric}")
async def get_busco_metric_values(metric: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    """
    Get raw values for a specific busco metric (for plotting histograms).
    
    Parameters:
    - include_annotations: If True, include annotation_ids list (default: False). Can be passed as query param or in payload.
    
    Returns:
    - metric: The metric name
    - values: List of values (ordered by annotation_id)
    - annotation_ids: List of annotation_ids (only if include_annotations=True, ordered to match values)
    """
    include_annotations = False
    if payload and "include_annotations" in payload:
        include_annotations = payload.pop("include_annotations")
        include_annotations = params_helper.format_boolean_param(include_annotations)
    elif commons and "include_annotations" in commons:
        include_annotations = commons.pop("include_annotations")
        include_annotations = params_helper.format_boolean_param(include_annotations)
    return annotations_service.get_busco_metric_values(metric, include_annotations, commons, payload)


@router.get("/annotations/{md5_checksum}")
async def get_annotation(md5_checksum: str):
    """
    Get annotation metadata
    """
    return annotations_service.get_annotation_metadata(md5_checksum)

@router.get("/annotations/{md5_checksum}/gff")
async def stream_annotation_gff(md5_checksum: str, commons: Dict[str, Any] = Depends(params_helper.common_params)):
    """
    Get GFF of an annotation file
    """
    return annotations_service.stream_annotation_tabix(md5_checksum, **commons)

@router.get("/annotations/{md5_checksum}/contigs")
async def get_contigs(md5_checksum: str):
    """
    Get contigs of an annotation file, as in pysam.contigs(). Returns a stream of contigs
    """
    return annotations_service.get_contigs(md5_checksum)

@router.get("/annotations/{md5_checksum}/contigs/aliases")
async def get_mapped_regions(md5_checksum: str, offset: int = 0, limit: int = 20):
    """
    Get mapped (assembled-molecules in INSDC) regions of an annotation file, seqid to sequence alias
    """
    return annotations_service.get_mapped_regions(md5_checksum, offset, limit)


@router.post("/annotations/upload-gff")
async def upload_gff(
    request: Request,
    file: UploadFile = File(...),
    custom_name: str = Form(...),
):
    """
    Upload a custom GFF/GFF3 file and enqueue a background job to compute
    feature summary and statistics.
    """
    client_ip = request.headers.get("x-forwarded-for", request.client.host) if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    return await upload_gff_service.enqueue_upload_gff_job(
        ip=client_ip,
        user_agent=user_agent,
        file=file,
        custom_name=custom_name,
    )


@router.get("/annotations/upload-gff/jobs/{task_id}")
async def get_upload_gff_job_status(task_id: str):
    """
    Get the status of a custom GFF upload job.
    """
    result = AsyncResult(task_id, app=celery_app)
    response: Dict[str, Any] = {"task_id": task_id}

    # Prefer ready() so clients see SUCCESS/FAILURE even if meta state is stale.
    no_store = {"Cache-Control": "no-store"}
    if result.ready():
        if result.successful():
            response["state"] = "SUCCESS"
            response["result"] = result.result
        else:
            response["state"] = "FAILURE"
            response["error"] = str(result.result)
        return JSONResponse(content=response, headers=no_store)

    state = result.state or "PENDING"
    response["state"] = state
    if state == "PROGRESS" and result.info:
        response["meta"] = result.info
    return JSONResponse(content=response, headers={"Cache-Control": "no-store"})


@router.get("/annotations/upload-gff/rate-limit")
async def get_upload_gff_rate_limit(request: Request):
    """
    Get the current upload rate-limit status for the calling client.
    """
    client_ip = request.headers.get("x-forwarded-for", request.client.host) if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    return JSONResponse(
        content=upload_gff_service.get_rate_limit_status(client_ip, user_agent),
        headers={"Cache-Control": "no-store"},
    )

