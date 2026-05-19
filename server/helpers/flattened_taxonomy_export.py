"""
Export prebuilt flattened taxonomy tree files (TSV + JSON) for the API hot path.
"""
import json
import os
from typing import Any

from db.models import TaxonNode

CELLULAR_ORGANISMS_TAXID = "131567"

FLATTENED_TREE_FIELDS = [
    "taxid",
    "parent_taxid",
    "scientific_name",
    "annotations_count",
    "assemblies_count",
    "organisms_count",
    "rank",
    "coding_mean_count",
    "non_coding_mean_count",
    "pseudogene_mean_count",
    "mRNA_mean_count",
    "lncRNA_mean_count",
    "tRNA_mean_count",
    "miRNA_mean_count",
    "busco_single_copy_mean",
    "busco_duplicated_mean",
    "busco_fragmented_mean",
    "busco_missing_mean",
]

FLATTENED_TREE_PROJECTION = {
    "taxid": 1,
    "parent_id": 1,
    "scientific_name": 1,
    "annotations_count": 1,
    "assemblies_count": 1,
    "organisms_count": 1,
    "rank": 1,
    "stats.genes.coding.count.mean": 1,
    "stats.genes.non_coding.count.mean": 1,
    "stats.genes.pseudogene.count.mean": 1,
    "stats.transcripts.mRNA.count.mean": 1,
    "stats.transcripts.lncRNA.count.mean": 1,
    "stats.transcripts.tRNA.count.mean": 1,
    "stats.transcripts.miRNA.count.mean": 1,
    "stats.busco.single_copy.mean": 1,
    "stats.busco.duplicated.mean": 1,
    "stats.busco.fragmented.mean": 1,
    "stats.busco.missing.mean": 1,
}


def get_flattened_taxonomy_dir(base_dir: str | None = None) -> str:
    root = base_dir or os.getenv("LOCAL_ANNOTATIONS_DIR")
    if not root:
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set")
    return os.path.join(root, "taxonomy")


def get_flattened_tree_file_path(fmt: str, base_dir: str | None = None) -> str:
    ext = "tsv" if fmt.lower() == "tsv" else "json"
    return os.path.join(get_flattened_taxonomy_dir(base_dir), f"flattened-tree.{ext}")


def get_flattened_tree_public_url(fmt: str) -> str:
    """
    Browser-facing path for the prebuilt file (served by nginx under /annotrieve/files/).
    Override with PUBLIC_FILES_BASE if the deployment uses a different prefix.
    """
    files_base = os.getenv("PUBLIC_FILES_BASE", "/annotrieve/files").rstrip("/")
    ext = "tsv" if fmt.lower() == "tsv" else "json"
    return f"{files_base}/taxonomy/flattened-tree.{ext}"


def _stats_mean(doc: dict, *path: str) -> float:
    cur: Any = doc.get("stats") or {}
    for key in path:
        if not isinstance(cur, dict):
            return 0.0
        cur = cur.get(key)
    if cur is None:
        return 0.0
    try:
        return float(cur)
    except (TypeError, ValueError):
        return 0.0


def doc_to_json_row(doc: dict) -> list:
    parent_id = doc.get("parent_id")
    return [
        doc.get("taxid"),
        parent_id if parent_id else None,
        doc.get("scientific_name"),
        doc.get("annotations_count", 0) or 0,
        doc.get("assemblies_count", 0) or 0,
        doc.get("organisms_count", 0) or 0,
        doc.get("rank"),
        _stats_mean(doc, "genes", "coding", "count", "mean"),
        _stats_mean(doc, "genes", "non_coding", "count", "mean"),
        _stats_mean(doc, "genes", "pseudogene", "count", "mean"),
        _stats_mean(doc, "transcripts", "mRNA", "count", "mean"),
        _stats_mean(doc, "transcripts", "lncRNA", "count", "mean"),
        _stats_mean(doc, "transcripts", "tRNA", "count", "mean"),
        _stats_mean(doc, "transcripts", "miRNA", "count", "mean"),
        _stats_mean(doc, "busco", "single_copy", "mean"),
        _stats_mean(doc, "busco", "duplicated", "mean"),
        _stats_mean(doc, "busco", "fragmented", "mean"),
        _stats_mean(doc, "busco", "missing", "mean"),
    ]


def doc_to_tsv_line(doc: dict) -> str:
    row = doc_to_json_row(doc)
    str_values = []
    for i, val in enumerate(row):
        if i == 1:
            str_values.append(str(val) if val else "")
        elif i in (2, 6):
            s = str(val or "").replace("\t", " ").replace("\n", " ")
            str_values.append(s)
        else:
            str_values.append(str(val if val is not None else 0))
    return "\t".join(str_values) + "\n"


def _atomic_replace(tmp_path: str, final_path: str) -> None:
    os.replace(tmp_path, final_path)


def export_flattened_taxonomy_files(base_dir: str | None = None) -> dict:
    """
    Write flattened-tree.tsv and flattened-tree.json under taxonomy/.
    Returns summary dict with row counts and paths.
    """
    out_dir = get_flattened_taxonomy_dir(base_dir)
    os.makedirs(out_dir, exist_ok=True)

    tsv_path = get_flattened_tree_file_path("tsv", base_dir)
    json_path = get_flattened_tree_file_path("json", base_dir)
    tsv_tmp = tsv_path + ".tmp"
    json_tmp = json_path + ".tmp"

    taxon_coll = TaxonNode._get_collection()
    cursor = taxon_coll.find(
        {"taxid": {"$ne": CELLULAR_ORGANISMS_TAXID}},
        FLATTENED_TREE_PROJECTION,
    ).batch_size(1000)

    row_count = 0
    with open(tsv_tmp, "w", encoding="utf-8") as tsv_f, open(json_tmp, "w", encoding="utf-8") as json_f:
        tsv_f.write("\t".join(FLATTENED_TREE_FIELDS) + "\n")
        json_f.write('{"fields":')
        json.dump(FLATTENED_TREE_FIELDS, json_f, ensure_ascii=False)
        json_f.write(',"rows":[')
        first_row = True

        for doc in cursor:
            if doc.get("taxid") == "2759":
                doc["parent_id"] = None
            tsv_f.write(doc_to_tsv_line(doc))
            row = doc_to_json_row(doc)
            if not first_row:
                json_f.write(",")
            json.dump(row, json_f, ensure_ascii=False)
            first_row = False
            row_count += 1

        json_f.write("]}")

    _atomic_replace(tsv_tmp, tsv_path)
    _atomic_replace(json_tmp, json_path)

    print(f"Exported flattened taxonomy: {row_count} rows -> {tsv_path}, {json_path}")
    return {"row_count": row_count, "tsv_path": tsv_path, "json_path": json_path}
