
from helpers import pipelines as pipelines_helper
from helpers import response as response_helper
from fastapi import HTTPException
import statistics


def get_gene_stats_summary(annotations):
    """
    Get gene stats summary with specific structure for coding, non_coding, and pseudogene categories
    """
    total_annotations = annotations.count()
    # Map output keys to possible database keys (try variations)
    category_mapping = {
        "coding": ["coding", "coding_genes"],
        "non_coding": ["non_coding", "non_coding_genes"],
        "pseudogene": ["pseudogene", "pseudogenes"]
    }
    
    # Get stats for each category
    genes = {}
    
    for output_key, possible_keys in category_mapping.items():
        # Try each possible key until we find one that exists
        results = []
        
        for db_key in possible_keys:
            pipeline = pipelines_helper.gene_category_stats_summary_pipeline(db_key)
            
            results = list(annotations.aggregate(pipeline))
            if results:
                break
        
        # Count annotations with this category
        annotations_count = len(results)
        missing_annotations_count = total_annotations - annotations_count
        
        # Extract values for calculations
        total_count_values = [r["total_count"] for r in results if r.get("total_count") is not None]
        mean_length_values = [r["mean_length"] for r in results if r.get("mean_length") is not None]
        
        # Calculate average count (sum of all counts / annotations with this category)
        # This is the average number of genes of this category per annotation
        total_count_sum = sum(total_count_values)
        average_count = round(total_count_sum / annotations_count, 2) if annotations_count > 0 else None
        
        # Calculate average mean length (sum of all mean lengths / annotations with this category)
        total_length_sum = sum(mean_length_values)
        average_mean_length = round(total_length_sum / annotations_count, 2) if annotations_count > 0 and mean_length_values else None
        
        genes[output_key] = {
            "annotations_count": annotations_count,
            "missing_annotations_count": missing_annotations_count,
            "average_count": average_count,
            "average_mean_length": average_mean_length
        }
    
    return {
        "total_annotations": total_annotations,
        "summary": {
            "genes": genes
        },
        "categories": ["coding", "non_coding", "pseudogene"],
        "metrics": ["total_count", "average_mean_length"]
    }

def get_gene_category_details(category: str, annotations):
    """
    Get details for a specific gene category
    """
    total_annotations = annotations.count()
    # Map output category names to possible database keys
    category_mapping = {
        "coding": ["coding", "coding_genes"],
        "non_coding": ["non_coding", "non_coding_genes"],
        "pseudogene": ["pseudogene", "pseudogenes"]
    }
    
    # Find the actual database key for this category
    db_category = None
    if category in category_mapping:
        for db_key in category_mapping[category]:
            pipeline = pipelines_helper.gene_category_details_pipeline(db_key)
            if list(annotations.aggregate(pipeline)):
                db_category = db_key
                break
    else:
        # Try the category as-is
        pipeline = pipelines_helper.gene_category_details_pipeline(category)
        if list(annotations.aggregate(pipeline)):
            db_category = category
    
    if not db_category:
        raise HTTPException(
            status_code=404,
            detail=f"Gene category '{category}' not found in the queried annotations"
        )
    
    # Get all values for this category
    pipeline = pipelines_helper.gene_category_values_pipeline(db_category)
    
    results = list(annotations.aggregate(pipeline))
    
    total_counts = []
    length_means = []
    
    for result in results:
        cat_data = result.get("category_data")
        if cat_data:
            if cat_data.get("total_count") is not None:
                total_counts.append(cat_data["total_count"])
            if cat_data.get("length_stats"):
                length_stats = cat_data["length_stats"]
                if length_stats.get("mean") is not None:
                    length_means.append(length_stats["mean"])
    
    summary_stats = {}
    if total_counts:
        summary_stats["total_count"] = {
            "mean": round(statistics.mean(total_counts), 2)
        }
    
    if length_means:
        summary_stats["average_mean_length"] = {
            "mean": round(statistics.mean(length_means), 2)
        }
    
    total_annotations = annotations.count()
    missing_annotations_count = total_annotations - len(results)
    
    return {
        "category": category,
        "annotations_count": len(results),
        "missing_annotations_count": missing_annotations_count,
        "summary": summary_stats,
        "metrics": ["total_count", "average_mean_length"]
    }


