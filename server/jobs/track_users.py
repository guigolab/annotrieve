import json
import hmac
import hashlib
import os
import time
from datetime import date, datetime, timezone
from typing import Dict, List, Tuple
from collections import defaultdict

from celery import shared_task
import requests
from db.models import UserAnalytics 

# Log file path (mounted from nginx container)
API_LOG_PATH = os.getenv("LOCAL_LOGS_PATH", "server/logs") + "/api.log"

# HMAC secret key for fingerprinting IPs (should be set via environment variable)
HMAC_SECRET = os.getenv("IP_FINGERPRINT_SECRET")
if not HMAC_SECRET:
    raise ValueError("IP_FINGERPRINT_SECRET environment variable must be set")

# IP-API.com batch endpoint
IP_API_BATCH_URL = "http://ip-api.com/batch"
MAX_IPS_PER_BATCH = 90


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


def parse_log_file(log_path: str) -> Dict[str, List[datetime]]:
    """
    Parse the JSON lines log file and extract IP addresses with their visit times.
    Returns a dictionary mapping IP -> list of visit datetimes.
    """
    ip_visits = defaultdict(list)
    
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
                    
                    # Parse ISO 8601 datetime
                    visit_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                    ip_visits[ip].append(visit_time)
                    
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
        # Prepare POST request body (simple array of IP strings)
        response = requests.post(
            IP_API_BATCH_URL,
            json=ip_list,
            params={'fields': 'country'},  # Only fetch country to minimize response size
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
            # Fallback: try individual requests for this batch
            for ip in ip_list:
                countries[ip] = get_single_ip_country(ip)
        else:
            print(f"Error from ip-api.com: {response.status_code} - {response.text}")
            # Fallback: mark all as Unknown
            for ip in ip_list:
                countries[ip] = 'Unknown'
                
    except requests.exceptions.RequestException as e:
        print(f"Error fetching country data: {e}")
        # Fallback: mark all as Unknown
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


def summarize_daily_visits(visit_times: List[datetime]) -> Tuple[datetime, datetime, int]:
    """
    Collapse many API requests into daily visit stats.

    - visits_count: distinct UTC calendar days with at least one request
    - first_visit: earliest request timestamp (oldest active day)
    - last_visit: latest request timestamp (most recent active day)
    """
    if not visit_times:
        raise ValueError("visit_times must not be empty")

    distinct_days = {_visit_utc_date(t) for t in visit_times}
    return min(visit_times), max(visit_times), len(distinct_days)


def update_user_stats(ip: str, country: str, visit_times: List[datetime]):
    """
    Update or create UserAnalytics document for an IP address.
    """
    fingerprint = create_ip_fingerprint(ip)
    first_visit, last_visit, visits_count = summarize_daily_visits(visit_times)

    user = UserAnalytics.objects(fingerprint=fingerprint).first()

    if user:
        user.first_visit = first_visit
        user.last_visit = last_visit
        user.visits_count = visits_count
        user.country = country
        user.save()
    else:
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
    Read the entire API log file, extract unique IPs, get their countries via ip-api.com,
    and store/update user analytics by country.
    
    This job processes the entire log file each time it runs. Per IP (fingerprint):
    - visits_count: distinct UTC calendar days with at least one API request (not raw request count)
    - first_visit: timestamp of the earliest request in the log
    - last_visit: timestamp of the latest request in the log
    - country: updated (handles geolocation database corrections)

    Since the log file grows continuously, each run reflects all activity up to that point.
    """
    print("Starting track_unique_users_by_country job...")
    
    # Parse log file to get IP visits
    print(f"Reading log file: {API_LOG_PATH}")
    ip_visits = parse_log_file(API_LOG_PATH)
    
    if not ip_visits:
        print("No IP addresses found in log file")
        return
    
    print(f"Found {len(ip_visits)} unique IP addresses")
    
    # Process IPs in batches of 100 for geolocation API
    ip_list = list(ip_visits.keys())
    batches = [ip_list[i:i + MAX_IPS_PER_BATCH] for i in range(0, len(ip_list), MAX_IPS_PER_BATCH)]
    
    total_processed = 0
    
    for batch_idx, batch in enumerate(batches, 1):
        print(f"Processing batch {batch_idx}/{len(batches)} ({len(batch)} IPs)...")
        
        # Get countries for this batch
        ip_to_country = get_countries_for_ips(batch)
        
        # Update database for each IP in the batch
        for ip in batch:
            country = ip_to_country.get(ip, 'Unknown')
            visit_times = ip_visits[ip]
            update_user_stats(ip, country, visit_times)
            total_processed += 1
        
        # Rate limiting: ip-api.com free tier allows 45 requests per minute
        # Since we're using batch API (1 request per 100 IPs), we can be more aggressive
        # But still add a small delay between batches to be safe
        if batch_idx < len(batches):
            time.sleep(2)  # 2 second delay between batches
    
    print(f"Job completed. Processed {total_processed} unique IP addresses")
    return {"processed": total_processed, "unique_ips": len(ip_visits)}
