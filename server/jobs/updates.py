from celery import shared_task
from concurrent.futures import ThreadPoolExecutor, as_completed
from db.models import GenomeAssembly, GenomeAnnotation,  Organism
import os
from db.embedded_documents import BuscoScore
from .services import assembly as assembly_service
from .services.utils import create_batches
from .services import stats as stats_service
from .services import annotation as annotation_service
from .services import taxonomy as taxonomy_service
import requests
import csv

TMP_DIR = "/tmp"

ANNOTATIONS_PATH = os.getenv('LOCAL_ANNOTATIONS_DIR')

BUSCO_VERSION = os.getenv('BUSCO_VERSION', '6.0.0')
BUSCO_LINEAGE = os.getenv('BUSCO_LINEAGE', 'eukaryota_odb12')
BUSCO_TSV_PATH = f"https://raw.githubusercontent.com/guigolab/BUSCO-tracker/refs/heads/main/BUSCO/{BUSCO_LINEAGE}/BUSCO.tsv"
BUSCO_COUNT = os.getenv('BUSCO_COUNT', 129)


@shared_task(name='update_taxon_stats', ignore_result=False)
def update_taxon_stats():
    """
    Update the taxon stats for the annotations, nice and slow operation.
    Currently only gene counts are computed
    """
    stats_service.update_taxon_gene_and_transcript_stats()


def fetch_new_organisms_from_assembly_taxids(assembly_taxids: list[str]):
    """
    Fetch the new organisms from the assembly taxids and update taxonomy and assemblies related to them
    - assembly_taxids: list of assembly taxids to process
    """
    new_taxids = taxonomy_service.get_new_organisms_taxids(assembly_taxids)
    if not new_taxids:
        return 
    #filter out those without lineage
    new_organisms_to_process = [organism for organism in taxonomy_service.fetch_new_organisms(new_taxids, TMP_DIR) if organism.taxon_lineage]
    if not new_organisms_to_process:
        return 
    
    saved_taxids = taxonomy_service.save_organisms(new_organisms_to_process) #save the new organisms
    if not saved_taxids:
        return 
    
    taxonomy_service.save_taxons([o for o in new_organisms_to_process if o.taxon_id in saved_taxids]) #save the new taxons

    #update assemblies with new organism data
    # Note: Hierarchy will be rebuilt from all lineages by rebuild_taxon_hierarchy_from_lineages()
    saved_organisms = Organism.objects(taxid__in=saved_taxids)
    for organism in saved_organisms:
        payload = dict(taxon_lineage=organism.taxon_lineage, organism_name=organism.organism_name)
        GenomeAssembly.objects(taxid=organism.taxid).update(**payload)


def update_stale_annotations(assembly_taxids: list[str]) -> None:
    """
    Update the taxonomy for the stale annotations given a list of assembly taxids
    - assembly_taxids: list of assembly taxids to process
    """
    annotations_with_stale_taxids = GenomeAnnotation.objects(taxid__nin=assembly_taxids)
    if annotations_with_stale_taxids.count() == 0:
        return 
    
    # Use aggregation to get assembly accessions and annotation IDs efficiently
    # This avoids loading all annotation documents into memory
    pipeline = [
        {"$group": {
            "_id": "$assembly_accession",
            "annotation_ids": {"$push": "$annotation_id"}
        }}
    ]
    
    assemblies_not_found = set()
    annotations_by_assembly = {}
    
    for row in annotations_with_stale_taxids.aggregate(*pipeline):
        acc = row["_id"]
        annotation_ids = row["annotation_ids"]
        annotations_by_assembly[acc] = annotation_ids
    
    if not annotations_by_assembly:
        return
    
    # Build assembly lookup for all related assemblies
    related_assembly_accessions = list(annotations_by_assembly.keys())
    assembly_map = assembly_service.build_assembly_lookup(related_assembly_accessions)

    for acc, ann_ids in annotations_by_assembly.items():
        assembly = assembly_map.get(acc)
        if not assembly:
            assemblies_not_found.add(acc)
            continue
        update_payload = dict(
            taxid=assembly.taxid,
            organism_name=assembly.organism_name,
            taxon_lineage=assembly.taxon_lineage
        )
        GenomeAnnotation.objects(annotation_id__in=ann_ids).update(**update_payload)

    if assemblies_not_found:
        annotation_service.delete_annotations(
            query=dict(assembly_accession__in=list(assemblies_not_found)),
            annotations_path=ANNOTATIONS_PATH
        )


