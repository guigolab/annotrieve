import os
import uuid
from datetime import datetime, timedelta
from typing import Tuple, Dict, Any

from fastapi import HTTPException, UploadFile

from configs.app_settings import settings
from db.models import UploadRateLimit
from jobs.upload_gff import compute_custom_gff_stats


def _get_client_identity(ip: str, user_agent: str) -> Tuple[str, str]:
    return ip or "unknown", user_agent or "unknown"


def get_rate_limit_status(ip: str, user_agent: str) -> Dict[str, Any]:
    """
    Return how many uploads were used in the last 24h and remaining quota.
    """
    ip, user_agent = _get_client_identity(ip, user_agent)
    now = datetime.utcnow()
    window_start = now - timedelta(hours=24)
    used = UploadRateLimit.objects(
        ip=ip,
        user_agent=user_agent,
        created_at__gte=window_start,
    ).count()

    remaining = max(settings.UPLOAD_DAILY_LIMIT - used, 0)
    return {"used": used, "remaining": remaining}


def _enforce_rate_limit(ip: str, user_agent: str) -> Tuple[int, int]:
    """
    Enforce the rolling 24h rate limit, raising HTTPException(429) if exceeded.
    Returns (used, remaining) on success.
    """
    ip, user_agent = _get_client_identity(ip, user_agent)
    now = datetime.utcnow()
    window_start = now - timedelta(hours=24)
    used = UploadRateLimit.objects(
        ip=ip,
        user_agent=user_agent,
        created_at__gte=window_start,
    ).count()

    if used >= settings.UPLOAD_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Daily upload limit reached",
                "remaining": 0,
            },
        )
    remaining = settings.UPLOAD_DAILY_LIMIT - used - 1
    return used + 1, remaining


def _validate_extension(filename: str) -> None:
    lower = filename.lower()
    allowed = (".gff", ".gff3", ".gff.gz", ".gff3.gz")
    if not any(lower.endswith(ext) for ext in allowed):
        raise HTTPException(
            status_code=400,
            detail="Only GFF3 files are supported (.gff, .gff3, .gff.gz, .gff3.gz).",
        )


async def _write_temp_file(upload_uuid: str, uploaded_file: UploadFile) -> str:
    """
    Stream the uploaded file to a temp directory under LOCAL_ANNOTATIONS_DIR.
    Enforces UPLOAD_MAX_BYTES.
    """
    local_annotations_dir = os.getenv("LOCAL_ANNOTATIONS_DIR")
    if not local_annotations_dir:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")

    tmp_root = os.path.join(local_annotations_dir, settings.UPLOAD_TMP_SUBDIR)
    os.makedirs(tmp_root, exist_ok=True)

    tmp_dir = os.path.join(tmp_root, upload_uuid)
    os.makedirs(tmp_dir, exist_ok=True)

    filename = os.path.basename(uploaded_file.filename or f"{upload_uuid}.gff")
    file_path = os.path.join(tmp_dir, filename)

    written = 0
    with open(file_path, "wb") as out_f:
        while True:
            chunk = await uploaded_file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > settings.UPLOAD_MAX_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Uploaded file is too large.",
                )
            out_f.write(chunk)

    if written == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return file_path


async def enqueue_upload_gff_job(
    ip: str,
    user_agent: str,
    file: UploadFile,
    custom_name: str,
) -> Dict[str, Any]:
    """
    Validate and persist the uploaded file, enforce rate limit,
    enqueue the Celery job, and return task metadata.
    """
    if not custom_name or not custom_name.strip():
        raise HTTPException(status_code=400, detail="Custom name is required.")

    _validate_extension(file.filename or "")

    _, remaining = _enforce_rate_limit(ip, user_agent)

    upload_uuid = uuid.uuid4().hex
    file_path = await _write_temp_file(upload_uuid, file)

    ip_norm, ua_norm = _get_client_identity(ip, user_agent)
    rate_doc = UploadRateLimit(ip=ip_norm, user_agent=ua_norm)
    rate_doc.save()

    task = compute_custom_gff_stats.delay(
        upload_uuid,
        os.path.basename(file_path),
        custom_name.strip(),
    )
    rate_doc.task_id = task.id
    rate_doc.save()

    return {"task_id": task.id, "remaining_quota": remaining}
