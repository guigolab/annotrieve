from fastapi import HTTPException
import os
import secrets
from jobs.import_annotations import import_annotations
from jobs.assemblies import sync_new_assemblies_from_summary
from jobs.migration import (
    backfill_taxon_parent_id,
    remap_all_assemblies_and_annotations,
    unset_genome_annotation_mapped_regions_task,
)
from jobs.taxonomy import export_flattened_taxonomy
from jobs.updates import (
    prune_annotations_missing_source_url,
    update_taxon_stats,
    update_records,
    update_busco_scores,
    update_taxons_busco_scores_job,
)
from jobs.track_users import track_unique_users_by_country


def _validate_auth_key(auth_key: str) -> None:
    """
    Validate authentication key using constant-time comparison to prevent timing attacks.
    
    Raises HTTPException with 401 status if key is invalid.
    """
    expected_key = os.getenv('AUTH_KEY', '')
    if not secrets.compare_digest(auth_key, expected_key):
        raise HTTPException(status_code=401, detail="Unauthorized")

def trigger_track_unique_users_by_country(auth_key: str):
    """
    Track unique users by country
    """
    _validate_auth_key(auth_key)
    track_unique_users_by_country.delay()
    return {"message": "Track unique users by country task triggered"}

def trigger_update_records(auth_key: str):
    """
    Trigger update records
    """
    _validate_auth_key(auth_key)
    update_records.delay()
    return {"message": "Update records task triggered"}

def trigger_import_annotations(auth_key: str):
    """
    Import annotations and update db stats
    """
    _validate_auth_key(auth_key)
    import_annotations.delay()
    return {"message": "Import annotations task triggered"}

def trigger_update_taxonomy_stats(auth_key: str):
    """
    Update the taxonomy stats in the database
    """
    _validate_auth_key(auth_key)
    update_taxon_stats.delay()
    return {"message": "Update taxonomy stats task triggered"}


def trigger_backfill_taxon_parent_id(auth_key: str):
    """
    Backfill parent_id on TaxonNode from children lists.
    """
    _validate_auth_key(auth_key)
    backfill_taxon_parent_id.delay()
    return {"message": "Backfill taxon parent_id task triggered"}


def trigger_export_flattened_taxonomy(auth_key: str):
    """
    Export prebuilt flattened-tree.tsv and flattened-tree.json files.
    """
    _validate_auth_key(auth_key)
    export_flattened_taxonomy.delay()
    return {"message": "Export flattened taxonomy task triggered"}

def trigger_update_busco_scores(auth_key: str):
    """
    Update the busco scores for the eukaryota_odb12 lineage
    """
    _validate_auth_key(auth_key)
    update_busco_scores.delay()
    return {"message": "Update busco scores task triggered"}


def trigger_update_taxons_busco_scores(auth_key: str):
    """
    Update the taxons busco scores
    """
    _validate_auth_key(auth_key)
    update_taxons_busco_scores_job.delay()
    return {"message": "Update taxons busco scores task triggered"}


def trigger_prune_annotations_missing_source_url(
    auth_key: str, dry_run: bool = True
):
    """
    Remove annotations whose remote source URL returns 404/410, then refresh stats.
    """
    _validate_auth_key(auth_key)
    prune_annotations_missing_source_url.delay(dry_run=dry_run)
    return {"message": "Prune annotations with missing source URL task triggered"}

def trigger_remap_all_assemblies_and_annotations(auth_key: str):
    """
    Trigger full disk sequence rebuild: drop legacy Mongo sequence collections,
    regenerate all contigs.txt, unset mapped_regions, re-sync chromosomes.json.
    """
    _validate_auth_key(auth_key)
    remap_all_assemblies_and_annotations.delay()
    return {"message": "Full sequence rebuild task triggered"}


def trigger_sync_new_assemblies_from_summary(auth_key: str, accessions: list[str]):
    """
    Sync FTP paths and sequences for specific assembly accessions.
    """
    _validate_auth_key(auth_key)
    sync_new_assemblies_from_summary.delay(accessions=accessions)
    return {"message": "Sync new assemblies from summary task triggered"}


def trigger_unset_genome_annotation_mapped_regions(
    auth_key: str, dry_run: bool = True
):
    """
    Remove deprecated mapped_regions from all GenomeAnnotation documents.
    """
    _validate_auth_key(auth_key)
    unset_genome_annotation_mapped_regions_task.delay(dry_run=dry_run)
    return {"message": "Unset genome annotation mapped_regions task triggered"}