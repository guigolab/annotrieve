import json
import hmac
import hashlib
import os
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

from celery import shared_task
import requests
from db.models import (
    GenomeAnnotation,
    GenomeAssembly,
    Organism,
    TaxonNode,
    UsageRollup,
    UserAnalytics,
)
from jobs.services.usage_path import (
    CAPABILITY_LABELS,
    TOP_N,
    PathClassification,
    classify_path,
)

# Log file path (mounted from nginx container)
API_LOG_PATH = os.getenv("LOCAL_LOGS_PATH", "server/logs") + "/api.log"

# HMAC secret key for fingerprinting IPs (should be set via environment variable)
HMAC_SECRET = os.getenv("IP_FINGERPRINT_SECRET")
if not HMAC_SECRET:
    raise ValueError("IP_FINGERPRINT_SECRET environment variable must be set")

# IP-API.com batch endpoint (free tier: 15 batch requests/minute, up to 100 IPs per batch)
IP_API_BATCH_URL = "http://ip-api.com/batch"
MAX_IPS_PER_BATCH = 90


@dataclass
class IpVisitSummary:
    """Per-IP aggregates while streaming the log (RAM-friendly)."""

    visit_days: Set[date] = field(default_factory=set)
    first_visit: Optional[datetime] = None
    last_visit: Optional[datetime] = None

    def add_visit(self, visit_time: datetime) -> None:
        self.visit_days.add(_visit_utc_date(visit_time))
        if self.first_visit is None or visit_time < self.first_visit:
            self.first_visit = visit_time
        if self.last_visit is None or visit_time > self.last_visit:
            self.last_visit = visit_time

    @property
    def visits_count(self) -> int:
        return len(self.visit_days)


@dataclass
class UsageAgg:
    """In-memory unique-user and request aggregates for the public usage rollup."""

    capability_fps: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))
    capability_requests: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    assembly_fps: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))
    annotation_fps: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))
    taxon_fps: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))


