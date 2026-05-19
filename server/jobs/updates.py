import csv
import os

import requests
from celery import shared_task

from db.embedded_documents import BuscoScore
from db.models import GenomeAssembly, GenomeAnnotation
from .taxonomy import schedule_flattened_taxonomy_export
from .services import assembly as assembly_service
from .services import annotation as annotation_service
from .services import stats as stats_service
from .services import taxonomy as taxonomy_service

TMP_DIR = "/tmp"

BUSCO_VERSION = os.getenv("BUSCO_VERSION", "6.0.0")
BUSCO_LINEAGE = os.getenv("BUSCO_LINEAGE", "eukaryota_odb12")
BUSCO_TSV_PATH = (
    f"https://raw.githubusercontent.com/guigolab/BUSCO-tracker/refs/heads/main"
    f"/BUSCO/{BUSCO_LINEAGE}/BUSCO.tsv"
)
BUSCO_COUNT = os.getenv("BUSCO_COUNT", 129)


@shared_task(name="update_taxon_stats", ignore_result=False)
def update_taxon_stats():
    """
    Update the taxon stats for the annotations, nice and slow operation.
    Currently only gene counts are computed
    """
    stats_service.update_taxon_gene_and_transcript_stats()
    schedule_flattened_taxonomy_export()


@shared_task(name="update_records", ignore_result=False)
def update_records():
    """
    Update records in the db. Uses assembly taxids as the source of truth for taxons,
    organisms and annotations.
    """
    assembly_accessions = list(GenomeAssembly.objects().scalar("assembly_accession"))
    if not assembly_accessions:
        print("No assemblies found, skipping update")
        return
    assembly_service.update_assemblies_from_ncbi(assembly_accessions, TMP_DIR, 1000)

    del assembly_accessions

    assembly_taxids = list(set(GenomeAssembly.objects().scalar("taxid")))
    if not assembly_taxids:
        print("No assembly taxids found, skipping taxonomy updates")
        return

    taxonomy_service.fetch_new_organisms_from_assembly_taxids(assembly_taxids)
    annotation_service.update_stale_annotations(assembly_taxids)

    del assembly_taxids

    taxonomy_service.update_records_with_empty_taxon_lineage_fallback(GenomeAssembly)
    taxonomy_service.update_records_with_empty_taxon_lineage_fallback(GenomeAnnotation)

    taxonomy_service.update_taxonomy_from_ebi()
    taxonomy_service.rebuild_taxon_hierarchy_from_lineages()

    stats_service.update_db_stats()
    stats_service.update_taxon_gene_and_transcript_stats()
    schedule_flattened_taxonomy_export()


@shared_task(name="update_busco_scores", ignore_result=False)
def update_busco_scores():
    """Update the busco scores for the eukaryota_odb12 lineage."""
    busco_scores: dict[str, BuscoScore] = {}
    annotations_without_busco_scores = set(
        GenomeAnnotation.objects(busco__exists=False).scalar("annotation_id")
    )
    if not annotations_without_busco_scores:
        print("No annotations without busco scores found, skipping busco scores update")
        return

    try:
        with requests.get(BUSCO_TSV_PATH, stream=True) as r:
            r.raise_for_status()
            lines = (line.decode("utf-8") for line in r.iter_lines() if line)
            reader = csv.DictReader(lines, delimiter="\t")
            for row in reader:
                annotation_id = row["annotation_id"]
                if annotation_id not in annotations_without_busco_scores:
                    continue
                busco_scores[annotation_id] = BuscoScore(
                    busco_lineage=BUSCO_LINEAGE,
                    busco_version=BUSCO_VERSION,
                    total_count=BUSCO_COUNT,
                    complete=row["complete"],
                    single_copy=row["single"],
                    duplicated=row["duplicated"],
                    fragmented=row["fragmented"],
                    missing=row["missing"],
                )
    except Exception as e:
        print(f"Unexpected error occurred while fetching TSV file: {e}")
        return

    ann_ids = list(busco_scores.keys())
    if not ann_ids:
        print("No annotations found, skipping busco scores update")
        return
    coll = GenomeAnnotation.objects(annotation_id__in=ann_ids)
    updated_count = 0
    for ann in coll:
        busco_score = busco_scores.get(ann.annotation_id)
        if not busco_score:
            continue
        ann.modify(busco=busco_score)
        updated_count += 1

    stats_service.update_taxons_busco_scores(BUSCO_LINEAGE, BUSCO_COUNT)

    print(f"Busco scores updated for {updated_count} annotations")
    schedule_flattened_taxonomy_export()


@shared_task(name="update_taxons_busco_scores", ignore_result=False)
def update_taxons_busco_scores_job():
    """Update the taxons busco scores."""
    stats_service.update_taxons_busco_scores(BUSCO_LINEAGE, BUSCO_COUNT)
    schedule_flattened_taxonomy_export()


@shared_task(name="prune_annotations_missing_source_url", ignore_result=False)
def prune_annotations_missing_source_url(dry_run: bool = False):
    """
    Delete annotations whose source_file_info.url_path is missing remotely (404/410),
    then refresh db, taxon gene/transcript, and taxon BUSCO aggregates.
    """
    prune_stats = annotation_service.delete_annotations_with_missing_source_urls(
        dry_run=dry_run
    )
    if dry_run:
        return prune_stats

    stats_service.update_db_stats()
    stats_service.update_taxon_gene_and_transcript_stats()
    stats_service.update_taxons_busco_scores(BUSCO_LINEAGE, BUSCO_COUNT)

    return {
        **prune_stats,
        "stats_refreshed": True,
    }
