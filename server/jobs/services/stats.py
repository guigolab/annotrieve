import logging
from array import array
from db.models import GenomeAssembly, GenomeAnnotation, Organism, TaxonNode, BioProject
from db.embedded_documents import DistributionStats, TaxonAnnotationStats, TaxonGeneStats, TaxonGeneCategoryStats, TranscriptTypeStats, TaxonTranscriptTypeStats, TaxonBuscoScore
import math
from typing import List
from collections import defaultdict
from .utils import create_batches
from helpers import assembly_sequence_files as seq_files

logger = logging.getLogger(__name__)

def update_assemblies_counts():
    """
    Update the assemblies counts for the assemblies
    """
    counts = defaultdict(int)

    pipeline = [
        {"$group": {"_id": "$assembly_accession", "count": {"$sum": 1}}}
    ]

    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        counts[row["_id"]] = row["count"]

    for assembly in GenomeAssembly.objects():
        assembly.modify(
            annotations_count=counts.get(assembly.assembly_accession, 0)
        )

    orphan_qs = GenomeAssembly.objects(annotations_count=0)
    orphan_qs_count = orphan_qs.count()
    if orphan_qs_count > 0:
        logger.info(
            f"[assembly-prune] {orphan_qs_count} assemblies have no annotation left: deleting their DB rows, "
            f"then their files (assembly_report.txt, chromosomes.json, chr_aliases.tsv)"
        )
        orphan_files = [
            (a.taxid, a.assembly_accession)
            for a in orphan_qs.only("assembly_accession", "taxid").no_cache()
        ]
        orphan_qs.delete()
        # DB first, then disk: a failure here must never abort the stats update
        removed = 0
        failed: list[str] = []
        for taxid, accession in orphan_files:
            try:
                removed += len(seq_files.delete_assembly_files(taxid, accession))
            except Exception as e:
                failed.append(f"{accession} ({e})")
        logger.info(f"[assembly-prune] deleted {len(orphan_files)} DB rows and {removed} files")
        if failed:
            logger.error(
                f"[assembly-prune] files of {len(failed)} pruned assemblies could not be removed (the orphan "
                f"sweep task cleans them later): {'; '.join(failed[:10])}"
            )
    logger.info("[assembly-prune] assemblies counts updated")

def update_organisms_counts():
    """
    Update the organisms counts for the organisms
    """
    assembly_counts = defaultdict(int)
    annotation_counts = defaultdict(int)
    pipeline = [
        {"$group": {"_id": "$taxid", "count": {"$sum": 1}}}
    ]

    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]

    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        annotation_counts[row["_id"]] = row["count"]

    for organism in Organism.objects():
        organism.modify(
            annotations_count=annotation_counts.get(organism.taxid, 0),
            assemblies_count=assembly_counts.get(organism.taxid, 0),
        )

    orphan_qs = Organism.objects(annotations_count=0)
    orphan_qs_count = orphan_qs.count()
    if orphan_qs_count > 0:
        print(f"Found {orphan_qs_count} orphan organisms, deleting them")
        orphan_qs.delete()
    print("Organisms counts updated")

def update_taxon_nodes_counts():
    """
    Update the taxon nodes counts for the taxon nodes
    """
    print("Updating taxon nodes stats")
    annotation_counts = defaultdict(int)
    assembly_counts = defaultdict(int)
    organism_counts = defaultdict(int)
    pipeline = [
        {"$unwind": "$taxon_lineage"},
        {"$group": {"_id": "$taxon_lineage", "count": {"$sum": 1}}}
    ]
    for row in GenomeAnnotation.objects.aggregate(*pipeline):
        annotation_counts[row["_id"]] = row["count"]
    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]
    for row in Organism.objects.aggregate(*pipeline):
        organism_counts[row["_id"]] = row["count"]
    # Update taxon nodes in batches to avoid loading all into memory
    batch_size = 1000
    taxon_taxids = list(TaxonNode.objects().scalar('taxid'))
    for batch_taxids in create_batches(taxon_taxids, batch_size):
        taxon_nodes_batch = TaxonNode.objects(taxid__in=batch_taxids)
        for taxon_node in taxon_nodes_batch:
            taxon_node.modify(
                annotations_count=annotation_counts.get(taxon_node.taxid, 0),
                assemblies_count=assembly_counts.get(taxon_node.taxid, 0),
                organisms_count=organism_counts.get(taxon_node.taxid, 0)
            )
    #delete taxon nodes without annotations and update children
    taxon_nodes_to_delete = TaxonNode.objects(annotations_count=0)
    taxons_to_delete_count = taxon_nodes_to_delete.count()
    if taxons_to_delete_count > 0:
        print(f"Found {taxons_to_delete_count} taxon nodes without annotations, deleting them")
        taxids_to_delete = list(taxon_nodes_to_delete.scalar("taxid"))
        #delete taxon nodes and then update parents to remove deleted taxids from their children lists
        taxon_nodes_to_delete.delete()
        # Update all parent taxons that have any of the deleted taxids in their children list
        # pull_all__children removes all matching values from the children array
        TaxonNode.objects(children__in=taxids_to_delete).update(
            pull_all__children=taxids_to_delete
        )
    print("Taxon nodes counts updated")

