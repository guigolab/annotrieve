from celery import shared_task
from db.models import TaxonNode
from pymongo.operations import UpdateOne

from .services import assembly as assembly_service
from .services import contigs as contigs_service
from .services.utils import create_batches


@shared_task(name="backfill_taxon_parent_id", ignore_result=False)
def backfill_taxon_parent_id(batch_size: int = 1000):
    """
    One-off / maintenance: set parent_id on each taxon from its parent's children list.
    Idempotent; safe to run multiple times.
    """
    taxon_collection = TaxonNode._get_collection()
    child_to_parent: dict[str, str] = {}

    for doc in taxon_collection.find({}, {"taxid": 1, "children": 1}):
        parent_taxid = doc.get("taxid")
        if not parent_taxid:
            continue
        for child_taxid in doc.get("children") or []:
            if child_taxid:
                child_to_parent[child_taxid] = parent_taxid

    updated_count = 0
    child_taxids_list = list(child_to_parent.keys())
    for batch_taxids in create_batches(child_taxids_list, batch_size):
        bulk_ops = [
            UpdateOne(
                {"taxid": taxid},
                {"$set": {"parent_id": child_to_parent[taxid]}},
            )
            for taxid in batch_taxids
        ]
        if bulk_ops:
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count

    all_child_taxids_set = set(child_to_parent.keys())
    batch_taxids_to_clear = []
    for doc in taxon_collection.find(
        {
            "taxid": {"$nin": list(all_child_taxids_set)},
            "parent_id": {"$exists": True, "$ne": None},
        },
        {"taxid": 1},
    ):
        batch_taxids_to_clear.append(doc["taxid"])
        if len(batch_taxids_to_clear) >= batch_size:
            bulk_ops = [
                UpdateOne({"taxid": taxid}, {"$unset": {"parent_id": ""}})
                for taxid in batch_taxids_to_clear
            ]
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count
            batch_taxids_to_clear = []

    if batch_taxids_to_clear:
        bulk_ops = [
            UpdateOne({"taxid": taxid}, {"$unset": {"parent_id": ""}})
            for taxid in batch_taxids_to_clear
        ]
        result = taxon_collection.bulk_write(bulk_ops, ordered=False)
        updated_count += result.modified_count

    print(f"Backfill taxon parent_id: updated {updated_count} taxon nodes")
    return {"updated": updated_count, "child_mappings": len(child_to_parent)}


@shared_task(name="remap_all_assemblies_and_annotations", ignore_result=False)
def remap_all_assemblies_and_annotations(
    chunk_size: int = 500,
):
    """
    One-shot disk sequence rebuild for production:
      1) Drop annotation_sequence_map + genomic_sequence collections
      2) Regenerate all *.contigs.txt via tabix -l (overwrites existing files)
      3) Unset deprecated mapped_regions on annotations
      4) Re-sync chromosome-level assemblies to chromosomes.json + chr_aliases.tsv
         (overwrites existing sequence files; summaries use Last-Modified cache)

    On-disk contigs.txt, chromosomes.json, and chr_aliases.tsv are always replaced
    when present. NCBI assembly_summary*.txt files are only re-downloaded when stale.
    """
    from db.models import AnnotationSequenceMap, GenomicSequence
    from helpers import assembly_sequence_files as seq_files

    overwrite_existing_disk_files = True

    print("Phase 1: Dropping annotation_sequence_map and genomic_sequence collections...")
    map_deleted = AnnotationSequenceMap.objects.count()
    genomic_deleted = GenomicSequence.objects.count()
    AnnotationSequenceMap.drop_collection()
    GenomicSequence.drop_collection()
    drop_stats = {
        "annotation_sequence_map_deleted": map_deleted,
        "genomic_sequence_deleted": genomic_deleted,
    }

    print("Phase 2: Regenerating all contigs.txt files (overwrite existing)...")
    contigs_stats = seq_files.regenerate_all_contigs_txt(
        overwrite_existing=overwrite_existing_disk_files,
    )

    print("Phase 3: Unsetting deprecated mapped_regions on all annotations...")
    matching = contigs_service.count_genome_annotations_with_mapped_regions()
    modified = contigs_service.unset_genome_annotation_mapped_regions()
    unset_stats = {"matching": matching, "modified": modified}

    print(
        "Phase 4: Syncing assembly reports to disk "
        f"(overwrite_existing={overwrite_existing_disk_files})..."
    )
    sync_stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=None,
        overwrite_sequences=overwrite_existing_disk_files,
        chunk_size=chunk_size,
    )

    result = {
        "overwrite_existing_disk_files": overwrite_existing_disk_files,
        "collections_dropped": drop_stats,
        "contigs_regenerated": contigs_stats,
        "unset_mapped_regions": unset_stats,
        "assembly_sync": sync_stats,
    }
    print(f"Full sequence rebuild finished: {result}")
    return result


@shared_task(name="unset_genome_annotation_mapped_regions", ignore_result=False)
def unset_genome_annotation_mapped_regions_task(dry_run: bool = True):
    """
    Remove deprecated mapped_regions from all GenomeAnnotation documents.
    AnnotationSequenceMap is the source of truth for per-annotation seqids.
    """
    matching = contigs_service.count_genome_annotations_with_mapped_regions()
    if dry_run:
        return {"dry_run": True, "matching": matching, "modified": 0}

    modified = contigs_service.unset_genome_annotation_mapped_regions()
    result = {"dry_run": False, "matching": matching, "modified": modified}
    print(f"Unset mapped_regions finished: {result}")
    return result
