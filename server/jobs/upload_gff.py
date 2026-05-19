import hashlib
import os
import shutil
import uuid
from datetime import datetime
from typing import Dict, Any

from celery import shared_task

from configs.app_settings import settings
from helpers import pysam_helper
from jobs.services import annotation as annotation_service
from jobs.services.feature_summary import _compute_features_summary_from_lines
from jobs.services.feature_stats import _compute_features_statistics_from_lines


@shared_task(bind=True, name="compute_custom_gff_stats", ignore_result=False)
def compute_custom_gff_stats(self, upload_uuid: str, original_filename: str, custom_name: str) -> Dict[str, Any]:
    """
    Compute feature summary and statistics for a user-uploaded GFF/GFF3 file.

    This task:
    - reads the uploaded file from a temp directory under LOCAL_ANNOTATIONS_DIR
    - sorts the GFF (seqid, start) like the import pipeline for consistent stats/MD5
    - computes an MD5 over the sorted uncompressed bytes
    - computes FeatureOverview and GFFStats from the sorted file
    - always removes the temp directory on completion/failure
    """
    from configs.app_settings import settings as _settings  # local import for Celery fork-safety

    local_annotations_dir = os.getenv("LOCAL_ANNOTATIONS_DIR")
    if not local_annotations_dir:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")

    tmp_dir = os.path.join(local_annotations_dir, _settings.UPLOAD_TMP_SUBDIR, upload_uuid)
    file_path = os.path.join(tmp_dir, original_filename)

    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Uploaded file not found at {file_path}")

        sorted_path = os.path.join(tmp_dir, "sorted.gff")

        self.update_state(state="PROGRESS", meta={"step": "sorting"})
        annotation_service.sort_gff_file(file_path, sorted_path)
        if not os.path.exists(sorted_path) or os.path.getsize(sorted_path) == 0:
            raise ValueError("Sorted annotation is empty")

        # Step 1: MD5 + uncompressed size (sorted stream, same as import)
        self.update_state(state="PROGRESS", meta={"step": "hashing"})

        md5 = hashlib.md5()
        uncompressed_size = 0

        with open(sorted_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                uncompressed_size += len(chunk)
                md5.update(chunk)

        md5_hex = md5.hexdigest()

        # Step 2: Summary
        self.update_state(state="PROGRESS", meta={"step": "computing_summary"})
        summary = _compute_features_summary_from_lines(
            pysam_helper.stream_plain_gff_file(sorted_path)
        )

        # Step 3: Stats
        self.update_state(state="PROGRESS", meta={"step": "computing_stats"})
        stats = _compute_features_statistics_from_lines(
            pysam_helper.stream_plain_gff_file(sorted_path)
        )

        if not summary.types or not summary.sources:
            raise ValueError("Annotation has no types or sources, skipping...")

        result: Dict[str, Any] = {
            "annotation_id": md5_hex,
            "custom_name": custom_name,
            "is_custom": True,
            "features_summary": summary.to_mongo().to_dict(),
            "features_statistics": stats.to_mongo().to_dict(),
            "indexed_file_info": {
                "uncompressed_md5": md5_hex,
                "file_size": uncompressed_size,
            },
            "computed_at": datetime.utcnow().isoformat(),
        }

        return result
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