def get_gene_category_metric_values(category: str, metric: str, annotations, include_annotations: bool = False):
    """
    Get raw values for a specific metric in a specific gene category
    """
    # Validate metric
    valid_metrics = ["total_count", "average_mean_length"]
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric: {metric}. Must be one of: {', '.join(valid_metrics)}"
        )
    
    # Map output category names to possible database keys
    category_mapping = {
        "coding": ["coding", "coding_genes"],
        "non_coding": ["non_coding", "non_coding_genes"],
        "pseudogene": ["pseudogene", "pseudogenes"]
    }
    
    # Find the actual database key for this category
    db_category = None
    if category in category_mapping:
        for db_key in category_mapping[category]:
            pipeline = pipelines_helper.gene_category_details_pipeline(db_key)
            if list(annotations.aggregate(pipeline)):
                db_category = db_key
                break
    else:
        db_category = category
    
    if not db_category:
        raise HTTPException(
            status_code=404,
            detail=f"Gene category '{category}' not found in the queried annotations"
        )
    
    # Build field path - map flattened metric names to database paths
    if metric == "total_count":
        field_path = f"features_statistics.gene_category_stats.{db_category}.total_count"
    elif metric == "average_mean_length":
        field_path = f"features_statistics.gene_category_stats.{db_category}.length_stats.mean"
    else:
        field_path = f"features_statistics.gene_category_stats.{db_category}.{metric}"
    
    return response_helper.metric_values_response(
        annotations, field_path, include_annotations, category=category, metric=metric
    )

def get_transcript_stats_summary(annotations):
    """
    Get transcript stats summary: types, occurrences, and aggregated statistics
    Optimized to use MongoDB aggregation for grouping and calculations instead of Python
    """
    total_annotations = annotations.count()
    
    # Optimized pipeline: use MongoDB $group instead of Python grouping
    # This reduces memory usage and improves performance
    pipeline = pipelines_helper.transcript_stats_summary_pipeline()
    
    results = list(annotations.aggregate(pipeline))
    
    # Process results and build summary
    types_summary = {}
    types_list = []
    has_cds_stats = False
    
    for result in results:
        transcript_type = result.get("type")
        if not transcript_type:
            continue
        
        types_list.append(transcript_type)
        annotations_count = result.get("annotations_count", 0)
        missing_annotations_count = total_annotations - annotations_count
        
        # Calculate averages
        total_count_sum = result.get("total_count_sum", 0)
        average_count = round(total_count_sum / annotations_count, 2) if annotations_count > 0 else None
        
        mean_length_sum = result.get("mean_length_sum", 0)
        mean_length_count = result.get("mean_length_count", 0)
        average_mean_length = round(mean_length_sum / annotations_count, 2) if annotations_count > 0 and mean_length_count > 0 else None
        
        types_summary[transcript_type] = {
            "annotations_count": annotations_count,
            "missing_annotations_count": missing_annotations_count,
            "average_count": average_count,
            "average_mean_length": average_mean_length
        }
        
        # Track if any type has CDS stats
        if result.get("has_cds_stats"):
            has_cds_stats = True
    
    # Build metrics list - CDS metrics only if CDS stats exist
    metrics = [
        "total_count",
        "average_mean_length",
        "associated_genes_total_count",
        "exon_total_count",
        "exon_average_length",
        "exon_average_concatenated_length"
    ]
    
    if has_cds_stats:
        metrics.extend([
            "cds_total_count",
            "cds_average_length",
            "cds_average_concatenated_length"
        ])
    
    return {
        "total_annotations": total_annotations,
        "summary": {
            "types": types_summary
        },
        "types": sorted(types_list),
        "metrics": metrics
    }

