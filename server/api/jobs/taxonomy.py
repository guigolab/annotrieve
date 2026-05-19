from fastapi import APIRouter, Header

from services import jobs_service

router = APIRouter()


@router.post("/jobs/update/taxonomy/export-flattened")
@router.post("/jobs/update/taxonomy/export_flattened")  # Deprecated: use export-flattened instead.
async def trigger_export_flattened_taxonomy(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger export of flattened-tree.tsv/json under LOCAL_ANNOTATIONS_DIR/taxonomy/.

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_export_flattened_taxonomy(x_auth_key)
