"""Cleanup for deprecated GenomeAnnotation.mapped_regions."""

from db.models import GenomeAnnotation


def count_genome_annotations_with_mapped_regions() -> int:
    return GenomeAnnotation.objects(mapped_regions__exists=True).count()


def unset_genome_annotation_mapped_regions() -> int:
    """Remove deprecated mapped_regions from all GenomeAnnotation documents."""
    result = GenomeAnnotation._get_collection().update_many(
        {"mapped_regions": {"$exists": True}},
        {"$unset": {"mapped_regions": ""}},
    )
    return result.modified_count
