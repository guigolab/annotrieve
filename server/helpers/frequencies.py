"""Field-value frequency counts via aggregation (replaces MapReduce item_frequencies)."""


def item_frequencies(queryset, field: str) -> dict:
    """Count distinct values of `field` via $group (replaces MapReduce item_frequencies)."""
    pipeline = [
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
    ]
    return {
        (doc["_id"] if doc["_id"] is not None else None): int(doc["count"])
        for doc in queryset.aggregate(*pipeline)
    }
