from fastapi import APIRouter, Header

from services import jobs_service

router = APIRouter()


@router.post("/jobs/update/taxonomy/backfill-parent-id")
@router.post("/jobs/update/taxonomy/backfill_parent_id")  # Deprecated: use backfill-parent-id instead.
async def trigger_backfill_taxon_parent_id(x_auth_key: str = Header(..., alias="X-Auth-Key")):
    """
    Trigger backfill of TaxonNode.parent_id from children lists.

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_backfill_taxon_parent_id(x_auth_key)


@router.post("/jobs/remap/assemblies-and-annotations")
async def trigger_remap_all_assemblies_and_annotations(
    x_auth_key: str = Header(..., alias="X-Auth-Key"),
):
    """
    Full disk sequence rebuild: drop legacy Mongo sequence collections, regenerate all
    contigs.txt, unset mapped_regions, re-sync chromosomes.json + chr_aliases.tsv.
    Long-running; run off-peak.

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_remap_all_assemblies_and_annotations(x_auth_key)


@router.post("/jobs/unset/mapped-regions")
async def trigger_unset_genome_annotation_mapped_regions(
    x_auth_key: str = Header(..., alias="X-Auth-Key"),
    dry_run: bool = True,
):
    """
    Remove deprecated mapped_regions from all GenomeAnnotation documents.

    Defaults to dry_run=true; pass dry_run=false to apply.

    Requires X-Auth-Key header for authentication.
    """
    return jobs_service.trigger_unset_genome_annotation_mapped_regions(
        x_auth_key, dry_run=dry_run
    )
