from .celery_utils import create_celery
from db.database import connect_to_db
from jobs.import_annotations import import_annotations
from jobs.backfill_providers import backfill_annotation_providers
from jobs.assemblies import (
    backfill_assembly_reports,
    backfill_placeholder_assembly_paths,
    retry_missing_assembly_reports,
    sweep_orphan_assembly_files,
    sync_new_assemblies_from_summary,
)
from jobs.migration import (
    backfill_taxon_parent_id,
    remap_all_assemblies_and_annotations,
    unset_genome_annotation_mapped_regions_task,
)
from jobs.taxonomy import export_flattened_taxonomy
from jobs.updates import (
    prune_annotations_missing_source_url,
    update_busco_scores,
    update_records,
    update_taxon_stats,
    update_taxons_busco_scores_job,
)
from jobs.track_users import track_unique_users_by_country
from jobs.upload_gff import compute_custom_gff_stats
from jobs.repair_annotation_files import repair_missing_annotation_files
from jobs.relocate_assembly_files import relocate_misplaced_assembly_files


app = create_celery()

connect_to_db()
