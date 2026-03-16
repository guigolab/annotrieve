from db.models import GenomeAssembly, GenomeAnnotation, Organism, TaxonNode, BioProject
from db.embedded_documents import DistributionStats, TaxonAnnotationStats, TaxonGeneStats, TaxonGeneCategoryStats, TranscriptTypeStats, TaxonTranscriptTypeStats, TaxonBuscoScore
import math
from typing import List
from collections import defaultdict
from .utils import create_batches

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
        print(f"Found {orphan_qs_count} orphan assemblies, deleting them")
        orphan_qs.delete()
    print("Assemblies counts updated")

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
    variance = sum((x - mean) ** 2 for x in values) / n
    std = round(math.sqrt(variance), 2)

    return DistributionStats(
        mean=mean,
        median=median,
        std=std,
        min=min(values),
        max=max(values),
        n=n,
    )

def _extract_transcript_counts(transcript_type_stats, taxid, taxon_transcript_counts):
    """Extract total_count per transcript type; supports lnc_RNA variant for lncRNA."""
    if not transcript_type_stats:
        return
    for t_type in ['mRNA', 'lncRNA', 'miRNA', 'tRNA']:
        #merge the 2 lncRNA types into one
        if t_type == 'lncRNA':
            type_stats = transcript_type_stats.get('lnc_RNA') or transcript_type_stats.get('lncRNA')
        else:
            type_stats = transcript_type_stats.get(t_type)
        if type_stats and type_stats.get('total_count') is not None:
            taxon_transcript_counts[taxid][t_type].append(type_stats['total_count'])

def _extract_busco_scores(busco_score, taxid, taxon_busco_scores):
    """Extract scores for single_copy, duplicated, fragmented and missing"""
    if not busco_score:
        return
    for busco_type in [ 'single_copy', 'duplicated', 'fragmented', 'missing', 'complete']:
        type_stats = busco_score.get(busco_type)
        taxon_busco_scores[taxid][busco_type].append(type_stats)



def update_taxon_gene_and_transcript_stats():
    """
    Update both gene and transcript stats for taxon nodes in one pass.
    Single aggregation over GenomeAnnotation and single batched update over TaxonNode.
    """
    print("Updating taxon gene and transcript stats")

    gene_categories = ("coding", "non_coding", "pseudogene")
    transcript_types = ("mRNA", "lncRNA", "miRNA", "tRNA")

    taxon_gene_counts = defaultdict(lambda: {c: [] for c in gene_categories})
    taxon_transcript_counts = defaultdict(lambda: {t: [] for t in transcript_types})

    pipeline = [
        {"$match": {
            "taxon_lineage": {"$ne": [], "$exists": True},
            "$or": [
                {"features_statistics.gene_category_stats": {"$exists": True}},
                {"features_statistics.transcript_type_stats": {"$exists": True}}
            ]
        }},
        {"$unwind": "$taxon_lineage"},
        {"$project": {
            "taxid": "$taxon_lineage",
            "gene_category_stats": "$features_statistics.gene_category_stats",
            "transcript_type_stats": "$features_statistics.transcript_type_stats"
        }},
        {"$match": {
            "$or": [
                {"gene_category_stats": {"$ne": None}},
                {"transcript_type_stats": {"$ne": None}}
            ]
        }}
    ]

    for doc in GenomeAnnotation.objects.aggregate(*pipeline):
        taxid = doc.get("taxid")
        if not taxid:
            continue
        gene_stats = doc.get("gene_category_stats")
        if gene_stats:
            for category in gene_categories:
                cat_stats = gene_stats.get(category)
                if cat_stats and cat_stats.get("total_count") is not None:
                    taxon_gene_counts[taxid][category].append(cat_stats["total_count"])
        _extract_transcript_counts(
            doc.get("transcript_type_stats"), taxid, taxon_transcript_counts
        )

    batch_size = 1000
    all_taxon_taxids = list(TaxonNode.objects().scalar("taxid"))

    for batch_taxids in create_batches(all_taxon_taxids, batch_size):
        taxon_nodes_batch = TaxonNode.objects(taxid__in=batch_taxids)
        for taxon in taxon_nodes_batch:
            g = taxon_gene_counts.get(taxon.taxid, {c: [] for c in gene_categories})
            genes = TaxonGeneStats(
                coding=TaxonGeneCategoryStats(count=compute_distribution_stats(g.get("coding", []))),
                non_coding=TaxonGeneCategoryStats(count=compute_distribution_stats(g.get("non_coding", []))),
                pseudogene=TaxonGeneCategoryStats(count=compute_distribution_stats(g.get("pseudogene", []))),
            )
            t = taxon_transcript_counts.get(taxon.taxid, {ty: [] for ty in transcript_types})
            transcripts = TranscriptTypeStats(
                mRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t.get("mRNA", []))),
                lncRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t.get("lncRNA", []))),
                miRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t.get("miRNA", []))),
                tRNA=TaxonTranscriptTypeStats(count=compute_distribution_stats(t.get("tRNA", []))),
            )
            taxon.modify(stats=TaxonAnnotationStats(genes=genes, transcripts=transcripts))

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