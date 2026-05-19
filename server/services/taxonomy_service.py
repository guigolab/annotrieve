import os
from typing import Optional

from db.models import TaxonNode
from fastapi import HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from helpers import query_visitors as query_visitors_helper
from helpers import response as response_helper
from helpers.flattened_taxonomy_export import (
    CELLULAR_ORGANISMS_TAXID,
    FLATTENED_TREE_FIELDS,
    get_flattened_tree_file_path,
    get_flattened_tree_public_url,
)


def get_taxon_nodes(filter: str = None, rank: str = None, offset: int = 0, limit: int = 20, taxids: Optional[str] = None, sort_by: str = None, sort_order: str = 'desc'):
    query=dict()
    if rank:
        query['rank'] = rank
    if taxids:
        query['taxid__in'] = taxids.split(',') if isinstance(taxids, str) else taxids
    taxon_nodes = TaxonNode.objects(**query) if query else TaxonNode.objects()
    if filter:
        q_filter = query_visitors_helper.taxon_query(filter) if filter else None
        taxon_nodes = taxon_nodes.filter(q_filter)
    if sort_by:
        sort = '-' + sort_by if sort_order == 'desc' else sort_by
        taxon_nodes = taxon_nodes.order_by(sort)
    taxon_nodes = taxon_nodes.exclude('id').skip(offset).limit(limit).as_pymongo()
    return response_helper.json_response_with_pagination(taxon_nodes, taxon_nodes.count(), offset, limit)

def get_rank_frequencies():
    ranks = TaxonNode.objects().item_frequencies('rank')
    return ranks

def get_taxon_node(taxid: str):
    taxon_node = TaxonNode.objects(taxid=taxid).exclude('id').first()
    if not taxon_node:
        raise HTTPException(status_code=404, detail=f"Taxon node {taxid} not found")
    return taxon_node

def get_taxon_node_children(taxid: str):
    taxon_node = get_taxon_node(taxid)
    children = TaxonNode.objects(taxid__in=taxon_node['children']).exclude('id').as_pymongo()
    return response_helper.json_response_with_pagination(children, children.count(), 0, len(children))

def get_ancestors(taxid: str):
    taxon = get_taxon_node(taxid)
    ancestors = [taxon.to_mongo().to_dict()]
    parent = TaxonNode.objects(children=taxid).exclude('id').first()
    while parent:
        ancestors.append(parent.to_mongo().to_dict())
        parent = TaxonNode.objects(children=parent.taxid).exclude('id').first()
    ancestors.reverse()
    return {
        "results": ancestors,
        "total": len(ancestors)
    }


def _flattened_tree_cache_headers() -> dict:
    return {"Cache-Control": "public, max-age=86400"}


def _get_prebuilt_flattened_tree_response(format: str):
    """
    Redirect to nginx static files when prebuilt export exists; None if missing (caller uses fallback).
    """
    try:
        path = get_flattened_tree_file_path(format)
    except RuntimeError:
        return None
    if not os.path.isfile(path):
        return None
    return RedirectResponse(
        url=get_flattened_tree_public_url(format),
        status_code=307,
        headers=_flattened_tree_cache_headers(),
    )


