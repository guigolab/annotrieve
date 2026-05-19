import os

from celery import shared_task

from helpers.flattened_taxonomy_export import export_flattened_taxonomy_files

ANNOTATIONS_PATH = os.getenv("LOCAL_ANNOTATIONS_DIR")


def schedule_flattened_taxonomy_export():
    """Enqueue export after taxonomy-related writes (non-blocking)."""
    export_flattened_taxonomy.delay()


@shared_task(name="export_flattened_taxonomy", ignore_result=False)
def export_flattened_taxonomy():
    """
    Write prebuilt flattened-tree.tsv and flattened-tree.json under LOCAL_ANNOTATIONS_DIR/taxonomy/.
    """
    return export_flattened_taxonomy_files(ANNOTATIONS_PATH)
