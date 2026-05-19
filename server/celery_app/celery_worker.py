from .celery_utils import create_celery
from db.database import connect_to_db
from jobs.import_annotations import import_annotations
from jobs.assemblies import sync_new_assemblies_from_summary
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


app = create_celery()

connect_to_db()