def get_transcript_type_details(transcript_type: str, annotations):
    """
    Get details for a specific transcript type
    """
    total_annotations = annotations.count()
    # Check if transcript type exists
    pipeline = pipelines_helper.transcript_type_details_pipeline(transcript_type)
    if not list(annotations.aggregate(pipeline)):
        raise HTTPException(
            status_code=404,
            detail=f"Transcript type '{transcript_type}' not found in the queried annotations"
        )
    
    # Get all values for this transcript type
    pipeline = pipelines_helper.transcript_type_details_values_pipeline(transcript_type)
    
    results = list(annotations.aggregate(pipeline))
    
    # Collect all metric values
    total_counts = []
    length_means = []
    associated_genes_counts = []
    exon_total_counts = []
    exon_length_means = []
    exon_concatenated_length_means = []
    cds_total_counts = []
    cds_length_means = []
    cds_concatenated_length_means = []
    
    for result in results:
        type_data = result.get("type_data")
        if type_data:
            if type_data.get("total_count") is not None:
                total_counts.append(type_data["total_count"])
            if type_data.get("length_stats") and type_data["length_stats"].get("mean") is not None:
                length_means.append(type_data["length_stats"]["mean"])
            if type_data.get("associated_genes") and type_data["associated_genes"].get("total_count") is not None:
                associated_genes_counts.append(type_data["associated_genes"]["total_count"])
            if type_data.get("exon_stats"):
                exon_stats = type_data["exon_stats"]
                if exon_stats.get("total_count") is not None:
                    exon_total_counts.append(exon_stats["total_count"])
                if exon_stats.get("length") and exon_stats["length"].get("mean") is not None:
                    exon_length_means.append(exon_stats["length"]["mean"])
                if exon_stats.get("concatenated_length") and exon_stats["concatenated_length"].get("mean") is not None:
                    exon_concatenated_length_means.append(exon_stats["concatenated_length"]["mean"])
            if type_data.get("cds_stats"):
                cds_stats = type_data["cds_stats"]
                if cds_stats.get("total_count") is not None:
                    cds_total_counts.append(cds_stats["total_count"])
                if cds_stats.get("length") and cds_stats["length"].get("mean") is not None:
                    cds_length_means.append(cds_stats["length"]["mean"])
                if cds_stats.get("concatenated_length") and cds_stats["concatenated_length"].get("mean") is not None:
                    cds_concatenated_length_means.append(cds_stats["concatenated_length"]["mean"])
    
    summary_stats = {}
    if total_counts:
        summary_stats["total_count"] = {
            "mean": round(statistics.mean(total_counts), 2)
        }
    
    if length_means:
        summary_stats["average_mean_length"] = {
            "mean": round(statistics.mean(length_means), 2)
        }
    
    if associated_genes_counts:
        summary_stats["associated_genes_total_count"] = {
            "mean": round(statistics.mean(associated_genes_counts), 2)
        }
    
    if exon_total_counts:
        summary_stats["exon_total_count"] = {
            "mean": round(statistics.mean(exon_total_counts), 2)
        }
    
    if exon_length_means:
        summary_stats["exon_average_length"] = {
            "mean": round(statistics.mean(exon_length_means), 2)
        }
    
    if exon_concatenated_length_means:
        summary_stats["exon_average_concatenated_length"] = {
            "mean": round(statistics.mean(exon_concatenated_length_means), 2)
        }
    
    if cds_total_counts:
        summary_stats["cds_total_count"] = {
            "mean": round(statistics.mean(cds_total_counts), 2)
        }
    
    if cds_length_means:
        summary_stats["cds_average_length"] = {
            "mean": round(statistics.mean(cds_length_means), 2)
        }
    
    if cds_concatenated_length_means:
        summary_stats["cds_average_concatenated_length"] = {
            "mean": round(statistics.mean(cds_concatenated_length_means), 2)
        }
    
    # Build list of available metrics based on what actually exists for this transcript type
    metrics = [
        "total_count",
        "average_mean_length"
    ]
    
    # Add optional metrics only if they exist
    if associated_genes_counts:
        metrics.append("associated_genes_total_count")
    
    if exon_total_counts or exon_length_means or exon_concatenated_length_means:
        metrics.extend(["exon_total_count", "exon_average_length", "exon_average_concatenated_length"])
    
    # Only include CDS metrics if CDS stats exist for this transcript type
    if cds_total_counts or cds_length_means or cds_concatenated_length_means:
        metrics.extend(["cds_total_count", "cds_average_length", "cds_average_concatenated_length"])
    
    total_annotations = annotations.count()
    missing_annotations_count = total_annotations - len(results)
    
    return {
        "type": transcript_type,
        "annotations_count": len(results),
        "missing_annotations_count": missing_annotations_count,
        "summary": summary_stats,
        "metrics": metrics
    }

def get_transcript_type_metric_values(transcript_type: str, metric: str, annotations, include_annotations: bool = False):
    """
    Get raw values for a transcript type & metric
    Returns tuples of (annotation_id, value) for non-empty values,
    and a list of annotation_ids for empty values.
    """
    # Check if transcript type exists and get available metrics
    type_details = get_transcript_type_details(transcript_type, annotations)
    available_metrics = type_details.get("metrics", [])
    
    # Map flattened metric names to database paths
    metric_mapping = {
        "total_count": f"features_statistics.transcript_type_stats.{transcript_type}.total_count",
        "average_mean_length": f"features_statistics.transcript_type_stats.{transcript_type}.length_stats.mean",
        "associated_genes_total_count": f"features_statistics.transcript_type_stats.{transcript_type}.associated_genes.total_count",
        "exon_total_count": f"features_statistics.transcript_type_stats.{transcript_type}.exon_stats.total_count",
        "exon_average_length": f"features_statistics.transcript_type_stats.{transcript_type}.exon_stats.length.mean",
        "exon_average_concatenated_length": f"features_statistics.transcript_type_stats.{transcript_type}.exon_stats.concatenated_length.mean",
        "cds_total_count": f"features_statistics.transcript_type_stats.{transcript_type}.cds_stats.total_count",
        "cds_average_length": f"features_statistics.transcript_type_stats.{transcript_type}.cds_stats.length.mean",
        "cds_average_concatenated_length": f"features_statistics.transcript_type_stats.{transcript_type}.cds_stats.concatenated_length.mean"
    }
    
    # Validate metric exists for this transcript type
    if metric not in available_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Metric '{metric}' is not available for transcript type '{transcript_type}'. Available metrics: {', '.join(available_metrics)}"
        )
    
    if metric not in metric_mapping:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric: {metric}. Must be one of: {', '.join(metric_mapping.keys())}"
        )
    
    field_path = metric_mapping[metric]
    return response_helper.metric_values_response(
        annotations, field_path, include_annotations, type=transcript_type, metric=metric
    )
