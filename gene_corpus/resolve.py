"""Resolve GFF location (local path or URL) and select corpus profile."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from gene_corpus.catalog.models import AnnotationJob
from gene_corpus.catalog.report import ReportRow
from gene_corpus.gating import build_parse_gate
from gene_corpus.profiles import PROFILES

# Report database label → profile_id
_DATABASE_TO_PROFILE: dict[str, str] = {
    "ensembl": "ensembl",
    "genbank": "genbank",
    "refseq": "refseq",
}


def profile_id_for_database(database: str) -> str | None:
    """Map annotation database string to a gene_corpus profile id."""
    return _DATABASE_TO_PROFILE.get(database.strip().casefold())


@dataclass
class ResolveStats:
    ready: int = 0
    skipped_missing: int = 0
    skipped_no_profile: int = 0
    skipped_no_url: int = 0


def resolve_jobs(
    rows: list[ReportRow],
    *,
    gff_mode: str,
    files_root: Path | None = None,
) -> tuple[list[AnnotationJob], ResolveStats]:
    """
    Attach profile, resolve path/url, build ParseGate.

    local: files_root / bgzip_path — skip if file missing.
    url: record source_url — skip if empty (download deferred).
    """
    if gff_mode not in ("local", "url"):
        raise ValueError(f"gff_mode must be 'local' or 'url', got {gff_mode!r}")
    if gff_mode == "local" and files_root is None:
        raise ValueError("files_root is required for gff_mode=local")

    stats = ResolveStats()
    jobs: list[AnnotationJob] = []

    for row in rows:
        profile_id = profile_id_for_database(row.database)
        if profile_id is None or profile_id not in PROFILES:
            stats.skipped_no_profile += 1
            continue

        resolved_path: str | None = None
        resolved_url: str | None = None

        if gff_mode == "local":
            assert files_root is not None
            relative = row.bgzip_path.lstrip("/")
            if not relative:
                stats.skipped_missing += 1
                continue
            path = files_root / relative
            if not path.is_file():
                stats.skipped_missing += 1
                continue
            resolved_path = str(path)
        else:
            if not row.source_url:
                stats.skipped_no_url += 1
                continue
            resolved_url = row.source_url

        gate = build_parse_gate(
            profile_id,
            attribute_keys=row.attribute_keys,
            feature_types=row.feature_types,
            root_type_counts=row.root_type_counts,
            has_cds=row.has_cds,
        )

        jobs.append(
            AnnotationJob(
                annotation_id=row.annotation_id or (
                    Path(resolved_path).stem if resolved_path else "unknown"
                ),
                database=row.database,
                profile_id=profile_id,
                taxid=row.taxid,
                assembly_accession=row.assembly_accession,
                provider=row.provider,
                attribute_keys=list(row.attribute_keys),
                feature_types=list(row.feature_types),
                root_type_counts=(
                    dict(row.root_type_counts) if row.root_type_counts else None
                ),
                has_cds=row.has_cds,
                bgzip_path=row.bgzip_path,
                source_url=row.source_url,
                gff_mode=gff_mode,
                resolved_path=resolved_path,
                resolved_url=resolved_url,
                gate=gate,
                organism_name=row.organism_name,
            )
        )
        stats.ready += 1

    return jobs, stats