def create_ip_fingerprint(ip: str) -> str:
    """
    Create an HMAC fingerprint of an IP address for privacy.
    Returns a hex-encoded HMAC-SHA256 hash.
    """
    return hmac.new(
        HMAC_SECRET.encode("utf-8"),
        ip.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def parse_log_file(log_path: str) -> Tuple[Dict[str, IpVisitSummary], UsageAgg]:
    """
    Parse the JSON lines log file once.
    Returns (IP -> IpVisitSummary, UsageAgg for capabilities/entities).
    """
    ip_visits: Dict[str, IpVisitSummary] = {}
    usage = UsageAgg()

    if not os.path.exists(log_path):
        print(f"Log file not found: {log_path}")
        return ip_visits, usage

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    log_entry = json.loads(line)
                    ip = log_entry.get("ip")
                    time_str = log_entry.get("time")
                    uri = log_entry.get("uri") or ""

                    if not ip or not time_str:
                        continue

                    visit_time = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
                    if ip not in ip_visits:
                        ip_visits[ip] = IpVisitSummary()
                    ip_visits[ip].add_visit(visit_time)

                    fingerprint = create_ip_fingerprint(ip)
                    classification = classify_path(uri)
                    _accumulate_usage(usage, fingerprint, classification)

                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON on line {line_num}: {e}")
                    continue
                except ValueError as e:
                    print(f"Error parsing datetime on line {line_num}: {e}")
                    continue

    except Exception as e:
        print(f"Error reading log file: {e}")
        raise

    return ip_visits, usage


def _accumulate_usage(usage: UsageAgg, fingerprint: str, classification: PathClassification) -> None:
    cap = classification.capability if classification.capability in CAPABILITY_LABELS else "other"
    usage.capability_fps[cap].add(fingerprint)
    usage.capability_requests[cap] += 1

    if not classification.entity_kind or not classification.entity_id:
        return
    if classification.entity_kind == "assembly":
        usage.assembly_fps[classification.entity_id].add(fingerprint)
    elif classification.entity_kind == "annotation":
        usage.annotation_fps[classification.entity_id].add(fingerprint)
    elif classification.entity_kind == "taxon":
        usage.taxon_fps[classification.entity_id].add(fingerprint)


def _top_n_from_fps(fps_map: Dict[str, Set[str]], n: int = TOP_N) -> List[Tuple[str, int]]:
    ranked = sorted(
        ((entity_id, len(fps)) for entity_id, fps in fps_map.items() if fps),
        key=lambda item: (-item[1], item[0]),
    )
    return ranked[:n]


def _enrich_assemblies(ranked: List[Tuple[str, int]]) -> List[dict]:
    if not ranked:
        return []
    ids = [entity_id for entity_id, _ in ranked]
    docs = {
        a.assembly_accession: a
        for a in GenomeAssembly.objects(assembly_accession__in=ids).only(
            "assembly_accession", "assembly_name", "organism_name"
        )
    }
    out = []
    for entity_id, unique_users in ranked:
        doc = docs.get(entity_id)
        label = (doc.assembly_name if doc and doc.assembly_name else entity_id)
        out.append(
            {
                "id": entity_id,
                "unique_users": unique_users,
                "label": label,
                "organism_name": doc.organism_name if doc else None,
            }
        )
    return out


def _enrich_annotations(ranked: List[Tuple[str, int]]) -> List[dict]:
    if not ranked:
        return []
    ids = [entity_id for entity_id, _ in ranked]
    docs = {
        a.annotation_id: a
        for a in GenomeAnnotation.objects(annotation_id__in=ids).only(
            "annotation_id",
            "organism_name",
            "assembly_accession",
            "assembly_name",
            "source_file_info",
        )
    }
    out = []
    for entity_id, unique_users in ranked:
        doc = docs.get(entity_id)
        provider = None
        database = None
        if doc and doc.source_file_info is not None:
            provider = getattr(doc.source_file_info, "provider", None)
            database = getattr(doc.source_file_info, "database", None)
        organism = doc.organism_name if doc else None
        label = organism or entity_id[:12]
        if database:
            label = f"{label} ({database})"
        out.append(
            {
                "id": entity_id,
                "unique_users": unique_users,
                "label": label,
                "organism_name": organism,
                "assembly_accession": doc.assembly_accession if doc else None,
                "provider": provider,
                "database": database,
            }
        )
    return out


def _enrich_taxons(ranked: List[Tuple[str, int]]) -> List[dict]:
    if not ranked:
        return []
    ids = [entity_id for entity_id, _ in ranked]
    taxon_docs = {
        t.taxid: t
        for t in TaxonNode.objects(taxid__in=ids).only("taxid", "scientific_name", "rank")
    }
    organism_docs = {
        o.taxid: o
        for o in Organism.objects(taxid__in=ids).only("taxid", "organism_name", "common_name")
    }
    out = []
    for entity_id, unique_users in ranked:
        taxon = taxon_docs.get(entity_id)
        organism = organism_docs.get(entity_id)
        label = None
        if taxon and taxon.scientific_name:
            label = taxon.scientific_name
        elif organism:
            label = organism.common_name or organism.organism_name
        out.append(
            {
                "id": entity_id,
                "unique_users": unique_users,
                "label": label or f"taxid {entity_id}",
                "rank": taxon.rank if taxon else None,
            }
        )
    return out


def build_and_save_usage_rollup(usage: UsageAgg) -> UsageRollup:
    by_capability = {
        cap: len(fps) for cap, fps in usage.capability_fps.items() if fps
    }
    # Ensure all known capabilities appear (zeros omitted is fine; UI can fill labels)
    by_capability_requests = dict(usage.capability_requests)

    top_assemblies = _enrich_assemblies(_top_n_from_fps(usage.assembly_fps))
    top_annotations = _enrich_annotations(_top_n_from_fps(usage.annotation_fps))
    top_taxons = _enrich_taxons(_top_n_from_fps(usage.taxon_fps))

    as_of = datetime.now(timezone.utc)
    rollup = UsageRollup.objects(key="latest").first()
    if rollup is None:
        rollup = UsageRollup(key="latest")
    rollup.as_of = as_of
    rollup.by_capability = by_capability
    rollup.by_capability_requests = by_capability_requests
    rollup.top_assemblies = top_assemblies
    rollup.top_annotations = top_annotations
    rollup.top_taxons = top_taxons
    rollup.save()
    return rollup


def get_countries_for_ips(ip_list: List[str]) -> Dict[str, str]:
    """
    Fetch country information for a batch of IP addresses using ip-api.com POST API.
    Returns a dictionary mapping IP -> country name.
    """
    if not ip_list:
        return {}

    if len(ip_list) > MAX_IPS_PER_BATCH:
        raise ValueError(f"Too many IPs in batch: {len(ip_list)} (max: {MAX_IPS_PER_BATCH})")

    countries = {}

    try:
        response = requests.post(
            IP_API_BATCH_URL,
            json=ip_list,
            params={"fields": "country"},
            timeout=10,
        )

        if response.status_code == 200:
            results = response.json()
            for i, result in enumerate(results):
                if i < len(ip_list):
                    ip = ip_list[i]
                    if isinstance(result, dict):
                        countries[ip] = result.get("country", "Unknown")
                    else:
                        countries[ip] = "Unknown"
        elif response.status_code == 422:
            print(f"Error: Too many IPs in batch (422). Batch size: {len(ip_list)}")
            for ip in ip_list:
                countries[ip] = get_single_ip_country(ip)
        else:
            print(f"Error from ip-api.com: {response.status_code} - {response.text}")
            for ip in ip_list:
                countries[ip] = "Unknown"

    except requests.exceptions.RequestException as e:
        print(f"Error fetching country data: {e}")
        for ip in ip_list:
            countries[ip] = "Unknown"

    return countries


def get_single_ip_country(ip: str) -> str:
    """
    Fallback: Fetch country for a single IP using GET request.
    """
    try:
        response = requests.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "country"},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("country", "Unknown")
    except Exception as e:
        print(f"Error fetching country for {ip}: {e}")
    return "Unknown"


