from db.models import UserAnalytics
from fastapi import HTTPException
from typing import Dict, List


def get_country_frequencies() -> Dict[str, int]:
    """
    Get frequency counts of unique users by country.
    
    Returns a dictionary mapping country names to the count of unique users (fingerprints) per country.
    Since each document represents a unique fingerprint-country combination, we count distinct
    fingerprints per country to get the number of unique users.
    """
    try:
        results = UserAnalytics.objects().item_frequencies('country')
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching country frequencies: {e}")


def get_top_visitors(limit: int = 5) -> List[Dict[str, object]]:
    """
    Return top anonymous visitors by distinct visit days (visits_count).
    Only country and visits_count are exposed; fingerprints are never returned.
    """
    try:
        users = (
            UserAnalytics.objects(visits_count__exists=True, visits_count__gt=0)
            .order_by("-visits_count")
            .limit(limit)
            .only("country", "visits_count")
        )
        return [
            {"country": u.country, "visits_count": u.visits_count}
            for u in users
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top visitors: {e}")
