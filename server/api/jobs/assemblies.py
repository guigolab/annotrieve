from fastapi import APIRouter, Header

from services import jobs_service

router = APIRouter()


@router.post("/jobs/update/assemblies")
async def trigger_update_assemblies(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update assemblies from NCBI job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_assemblies_from_ncbi(x_auth_key)