def update_records_with_empty_taxon_lineage_fallback(model: GenomeAssembly | GenomeAnnotation):
    """
    Update the documents with empty taxon lineage fallback
    - model: GenomeAssembly | GenomeAnnotation
    """
    documents_with_empty_taxon_lineage = model.objects(taxon_lineage=[])
    if documents_with_empty_taxon_lineage.count() > 0:
        related_taxids = set(documents_with_empty_taxon_lineage.scalar('taxid'))
        related_organisms = Organism.objects(taxid__in=list(related_taxids))
        for organism in related_organisms:
            if organism.taxon_lineage:
                update_payload = dict(taxon_lineage=organism.taxon_lineage, organism_name=organism.organism_name)
                model.objects(taxid=organism.taxid).update(**update_payload)
    

def update_taxonomy_from_ebi():
    """
    Update the taxonomy from EBI
    """
    #UPDATE ORGANISMS
    # Stream taxids instead of loading all into memory
    all_taxids = Organism.objects().scalar('taxid')
    batches = create_batches(list(all_taxids), 5000)
    for batch in batches:
        organisms_to_process = taxonomy_service.fetch_new_organisms(batch, TMP_DIR)
        existing_organisms_map = {
            organism.taxid: organism for organism in Organism.objects(taxid__in=batch)
        }
        for organism in organisms_to_process:
            if not organism.taxon_lineage or organism.taxon_id not in existing_organisms_map:
                continue # broken organism, skip, try next iteration
            existing_organism = existing_organisms_map[organism.taxon_id]
            #check what changed and update accordingly
            payload, payload_of_related_documents = taxonomy_service.process_organism(organism, existing_organism)
            if payload:
                existing_organism.modify(**payload)
            if payload_of_related_documents:
                GenomeAssembly.objects(taxid=organism.taxon_id).update(**payload_of_related_documents) #update the assemblies related to the organism
                GenomeAnnotation.objects(taxid=organism.taxon_id).update(**payload_of_related_documents) #update the annotations related to the organism


@shared_task(name='update_records', ignore_result=False)
def update_records():
    """
    Function to update records in the db.Uses assembly taxids as the source of truth for taxons, organisms and annotations
    - Update assemblies from NCBI
    - Update taxons, organisms and annotations from assembly taxids
    - Update db counts and taxon gene counts stats
    """
    #UPDATE ASSEMBLIES FROM NCBI
    assembly_accessions = list(GenomeAssembly.objects().scalar('assembly_accession'))
    if not assembly_accessions:
        print("No assemblies found, skipping update")
        return
    assembly_service.update_assemblies_from_ncbi(assembly_accessions, TMP_DIR, 1000)
    
    #free up memory
    del assembly_accessions

    assembly_taxids = list(set(GenomeAssembly.objects().scalar('taxid')))
    if not assembly_taxids:
        print("No assembly taxids found, skipping taxonomy updates")
        return
    
    #FETCH NEW ORGANISMS FROM ASSEMBLY TAXIDS AND UPDATE TAXONOMY AND ASSEMBLIES RELATED TO THEM
    fetch_new_organisms_from_assembly_taxids(assembly_taxids)
    
    #UPDATE STALE ANNOTATIONS WITH THE NEW TAXONOMY AND ASSEMBLIES RELATED TO THEM
    update_stale_annotations(assembly_taxids)
    
    #free up memory
    del assembly_taxids

    #FALLBACK UPDATE FOR ASSEMBLIES AND ANNOTATIONS WITH EMPTY TAXON LINEAGE
    update_records_with_empty_taxon_lineage_fallback(GenomeAssembly)
    update_records_with_empty_taxon_lineage_fallback(GenomeAnnotation)

    #UPDATE ALL TAXONOMY FROM EBI
    update_taxonomy_from_ebi()

    #REBUILD TAXON HIERARCHY FROM ALL EXISTING LINEAGES
    # This ensures parent-child relationships are correct based on current lineages in assemblies/annotations/organisms
    # Must run BEFORE stats update to ensure hierarchy is correct before taxons are deleted
    taxonomy_service.rebuild_taxon_hierarchy_from_lineages()

    #UPDATE DB COUNTS AND TAXON GENE COUNTS STATS
    # This will:
    # 1. Update taxon counts (annotations_count, assemblies_count, organisms_count)
    # 2. Delete taxons without annotations
    # 3. Update parent taxons to remove deleted taxids from their children lists (via pull_all__children)
    stats_service.update_db_stats()
    stats_service.update_taxon_gene_and_transcript_stats()


