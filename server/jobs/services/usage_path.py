"""
Classify API request paths into product capabilities and extract opened entities.
Paths are expected without /annotrieve/api/v0 prefix and without query string.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple
from urllib.parse import unquote, urlparse

API_PREFIXES = (
    "/annotrieve/api/v0",
    "/api/v0",
)

ASSEMBLY_RE = re.compile(r"(GC[AF]_\d+\.\d+)", re.IGNORECASE)
MD5_RE = re.compile(r"^[a-fA-F0-9]{32}$")
TAXID_RE = re.compile(r"^\d+$")

# Ordered capability labels for the public UI
CAPABILITY_LABELS = {
    "search": "Searching annotations",
    "entity_detail": "Opening records",
    "taxonomy": "Exploring taxonomy",
    "stats": "Comparing statistics",
    "browser": "Viewing in browser",
    "download": "Downloading GFF",
    "upload": "Uploading custom GFF",
    "other": "Other API use",
}

TOP_N = 10


@dataclass(frozen=True)
class PathClassification:
    capability: str
    entity_kind: Optional[str] = None  # assembly | annotation | taxon
    entity_id: Optional[str] = None


def normalize_api_path(raw_uri: str) -> str:
    """Strip host, query, fragment, and API mount prefix; return path starting with /."""
    if not raw_uri:
        return "/"
    parsed = urlparse(raw_uri if "://" in raw_uri else f"http://local{raw_uri}")
    path = unquote(parsed.path or "/")
    for prefix in API_PREFIXES:
        if path.startswith(prefix):
            path = path[len(prefix) :] or "/"
            break
    if not path.startswith("/"):
        path = "/" + path
    # collapse duplicate slashes
    while "//" in path:
        path = path.replace("//", "/")
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    return path or "/"


def classify_path(raw_uri: str) -> PathClassification:
    path = normalize_api_path(raw_uri)
    parts = [p for p in path.split("/") if p]
    lower = path.lower()

    # Exclude internal/admin traffic from product capabilities
    if parts and parts[0] in ("jobs", "analytics"):
        return PathClassification(capability="other")

    # Upload
    if "upload-gff" in lower:
        return PathClassification(capability="upload")

    # Download / GFF stream
    if lower.endswith("/gff") or "/annotations/report" in lower or path == "/annotations/report":
        entity = _annotation_entity_from_parts(parts)
        return PathClassification(
            capability="download",
            entity_kind=entity[0] if entity else None,
            entity_id=entity[1] if entity else None,
        )

    # Genome browser helpers
    if any(
        token in lower
        for token in (
            "/contigs",
            "chr-aliases",
            "chr_aliases",
            "assembled-molecules",
            "assembled_molecules",
            "/paired",
        )
    ):
        entity = _entity_from_browser_path(parts)
        return PathClassification(
            capability="browser",
            entity_kind=entity[0] if entity else None,
            entity_id=entity[1] if entity else None,
        )

    # Stats / compare
    if any(
        token in lower
        for token in (
            "gene-stats",
            "transcript-stats",
            "busco-stats",
            "/frequencies",
            "/annotations/aggregates",
        )
    ):
        return PathClassification(capability="stats")

    # Taxonomy tree / lineage helpers (before generic taxons/{id})
    if parts and parts[0] == "taxons":
        if len(parts) == 1:
            return PathClassification(capability="search")
        if parts[1] in ("flattened-tree", "frequencies") or (
            len(parts) >= 3 and parts[2] in ("children", "ancestors")
        ):
            taxid = parts[1] if TAXID_RE.match(parts[1] or "") else None
            return PathClassification(
                capability="taxonomy",
                entity_kind="taxon" if taxid else None,
                entity_id=taxid,
            )
        if TAXID_RE.match(parts[1]):
            return PathClassification(
                capability="entity_detail",
                entity_kind="taxon",
                entity_id=parts[1],
            )

    # List / search endpoints (exact resource roots)
    if path in ("/annotations", "/organisms", "/assemblies", "/bioprojects"):
        return PathClassification(capability="search")

    # Entity detail
    if parts and parts[0] == "annotations" and len(parts) >= 2 and MD5_RE.match(parts[1]):
        return PathClassification(
            capability="entity_detail",
            entity_kind="annotation",
            entity_id=parts[1].lower(),
        )

    if parts and parts[0] == "assemblies" and len(parts) >= 2:
        m = ASSEMBLY_RE.search(parts[1])
        if m:
            return PathClassification(
                capability="entity_detail",
                entity_kind="assembly",
                entity_id=m.group(1).upper().replace("GCA_", "GCA_").replace("GCF_", "GCF_"),
            )
        # normalize accession casing: keep as in path but uppercase GC prefix style
        acc = parts[1]
        if ASSEMBLY_RE.match(acc):
            return PathClassification(
                capability="entity_detail",
                entity_kind="assembly",
                entity_id=acc,
            )

    if parts and parts[0] == "organisms" and len(parts) >= 2 and TAXID_RE.match(parts[1]):
        return PathClassification(
            capability="entity_detail",
            entity_kind="taxon",
            entity_id=parts[1],
        )

    if parts and parts[0] == "bioprojects" and len(parts) >= 2:
        return PathClassification(capability="entity_detail")

    # Fallback: try to harvest assembly/annotation ids even in "other"
    assembly_m = ASSEMBLY_RE.search(path)
    if assembly_m:
        return PathClassification(
            capability="other",
            entity_kind="assembly",
            entity_id=assembly_m.group(1),
        )

    return PathClassification(capability="other")


def _annotation_entity_from_parts(parts: list[str]) -> Optional[Tuple[str, str]]:
    if len(parts) >= 2 and parts[0] == "annotations" and MD5_RE.match(parts[1]):
        return ("annotation", parts[1].lower())
    return None


def _entity_from_browser_path(parts: list[str]) -> Optional[Tuple[str, str]]:
    if not parts:
        return None
    if parts[0] == "annotations" and len(parts) >= 2 and MD5_RE.match(parts[1]):
        return ("annotation", parts[1].lower())
    if parts[0] == "assemblies" and len(parts) >= 2:
        m = ASSEMBLY_RE.search(parts[1])
        if m:
            return ("assembly", m.group(1))
    return None