def _visit_utc_date(visit_time: datetime) -> date:
    """Calendar day (UTC) for a log timestamp."""
    if visit_time.tzinfo is not None:
        return visit_time.astimezone(timezone.utc).date()
    return visit_time.date()


def summary_from_agg(agg: IpVisitSummary) -> Tuple[datetime, datetime, int]:
    """Return first_visit, last_visit, and distinct UTC day count from an aggregate."""
    if agg.first_visit is None or agg.last_visit is None:
        raise ValueError("IpVisitSummary must have at least one visit")
    return agg.first_visit, agg.last_visit, agg.visits_count


def update_user_stats(
    ip: str,
    summary: IpVisitSummary,
    *,
    country: Optional[str] = None,
):
    """
    Update or create UserAnalytics document for an IP address.

    For new users, pass country (from ip-api). For existing users, country is
    left unchanged; visit stats are recomputed from the full log summary.
    """
    fingerprint = create_ip_fingerprint(ip)
    first_visit, last_visit, visits_count = summary_from_agg(summary)

    user = UserAnalytics.objects(fingerprint=fingerprint).first()

    if user:
        user.first_visit = first_visit
        user.last_visit = last_visit
        user.visits_count = visits_count
        user.save()
    else:
        if not country:
            raise ValueError("country is required when creating a new UserAnalytics record")
        UserAnalytics(
            fingerprint=fingerprint,
            country=country,
            first_visit=first_visit,
            last_visit=last_visit,
            visits_count=visits_count,
        ).save()


@shared_task(name="track_unique_users_by_country", ignore_result=False)
def track_unique_users_by_country():
    """
    Read the entire API log file, extract unique IPs, and store/update user analytics
    plus a public UsageRollup (capabilities + top opened entities).

    Per IP (fingerprint):
    - visits_count: distinct UTC calendar days with at least one API request
    - first_visit / last_visit from the log
    - country: set on first insert via ip-api.com; preserved on subsequent runs
    """
    print("Starting track_unique_users_by_country job...")

    print(f"Reading log file: {API_LOG_PATH}")
    ip_summaries, usage_agg = parse_log_file(API_LOG_PATH)

    if not ip_summaries:
        print("No IP addresses found in log file")
        return

    print(f"Found {len(ip_summaries)} unique IP addresses")

    existing_fingerprints = set(UserAnalytics.objects.distinct("fingerprint"))

    new_ips = [
        ip for ip in ip_summaries
        if create_ip_fingerprint(ip) not in existing_fingerprints
    ]
    existing_ips_skipped_geo = len(ip_summaries) - len(new_ips)

    print(
        f"Geolocating {len(new_ips)} new IPs "
        f"({existing_ips_skipped_geo} existing IPs skip ip-api)"
    )

    ip_to_country: Dict[str, str] = {}
    if new_ips:
        batches = [
            new_ips[i : i + MAX_IPS_PER_BATCH]
            for i in range(0, len(new_ips), MAX_IPS_PER_BATCH)
        ]
        for batch_idx, batch in enumerate(batches, 1):
            print(f"Geolocation batch {batch_idx}/{len(batches)} ({len(batch)} IPs)...")
            ip_to_country.update(get_countries_for_ips(batch))
            if batch_idx < len(batches):
                time.sleep(2)

    total_processed = 0
    for ip, summary in ip_summaries.items():
        fingerprint = create_ip_fingerprint(ip)
        if fingerprint in existing_fingerprints:
            update_user_stats(ip, summary)
        else:
            update_user_stats(
                ip,
                summary,
                country=ip_to_country.get(ip, "Unknown"),
            )
        total_processed += 1

    print("Building usage rollup (capabilities + top entities)...")
    rollup = build_and_save_usage_rollup(usage_agg)
    print(
        f"Usage rollup saved. capabilities={len(rollup.by_capability or {})} "
        f"assemblies={len(rollup.top_assemblies or [])} "
        f"annotations={len(rollup.top_annotations or [])} "
        f"taxons={len(rollup.top_taxons or [])}"
    )

    print(f"Job completed. Processed {total_processed} unique IP addresses")
    return {
        "processed": total_processed,
        "unique_ips": len(ip_summaries),
        "new_ips_geolocated": len(new_ips),
        "existing_ips_skipped_geo": existing_ips_skipped_geo,
        "rollup_as_of": rollup.as_of.isoformat() if rollup.as_of else None,
    }