def _get_flattened_tree_fallback(format: str = "json"):
    """
    On-the-fly flattened tree when prebuilt files are absent (cold start / DR).
    Uses parent_id when set; falls back to children scan for parent_taxid.
    """
    taxon_coll = TaxonNode._get_collection()

    parent_by_child: dict[str, str] = {}
    for doc in taxon_coll.find({"taxid": {"$ne": CELLULAR_ORGANISMS_TAXID}}, {"taxid": 1, "children": 1, "parent_id": 1}):
        taxid = doc.get("taxid")
        parent_id = doc.get("parent_id")
        if taxid and parent_id:
            parent_by_child[taxid] = parent_id
        parent_taxid = doc["taxid"]
        for child_taxid in doc.get("children", []):
            if child_taxid and child_taxid not in parent_by_child:
                parent_by_child[child_taxid] = parent_taxid

    pipeline = [
        {"$match": {"taxid": {"$ne": CELLULAR_ORGANISMS_TAXID}}},
        {"$project": {
            "taxid": 1,
            "parent_id": 1,
            "scientific_name": 1,
            "annotations_count": 1,
            "assemblies_count": 1,
            "organisms_count": 1,
            "rank": 1,
            "coding_mean_count": {"$ifNull": ["$stats.genes.coding.count.mean", 0]},
            "non_coding_mean_count": {"$ifNull": ["$stats.genes.non_coding.count.mean", 0]},
            "pseudogene_mean_count": {"$ifNull": ["$stats.genes.pseudogene.count.mean", 0]},
            "mRNA_mean_count": {"$ifNull": ["$stats.transcripts.mRNA.count.mean", 0]},
            "lncRNA_mean_count": {"$ifNull": ["$stats.transcripts.lncRNA.count.mean", 0]},
            "tRNA_mean_count": {"$ifNull": ["$stats.transcripts.tRNA.count.mean", 0]},
            "miRNA_mean_count": {"$ifNull": ["$stats.transcripts.miRNA.count.mean", 0]},
            "busco_single_copy_mean": {"$ifNull": ["$stats.busco.single_copy.mean", 0]},
            "busco_duplicated_mean": {"$ifNull": ["$stats.busco.duplicated.mean", 0]},
            "busco_fragmented_mean": {"$ifNull": ["$stats.busco.fragmented.mean", 0]},
            "busco_missing_mean": {"$ifNull": ["$stats.busco.missing.mean", 0]},
            "_id": 0
        }}
    ]

    if format and format.lower() == "tsv":
        TSV_BUFFER_SIZE = 5000

        def stream_tsv():
            yield "\t".join(FLATTENED_TREE_FIELDS) + "\n"
            buffer: list[str] = []
            for doc in taxon_coll.aggregate(pipeline):
                taxid = doc["taxid"]
                parent_taxid = doc.get("parent_id") or parent_by_child.get(taxid)
                row_values = [
                    str(taxid),
                    str(parent_taxid) if parent_taxid else "",
                    str(doc.get("scientific_name", "")).replace("\t", " ").replace("\n", " "),
                    str(doc.get("annotations_count", 0)),
                    str(doc.get("assemblies_count", 0)),
                    str(doc.get("organisms_count", 0)),
                    str(doc.get("rank", "")).replace("\t", " ").replace("\n", " "),
                    str(doc.get("coding_mean_count", 0)),
                    str(doc.get("non_coding_mean_count", 0)),
                    str(doc.get("pseudogene_mean_count", 0)),
                    str(doc.get("mRNA_mean_count", 0)),
                    str(doc.get("lncRNA_mean_count", 0)),
                    str(doc.get("tRNA_mean_count", 0)),
                    str(doc.get("miRNA_mean_count", 0)),
                    str(doc.get("busco_single_copy_mean", 0)),
                    str(doc.get("busco_duplicated_mean", 0)),
                    str(doc.get("busco_fragmented_mean", 0)),
                    str(doc.get("busco_missing_mean", 0)),
                ]
                buffer.append("\t".join(row_values) + "\n")
                if len(buffer) >= TSV_BUFFER_SIZE:
                    yield "".join(buffer)
                    buffer.clear()
            if buffer:
                yield "".join(buffer)

        return StreamingResponse(
            stream_tsv(),
            media_type="text/tab-separated-values",
            headers={
                "Content-Type": "text/tab-separated-values; charset=utf-8",
                "X-Accel-Buffering": "no",
            },
        )

    rows = []
    for doc in taxon_coll.aggregate(pipeline):
        taxid = doc["taxid"]
        parent_taxid = doc.get("parent_id") or parent_by_child.get(taxid)
        rows.append([
            taxid,
            parent_taxid,
            doc.get("scientific_name"),
            doc.get("annotations_count", 0),
            doc.get("assemblies_count", 0),
            doc.get("organisms_count", 0),
            doc.get("rank"),
            doc.get("coding_mean_count", 0),
            doc.get("non_coding_mean_count", 0),
            doc.get("pseudogene_mean_count", 0),
            doc.get("mRNA_mean_count", 0),
            doc.get("lncRNA_mean_count", 0),
            doc.get("tRNA_mean_count", 0),
            doc.get("miRNA_mean_count", 0),
            doc.get("busco_single_copy_mean", 0),
            doc.get("busco_duplicated_mean", 0),
            doc.get("busco_fragmented_mean", 0),
            doc.get("busco_missing_mean", 0),
        ])
    return {"fields": FLATTENED_TREE_FIELDS, "rows": rows}


def get_flattened_tree(format: str = "json"):
    """
    Returns flattened taxonomy tree.
    - When prebuilt files exist: 307 redirect to /annotrieve/files/taxonomy/flattened-tree.{tsv|json} (nginx static).
    - Otherwise: on-the-fly aggregation fallback.
    - format='json' (default): JSON with fields + rows.
    - format='tsv': TSV file.
    """
    prebuilt = _get_prebuilt_flattened_tree_response(format)
    if prebuilt is not None:
        return prebuilt
    return _get_flattened_tree_fallback(format)