@shared_task(name='update_busco_scores', ignore_result=False)
def update_busco_scores():
    """
    Update the busco scores for the eukaryota_odb12 lineage
    """


    #fetch busco scores from the tsv
    busco_scores: dict[str, BuscoScore] = {}
    #fetch annotations without busco scores
    annotations_without_busco_scores = set(
        GenomeAnnotation.objects(busco__exists=False).scalar('annotation_id')
    )
    if not annotations_without_busco_scores:
        print("No annotations without busco scores found, skipping busco scores update")
        return
    #
    try:
        with requests.get(BUSCO_TSV_PATH, stream=True) as r:
            r.raise_for_status()
            lines = (line.decode("utf-8") for line in r.iter_lines() if line)
            reader = csv.DictReader(lines, delimiter="\t")
            for row in reader:
                annotation_id = row['annotation_id']
                if annotation_id not in annotations_without_busco_scores:
                    continue
                busco_scores[annotation_id] = BuscoScore(
                    busco_lineage=BUSCO_LINEAGE,
                    busco_version=BUSCO_VERSION,
                    total_count=BUSCO_COUNT,
                    complete=row['complete'],
                    single_copy=row['single'],
                    duplicated=row['duplicated'],
                    fragmented=row['fragmented'],
                    missing=row['missing']
                )
    except Exception as e:
        print(f"Unexpected error occurred while fetching TSV file: {e}")
        return
    
    ann_ids = list(busco_scores.keys())
    if not ann_ids:
        print("No annotations found, skipping busco scores update")
        return
    coll = GenomeAnnotation.objects(annotation_id__in=ann_ids)
    taxa_lineages_set = set()
    updated_count = 0
    for ann in coll:
        busco_score = busco_scores.get(ann.annotation_id)
        if not busco_score:
            continue
        taxa_lineages_set.update(ann.taxon_lineage)
        ann.modify(busco=busco_score)
        updated_count += 1

    stats_service.update_taxons_busco_scores(BUSCO_LINEAGE, BUSCO_COUNT)

    print(f"Busco scores updated for {updated_count} annotations")


@shared_task(name='update_taxons_busco_scores', ignore_result=False)
def update_taxons_busco_scores_job():
    """
    Update the taxons busco scores
    """
    stats_service.update_taxons_busco_scores(BUSCO_LINEAGE, BUSCO_COUNT)

def _resolve_assembly_download_url(row: tuple) -> tuple | None:
    """Resolve current FTP URL for one assembly. Returns (assembly_accession, new_download_url) if URL changed, else None."""
    accession, assembly_name, current_url = row
    if not accession or not assembly_name:
        return None
    try:
        resolved = assembly_service.create_ftp_path(accession, assembly_name)
        if resolved and resolved != current_url:
            return (accession, resolved)
    except Exception:
        pass
    return None


@shared_task(name='update_assemblies_download_url', ignore_result=False)
def update_assemblies_download_url_job(batch_size: int = 500, max_workers: int = 4):
    """
    Validate and update existing assembly download_url values by resolving the current
    NCBI FTP path (with existence check and directory scrape fallback). Runs concurrent
    resolution per batch to avoid rate limits while making progress.
    """
    total_assemblies = GenomeAssembly.objects.count()
    if total_assemblies == 0:
        print("No assemblies found, skipping download URL update")
        return {"updated": 0, "processed": 0}
    updated_count = 0
    processed_count = 0
    skip = 0
    while skip < total_assemblies:
        batch = list(
            GenomeAssembly.objects()
            .skip(skip)
            .limit(batch_size)
            .scalar("assembly_accession", "assembly_name", "download_url")
        )
        if not batch:
            break
        to_update = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_resolve_assembly_download_url, row) for row in batch]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    to_update.append(result)
        for accession, new_url in to_update:
            try:
                GenomeAssembly.objects(assembly_accession=accession).update_one(set__download_url=new_url)
                updated_count += 1
            except Exception as e:
                print(f"Failed to update download_url for {accession}: {e}")
        processed_count += len(batch)
        skip += batch_size
        if to_update:
            print(f"Processed {processed_count}/{total_assemblies} assemblies, updated {updated_count} download URLs so far")
    print(f"Download URL update finished: {updated_count} assemblies updated out of {processed_count} processed")
    return {"updated": updated_count, "processed": processed_count}
