from fastapi import HTTPException

def metric_values_response(annotations, field_path: str, include_annotations: bool, **response_extra):
    """
    Run metric_values_pipeline on annotations and return a normalized response with values
    and optionally annotation_ids. When include_annotations is False, only values are loaded
    (no annotation_ids in pipeline or in memory).
    """
    from helpers import pipelines as pipelines_helper
    pipeline = pipelines_helper.metric_values_pipeline(field_path, include_annotation_ids=include_annotations)
    result = list(annotations.aggregate(pipeline))
    raw_values = result[0].get("values", []) if result else []
    if include_annotations:
        if raw_values:
            values = [doc["value"] for doc in raw_values]
            annotation_ids = [doc["annotation_id"] for doc in raw_values]
        else:
            values = []
            annotation_ids = []
        out = {**response_extra, "values": values, "annotation_ids": annotation_ids}
    else:
        values = list(raw_values) if raw_values else []
        out = {**response_extra, "values": values}
    return out


def json_response_with_pagination(items, count, offset, limit):
    """Format response as JSON with pagination."""
    #force offset and limit to be int
    try:
        offset = int(offset)
        limit = int(limit)
    except:
        offset = 0
        limit = 20
    if limit == 0:
        limit = 20 # back to default limit
    elif limit > 1000:
        raise HTTPException(status_code=400, detail="Limit must be less or equal to 1000")
    
    paginated_items = items.skip(offset).limit(limit).exclude('id').as_pymongo()
    return {
        'total': count,
        'offset': offset,
        'limit': limit,
        'results': list(paginated_items)
    }
