from fastapi import APIRouter, Query
from services import analytics_service

router = APIRouter()


@router.get("/analytics/frequencies/country")
async def get_country_frequencies():
    """
    Get frequency counts of unique users by country.

    Returns a dictionary mapping country names to the count of unique users per country.
    Each user is identified by a unique fingerprint (HMAC hash of their IP address).
    """
    return analytics_service.get_country_frequencies()


@router.get("/analytics/top-visitors")
async def get_top_visitors(limit: int = 5):
    """
    Top anonymous visitors by distinct visit days.

    Returns country and visits_count only (no fingerprints or IP data).
    Prefer /analytics/top-countries for public usage UI.
    """
    capped_limit = min(max(limit, 1), 5)
    return analytics_service.get_top_visitors(limit=capped_limit)


@router.get("/analytics/summary")
async def get_usage_summary():
    """
    Public usage hero metrics from UserAnalytics (API-activity users).
    Never returns fingerprints or IPs.
    """
    return analytics_service.get_usage_summary()


@router.get("/analytics/top-countries")
async def get_top_countries(limit: int = Query(default=10, ge=1, le=50)):
    """
    Top countries by unique users (fingerprints), not visit-day counts.
    """
    return analytics_service.get_top_countries(limit=limit)


@router.get("/analytics/capabilities")
async def get_usage_capabilities():
    """
    Product-capability usage from UsageRollup (unique users who touched each bucket).
    Empty items if the daily rollup has not run yet.
    """
    return analytics_service.get_usage_capabilities()


@router.get("/analytics/top-entities")
async def get_top_entities():
    """
    Top-10 opened assemblies, annotations, and taxons by unique users.
    """
    return analytics_service.get_top_entities()
