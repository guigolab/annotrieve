"""
Busco stats helper: summary and per-metric values for annotations with busco data.
Metrics: complete, single_copy, duplicated, fragmented, missing.
"""

from helpers import pipelines as pipelines_helper
from helpers import response as response_helper
from fastapi import HTTPException

BUSCO_METRICS = ["complete", "single_copy", "duplicated", "fragmented", "missing"]


def get_busco_stats_summary(annotations):
    """
    Get busco stats summary: total_annotations, summary per metric (mean, annotations_count, missing_annotations_count), and metrics list.
    No categories (unlike gene-stats/transcript-stats).
    """
    total_annotations = annotations.count()
    pipeline = pipelines_helper.busco_stats_summary_pipeline()
    results = list(annotations.aggregate(pipeline))

    summary = {}
    if results:
        doc = results[0]
        count_with_busco = doc.get("count", 0)
        missing_count = total_annotations - count_with_busco
        for metric in BUSCO_METRICS:
            avg_key = f"{metric}_avg"
            avg_val = doc.get(avg_key)
            summary[metric] = {
                "annotations_count": count_with_busco,
                "missing_annotations_count": missing_count,
                "mean": round(avg_val, 2) if avg_val is not None else None,
            }
    else:
        missing_count = total_annotations
        for metric in BUSCO_METRICS:
            summary[metric] = {
                "annotations_count": 0,
                "missing_annotations_count": missing_count,
                "mean": None,
            }

    return {
        "total_annotations": total_annotations,
        "summary": summary,
        "metrics": BUSCO_METRICS,
    }


def get_busco_metric_values(metric: str, annotations, include_annotations: bool = False):
    """
    Get raw values for a single busco metric (for histograms).
    Returns metric, values, and optionally annotation_ids.
    """
    if metric not in BUSCO_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric: {metric}. Must be one of: {', '.join(BUSCO_METRICS)}",
        )

    field_path = f"busco.{metric}"
    return response_helper.metric_values_response(
        annotations, field_path, include_annotations, metric=metric
    )
