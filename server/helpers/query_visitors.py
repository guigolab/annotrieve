from mongoengine.queryset.visitor import Q
from fastapi import HTTPException
from mongoengine.queryset import QuerySet

NO_VALUE_KEY = "no_value"

def taxonomic_query(filter):
    return (Q(taxid__iexact=filter) | 
            Q(taxid__icontains=filter) |
            Q(organism_name__iexact=filter) | 
            Q(organism_name__icontains=filter))

def taxon_query(filter):
    return (Q(taxid__iexact=filter) | Q(taxid__icontains=filter)) | (Q(scientific_name__iexact=filter) | Q(scientific_name__icontains=filter))

def organism_query(filter):
    return taxonomic_query(filter) | (Q(common_name__iexact=filter) | Q(common_name__icontains=filter))

def assembly_query(filter):
    return taxonomic_query(filter) | (
            Q(assembly_name__iexact=filter) | 
            Q(assembly_name__icontains=filter)
        ) | (
            Q(assembly_accession__iexact=filter) | 
            Q(assembly_accession__icontains=filter)
        )

def annotation_query(filter):
    return taxonomic_query(filter) | assembly_query(filter)


def bioproject_query(filter):
    return (
        Q(accession__iexact=filter) |
        Q(accession__icontains=filter) |
        Q(title__iexact=filter) |
        Q(title__icontains=filter)
    )

ALLOWED_FIELDS_MAP = {
    'taxid':'taxid',
    'organism_name':'organism_name',
    'database':'source_file_info.database',
    'release_date':'source_file_info.release_date',
    'assembly_accession':'assembly_accession',
    'assembly_name':'assembly_name',
    'feature_type':'features_summary.types',
    'feature_source':'features_summary.sources',
    'biotype':'features_summary.biotypes',
    'pipeline':'source_file_info.pipeline.name',
    'provider':'source_file_info.provider',
    'attribute_key':'features_summary.attribute_keys',
    'busco_complete':'busco.complete',
}
ALLOWED_FIELDS_MAP_ASSEMBLY = {
    'organism_name':'organism_name',
    'submitter':'submitter',
    'source_database':'source_database',
    'assembly_level':'assembly_level',
    'refseq_category':'refseq_category',
    'assembly_status':'assembly_status',
    'assembly_type':'assembly_type',
    'bioprojects':'bioprojects',
}

def get_frequencies(items:QuerySet, field:str, type:str = 'annotation'):
    if type == 'annotation':
        allowed_fields_map = ALLOWED_FIELDS_MAP
    elif type == 'assembly':
        allowed_fields_map = ALLOWED_FIELDS_MAP_ASSEMBLY
    else:
        raise HTTPException(status_code=400, detail=f"Type parameter is required and must be one of: annotation, assembly")
    if not field or field not in allowed_fields_map:
        raise HTTPException(status_code=400, detail=f"Field parameter is required and must be one of: {', '.join(allowed_fields_map.keys())}")
    mongo_field = allowed_fields_map[field]
    try:
        # BUSCO completeness: bucket by rounded percentage (0-100); missing/null → no_value
        if field == 'busco_complete':
            pipeline = [
                {
                    "$project": {
                        "bucket": {
                            "$cond": [
                                {"$eq": [{"$ifNull": [f"${mongo_field}", "no_value"]}, "no_value"]},
                                NO_VALUE_KEY,
                                {"$min": [100, {"$max": [0, {"$round": f"${mongo_field}"}]}]}
                            ]
                        },
                        "annotation_id": "$_id"
                    }
                },
                {
                    "$group": {
                        "_id": "$bucket",
                        "count": {"$addToSet": "$annotation_id"}
                    }
                },
                {"$project": {"_id": 1, "count": {"$size": "$count"}}}
            ]
            raw = {}
            for doc in items.aggregate(pipeline):
                raw[doc["_id"]] = int(doc["count"])
            response = {str(i): raw.get(i, 0) for i in range(101)}
            response[NO_VALUE_KEY] = raw.get(NO_VALUE_KEY, 0)
            return response

        # Original pipeline for regular fields
        pipeline = [
            {
                "$project": {
                    "field_value": {
                        "$ifNull": [f"${mongo_field}", f"{NO_VALUE_KEY}"]
                    },
                    "annotation_id": "$_id"  # Keep track of unique annotations
                }
            },
            {"$unwind": "$field_value"},
            {
                "$group": {
                    "_id": "$field_value",
                    "count": {"$addToSet": "$annotation_id"}  # Count unique annotations
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "count": {"$size": "$count"}  # Get the size of unique annotation IDs
                }
            }
        ]

        response = {
            str(doc["_id"]): int(doc["count"])
            for doc in sorted(items.aggregate(pipeline), key=lambda x: x["count"], reverse=True)
        }

        sorted_response = {key: value for key, value in sorted(response.items(), key=lambda item: item[1], reverse=True)} #sort desc by value
        return sorted_response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {e}")