def update_bioprojects_counts():
    """
    Update the bioprojects counts for the bioprojects
    """
    assembly_counts = defaultdict(int)
    pipeline = [
        {"$unwind": "$bioprojects"},
        {"$group": {"_id": "$bioprojects", "count": {"$sum": 1}}}
    ]
    for row in GenomeAssembly.objects.aggregate(*pipeline):
        assembly_counts[row["_id"]] = row["count"]
    for bioproject in BioProject.objects():
        bioproject.modify(
            assemblies_count=assembly_counts.get(bioproject.accession, 0),
        )
    orphan_bioprojects = BioProject.objects(assemblies_count=0)
    orphan_bioprojects_count = orphan_bioprojects.count()
    if orphan_bioprojects_count > 0:
        print(f"Found {orphan_bioprojects_count} orphan bioprojects, deleting them")
        orphan_bioprojects.delete()
    print("Bioprojects counts updated")

def update_db_stats():
    """
    update all the db stats, #slow operation but safe
    """
    print("Updating db stats")
    #ASSEMBLIES
    update_assemblies_counts()
    
    #ORGANISMS
    update_organisms_counts()

    #TAXON NODES
    update_taxon_nodes_counts()

    #BIOPROJECTS
    update_bioprojects_counts()
    
    print("DB stats updated")

