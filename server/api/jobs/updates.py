from fastapi import APIRouter, Header

from services import jobs_service

router = APIRouter()


@router.post("/jobs/import/annotations")
async def trigger_import_annotations(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger import annotations job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_import_annotations(x_auth_key)


@router.post("/jobs/update/records")
async def trigger_update_records(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update records job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_records(x_auth_key)


@router.post("/jobs/update/taxonomy/stats")
async def trigger_update_taxonomy_stats(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update taxonomy stats job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_taxonomy_stats(x_auth_key)


@router.post("/jobs/update/analytics")
async def trigger_update_analytics(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger track unique users by country job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_track_unique_users_by_country(x_auth_key)


@router.post("/jobs/update/annotations/busco")
async def trigger_update_annotations_busco(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update annotations busco scores job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_busco_scores(x_auth_key)


@router.post("/jobs/update/annotations/prune-missing-source-url")
async def trigger_prune_annotations_missing_source_url(
    x_auth_key: str = Header(..., alias="X-Auth-Key"),
    dry_run: bool = True,
):
    """
    Delete annotations whose source_file_info.url_path is missing (HTTP 404/410),
    then refresh db counts and taxon gene/BUSCO aggregates.

    Defaults to dry_run=true; pass dry_run=false to apply.

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_prune_annotations_missing_source_url(
        x_auth_key, dry_run=dry_run
    )


@router.post("/jobs/update/taxons/busco")
async def trigger_update_taxons_busco_scores(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger update taxons busco scores job

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_update_taxons_busco_scores(x_auth_key)
