from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from db.models import UsageRollup, UserAnalytics
from fastapi import HTTPException
from helpers.frequencies import item_frequencies
from jobs.services.usage_path import CAPABILITY_LABELS


def get_country_frequencies() -> Dict[str, int]:
    """
    Get frequency counts of unique users by country.
    """
    try:
        return item_frequencies(UserAnalytics.objects(), "country")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching country frequencies: {e}")


def get_top_visitors(limit: int = 5) -> List[Dict[str, object]]:
    """
    Return top anonymous visitors by distinct visit days (visits_count).
    Kept for backwards compatibility; public /usage uses top-countries instead.
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


def get_usage_summary() -> Dict[str, Any]:
    """
    Live hero metrics from UserAnalytics (API-activity users).
    """
    try:
        unique_users = UserAnalytics.objects.count()
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=30)
        # MongoEngine may store naive UTC; compare with both aware and naive when needed
        active_30d = UserAnalytics.objects(last_visit__gte=cutoff).count()
        if active_30d == 0 and unique_users > 0:
            # Fallback for naive datetimes stored without tzinfo
            active_30d = UserAnalytics.objects(
                last_visit__gte=cutoff.replace(tzinfo=None)
            ).count()

        countries = len(UserAnalytics.objects.distinct("country"))
        returning = UserAnalytics.objects(visits_count__gte=2).count()
        returning_pct = (
            round((returning / unique_users) * 100, 1) if unique_users > 0 else 0.0
        )
        latest = (
            UserAnalytics.objects.order_by("-last_visit")
            .only("last_visit")
            .first()
        )
        as_of = latest.last_visit if latest and latest.last_visit else now
        return {
            "unique_users": unique_users,
            "active_30d": active_30d,
            "countries": countries,
            "returning_pct": returning_pct,
            "as_of": as_of.isoformat() if hasattr(as_of, "isoformat") else str(as_of),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching usage summary: {e}")


def get_top_countries(limit: int = 10) -> List[Dict[str, object]]:
    """Top countries by unique users (fingerprints), not visit-day leaderboard."""
    try:
        freqs = item_frequencies(UserAnalytics.objects(), "country")
        ranked = sorted(
            (
                {"country": country, "unique_users": count}
                for country, count in freqs.items()
                if country and count
            ),
            key=lambda row: (-int(row["unique_users"]), str(row["country"])),
        )
        return ranked[: max(1, min(limit, 50))]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top countries: {e}")


def _rollup_or_none() -> Optional[UsageRollup]:
    return UsageRollup.objects(key="latest").first()


def get_usage_capabilities() -> Dict[str, Any]:
    try:
        rollup = _rollup_or_none()
        if rollup is None:
            return {"items": [], "as_of": None}
        by_cap = rollup.by_capability or {}
        by_req = rollup.by_capability_requests or {}
        items = []
        for cap_id, label in CAPABILITY_LABELS.items():
            unique_users = int(by_cap.get(cap_id, 0) or 0)
            if unique_users <= 0 and cap_id == "other" and not by_cap:
                continue
            if unique_users <= 0:
                continue
            items.append(
                {
                    "id": cap_id,
                    "label": label,
                    "unique_users": unique_users,
                    "request_count": int(by_req.get(cap_id, 0) or 0),
                }
            )
        items.sort(key=lambda row: (-row["unique_users"], row["label"]))
        as_of = rollup.as_of.isoformat() if rollup.as_of else None
        return {"items": items, "as_of": as_of}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching capabilities: {e}")


def get_top_entities() -> Dict[str, Any]:
    try:
        rollup = _rollup_or_none()
        if rollup is None:
            return {
                "top_assemblies": [],
                "top_annotations": [],
                "top_taxons": [],
                "as_of": None,
            }
        as_of = rollup.as_of.isoformat() if rollup.as_of else None
        return {
            "top_assemblies": list(rollup.top_assemblies or [])[:10],
            "top_annotations": list(rollup.top_annotations or [])[:10],
            "top_taxons": list(rollup.top_taxons or [])[:10],
            "as_of": as_of,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching top entities: {e}")