def compute_distribution_stats(values: List[int]) -> DistributionStats:
    n = len(values)
    if n == 0:
        return DistributionStats(mean=0, median=0, std=0, min=0, max=0, n=0)

    # mean
    mean = round(sum(values) / n, 2)

    # median
    sorted_vals = sorted(values)
    if n % 2 == 1:
        median = round(sorted_vals[n // 2], 2)
    else:
        median = round((sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2, 2)

    # population standard deviation
    exact_mean = sum(values) / n
    variance = sum((x - exact_mean) ** 2 for x in values) / n
    std = round(math.sqrt(variance), 2)

    return DistributionStats(
        mean=mean,
        median=median,
        std=std,
        min=min(values),
        max=max(values),
        n=n,
    )

def _extract_busco_scores(busco_score, taxid, taxon_busco_scores):
    """Extract scores for single_copy, duplicated, fragmented and missing"""
    if not busco_score:
        return
    for busco_type in [ 'single_copy', 'duplicated', 'fragmented', 'missing', 'complete']:
        type_stats = busco_score.get(busco_type)
        taxon_busco_scores[taxid][busco_type].append(type_stats)



GENE_CATEGORIES = ("coding", "non_coding", "pseudogene")
TRANSCRIPT_TYPES = ("mRNA", "lncRNA", "miRNA", "tRNA")


def _taxon_count_projection() -> dict:
    """
    Project only the handful of counts the taxon stats need, one small document per annotation.
    (The previous pipeline $unwind-ed the lineage and shipped the whole transcript_type_stats
    payload once per ancestor taxon, i.e. ~30 copies per annotation.)
    """
    gene_stats = "$features_statistics.gene_category_stats"
    transcript_stats = "$features_statistics.transcript_type_stats"
    projection = {"_id": 0, "taxon_lineage": 1}
    for category in GENE_CATEGORIES:
        projection[f"g_{category}"] = f"{gene_stats}.{category}.total_count"
    for transcript_type in ("mRNA", "lnc_RNA", "lncRNA", "miRNA", "tRNA"):
        projection[f"t_{transcript_type}"] = f"{transcript_stats}.{transcript_type}.total_count"
    return projection


def update_taxon_gene_and_transcript_stats():
    """
    Update both gene and transcript stats for taxon nodes in one pass over GenomeAnnotation.

    Memory: per (taxon, category) the counts are kept in compact array('i') buffers (4 bytes per
    annotation instead of a list pointer plus an int object), and TaxonNode documents are
    updated in place by taxid instead of being loaded. Only genes/transcripts are written, so
    a BUSCO score stored on the node is never overwritten.
    """
    print("Updating taxon gene and transcript stats")

    taxon_gene_counts = defaultdict(lambda: {c: array("i") for c in GENE_CATEGORIES})
    taxon_transcript_counts = defaultdict(lambda: {t: array("i") for t in TRANSCRIPT_TYPES})

    pipeline = [
        {"$match": {
            "taxon_lineage": {"$ne": [], "$exists": True},
            "$or": [
                {"features_statistics.gene_category_stats": {"$exists": True}},
                {"features_statistics.transcript_type_stats": {"$exists": True}}
            ]
        }},
        {"$project": _taxon_count_projection()},
    ]

    for doc in GenomeAnnotation.objects.aggregate(*pipeline):
        gene_values = [(c, doc.get(f"g_{c}")) for c in GENE_CATEGORIES]
        # Annotations spell it `lnc_RNA` or `lncRNA`; some carry both: count them together.
        lnc_parts = [v for v in (doc.get("t_lnc_RNA"), doc.get("t_lncRNA")) if v is not None]
        lnc = sum(lnc_parts) if lnc_parts else None
        transcript_values = [
            ("mRNA", doc.get("t_mRNA")),
            ("lncRNA", lnc),
            ("miRNA", doc.get("t_miRNA")),
            ("tRNA", doc.get("t_tRNA")),
        ]
        for taxid in doc.get("taxon_lineage") or []:
            if not taxid:
                continue
            for category, value in gene_values:
                if value is not None:
                    taxon_gene_counts[taxid][category].append(value)
            for transcript_type, value in transcript_values:
                if value is not None:
                    taxon_transcript_counts[taxid][transcript_type].append(value)

    empty_genes = {c: () for c in GENE_CATEGORIES}
    empty_transcripts = {t: () for t in TRANSCRIPT_TYPES}
    for taxid in TaxonNode.objects.no_cache().scalar("taxid"):
        g = taxon_gene_counts.get(taxid, empty_genes)
        t = taxon_transcript_counts.get(taxid, empty_transcripts)
        genes = TaxonGeneStats(
            coding=TaxonGeneCategoryStats(count=compute_distribution_stats(g["coding"])),
            non_coding=TaxonGeneCategoryStats(count=compute_distribution_stats(g["non_coding"])),
            pseudogene=TaxonGeneCategoryStats(count=compute_distribution_stats(g["pseudogene"])),
        )
        transcripts = TranscriptTypeStats(
            mRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t["mRNA"])),
            lncRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t["lncRNA"])),
            miRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t["miRNA"])),
            tRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t["tRNA"])),
        )
        TaxonNode.objects(taxid=taxid).update_one(
            set__stats__genes=genes, set__stats__transcripts=transcripts
        )
        # free the per-taxon buffers as we go
        taxon_gene_counts.pop(taxid, None)
        taxon_transcript_counts.pop(taxid, None)

    print("Taxon gene and transcript stats updated")


def update_taxons_busco_scores(busco_lineage: str, busco_count: int) -> None:
    """
    Update the busco scores from the taxids (lineages) of the annotations
    
    """
    taxon_busco_scores = defaultdict(lambda: {t: [] for t in ['single_copy', 'duplicated', 'fragmented', 'missing', 'complete']})
    pipeline = [
        {"$match": {
            "busco": {
                "$exists": True
            }
        }},
        {"$unwind": "$taxon_lineage"},
        {"$project": {
            "taxid": "$taxon_lineage",
            "busco": "$busco"
        }},
    ]

    for doc in GenomeAnnotation.objects.aggregate(*pipeline):
        taxid = doc.get("taxid")
        if not taxid:
            continue
        busco = doc.get("busco")
        if not busco:
            continue
        _extract_busco_scores(busco, taxid, taxon_busco_scores)

    print(f"Found {len(taxon_busco_scores)} taxon busco scores")
    for taxon_node in TaxonNode.objects():
        taxid = taxon_node.taxid
        busco_score = taxon_busco_scores.get(taxid)
        if not busco_score:
            continue
        busco_score_doc = TaxonBuscoScore(single_copy=compute_distribution_stats(busco_score.get("single_copy", [])),
            duplicated=compute_distribution_stats(busco_score.get("duplicated", [])),
            fragmented=compute_distribution_stats(busco_score.get("fragmented", [])),
            missing=compute_distribution_stats(busco_score.get("missing", [])),
            complete=compute_distribution_stats(busco_score.get("complete", [])),
            busco_lineage=busco_lineage,
            total_count=busco_count,
            )

        taxon_node.modify(stats__busco=busco_score_doc)
    print("Taxon busco scores updated")