import json
import hmac
import hashlib
import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

from celery import shared_task
import requests
from db.models import UserAnalytics

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


def create_ip_fingerprint(ip: str) -> str:
    """
    Create an HMAC fingerprint of an IP address for privacy.
    Returns a hex-encoded HMAC-SHA256 hash.
    """
    return hmac.new(
        HMAC_SECRET.encode('utf-8'),
        ip.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def parse_log_file(log_path: str) -> Dict[str, IpVisitSummary]:
    """
    Parse the JSON lines log file and aggregate visits per IP.
    Returns a dictionary mapping IP -> IpVisitSummary (UTC day set + min/max timestamps).
    """
    ip_visits: Dict[str, IpVisitSummary] = {}

    if not os.path.exists(log_path):
        print(f"Log file not found: {log_path}")
        return ip_visits

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    log_entry = json.loads(line)
                    ip = log_entry.get('ip')
                    time_str = log_entry.get('time')

                    if not ip or not time_str:
                        continue

                    visit_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    if ip not in ip_visits:
                        ip_visits[ip] = IpVisitSummary()
                    ip_visits[ip].add_visit(visit_time)

                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON on line {line_num}: {e}")
                    continue
                except ValueError as e:
                    print(f"Error parsing datetime on line {line_num}: {e}")
                    continue

    except Exception as e:
        print(f"Error reading log file: {e}")
        raise

    return ip_visits


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
            params={'fields': 'country'},
            timeout=10
        )

        if response.status_code == 200:
            results = response.json()
            for i, result in enumerate(results):
                if i < len(ip_list):
                    ip = ip_list[i]
                    if isinstance(result, dict):
                        countries[ip] = result.get('country', 'Unknown')
                    else:
                        countries[ip] = 'Unknown'
        elif response.status_code == 422:
            print(f"Error: Too many IPs in batch (422). Batch size: {len(ip_list)}")
            for ip in ip_list:
                countries[ip] = get_single_ip_country(ip)
        else:
            print(f"Error from ip-api.com: {response.status_code} - {response.text}")
            for ip in ip_list:
                countries[ip] = 'Unknown'

    except requests.exceptions.RequestException as e:
        print(f"Error fetching country data: {e}")
        for ip in ip_list:
            countries[ip] = 'Unknown'

    return countries


def get_single_ip_country(ip: str) -> str:
    """
    Fallback: Fetch country for a single IP using GET request.
    """
    try:
        response = requests.get(
            f"http://ip-api.com/json/{ip}",
            params={'fields': 'country'},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            return data.get('country', 'Unknown')
    except Exception as e:
        print(f"Error fetching country for {ip}: {e}")
    return 'Unknown'


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


@shared_task(name='track_unique_users_by_country', ignore_result=False)
def track_unique_users_by_country():
    """
    Read the entire API log file, extract unique IPs, and store/update user analytics.

    This job processes the entire log file each time it runs. Per IP (fingerprint):
    - visits_count: distinct UTC calendar days with at least one API request
    - first_visit: timestamp of the earliest request in the log
    - last_visit: timestamp of the latest request in the log
    - country: set on first insert via ip-api.com; preserved on subsequent runs

    Since the log file grows continuously, each run reflects all activity up to that point.
    """
    print("Starting track_unique_users_by_country job...")

    print(f"Reading log file: {API_LOG_PATH}")
    ip_summaries = parse_log_file(API_LOG_PATH)

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
            new_ips[i:i + MAX_IPS_PER_BATCH]
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
                country=ip_to_country.get(ip, 'Unknown'),
            )
        total_processed += 1

    print(f"Job completed. Processed {total_processed} unique IP addresses")
    return {
        "processed": total_processed,
        "unique_ips": len(ip_summaries),
        "new_ips_geolocated": len(new_ips),
        "existing_ips_skipped_geo": existing_ips_skipped_geo,
    }
