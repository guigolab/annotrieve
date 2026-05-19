from fastapi import APIRouter, Depends, Body, Query
from typing import Optional, Dict, Any
from services import assemblies_service
from helpers import parameters as params_helper

router = APIRouter()

@router.get("/assemblies")
@router.post("/assemblies")
async def get_assemblies(
    commons: Dict[str, Any] = Depends(params_helper.common_params),
    payload: Optional[Dict[str, Any]] = Body(None),
    report_status: Optional[str] = Query(
        None,
        description="Filter by report sync: pending, ok (chromosomes.json on disk), or failed",
    ),
    report_incomplete: Optional[bool] = Query(
        None,
        description="When true, chromosome-level assemblies missing chromosomes.json or with fetch failed; when false, complete or non-chromosome-level",
    ),
):
    params = params_helper.handle_request_params(commons, payload)
    if report_status is not None:
        params["report_status"] = report_status
    if report_incomplete is not None:
        params["report_incomplete"] = report_incomplete
    return assemblies_service.get_assemblies(**params)


@router.get("/assemblies/frequencies/{field}")
@router.post("/assemblies/frequencies/{field}")
async def get_assemblies_frequencies(field: str, commons: Dict[str, Any] = Depends(params_helper.common_params), payload: Optional[Dict[str, Any]] = Body(None)):
    params = params_helper.handle_request_params(commons, payload)
    return assemblies_service.get_assemblies(**params, field=field, response_type='frequencies')

@router.get("/assemblies/{assembly_accession}")
async def get_assembly(assembly_accession: str):
    return assemblies_service.get_assembly(assembly_accession).to_mongo().to_dict()

@router.get("/assemblies/{assembly_accession}/chr-aliases")
@router.get("/assemblies/{assembly_accession}/chr_aliases")  # Deprecated: use .../chr-aliases instead.
async def get_chr_aliases(assembly_accession: str):
    return assemblies_service.get_chr_aliases_file(assembly_accession)

@router.get("/assemblies/{assembly_accession}/assembled-molecules")
@router.get("/assemblies/{assembly_accession}/assembled_molecules")  # Deprecated: use .../assembled-molecules instead.
async def get_assembled_molecules(
    assembly_accession: str,
    offset: int = Query(
        0,
        deprecated=True,
        description="Deprecated; ignored. Kept for backward compatibility.",
    ),
    limit: int = Query(
        20,
        deprecated=True,
        description="Deprecated; ignored. Kept for backward compatibility.",
    ),
):
    return assemblies_service.get_chromosomes_file(assembly_accession)

@router.get("/assemblies/{assembly_accession}/paired") 
async def get_paired_assembly(assembly_accession: str):
    return assemblies_service.get_paired_assembly(assembly_accession).to_mongo().to_dict()
