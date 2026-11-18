import fcntl
import logging
import os
import shutil
import random
import tempfile
from contextlib import contextmanager
from celery import shared_task
from helpers import file as file_helper
from .services.classes import AnnotationToProcess
from .services import annotation as annotation_service
from .services import assembly as assembly_service
from .services import taxonomy as taxonomy_service
from .services import stats as stats_service
from .services import feature_summary as feature_summary_service
from .services import feature_stats as feature_stats_service
from db.models import GenomeAnnotation, TaxonNode
from helpers import assembly_sequence_files as seq_files
from .services.utils import create_batches
from mongoengine import Q

logger = logging.getLogger(__name__)

# Large downloads and sort spill files live here: point it at real disk, not at a RAM-backed tmpfs.
TMP_DIR = os.getenv("IMPORT_TMP_DIR", "/tmp")
ANNOTATIONS_PATH = os.getenv('LOCAL_ANNOTATIONS_DIR')
GH_PATH = 'https://raw.githubusercontent.com/guigolab/genome-annotation-tracker/refs/heads/main/data/'
URLS_TO_FETCH = [
    GH_PATH + 'community_annotations.tsv',
    GH_PATH + 'ensembl_annotations.tsv',
    GH_PATH + 'genbank_annotations.tsv',
    GH_PATH + 'refseq_annotations.tsv',
]


def _env_flag(name: str) -> bool:
    """True only for explicit truthy values: DEV=0 / DEV=false must not enable dev mode."""
    return os.getenv(name, '').strip().lower() in ('1', 'true', 'yes', 'on')


DEV = _env_flag('DEV')
DEV_SAMPLE_SIZE = 200
BATCH_SIZE = 10
LOCK_PATH = os.path.join(TMP_DIR, 'annotrieve_import_annotations.lock')
RUN_DIR_PREFIX = 'import_annotations_'
PART_SUFFIXES = ('.gff.gz.part', '.gff.gz.part.csi')


@contextmanager
def _exclusive_run():
    """
    Non-blocking, host-local exclusive lock so two runs (beat + manual trigger) never share
    temp files or output paths. Yields True if acquired. The lock is released by the OS if the
    process dies, so a killed run can never leave a stale lock behind.
    """
    os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    handle = open(LOCK_PATH, 'w')
    try:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
    finally:
        handle.close()


def _filesystem_type(path: str, mounts_file: str = '/proc/mounts') -> str | None:
    """Filesystem type of the mount holding `path` (longest matching mount point), if known."""
    try:
        real = os.path.realpath(path)
        best, best_type = '', None
        with open(mounts_file) as fh:
            for line in fh:
                parts = line.split()
                if len(parts) < 3:
                    continue
                mount_point = parts[1].replace('\\040', ' ')
                if (real == mount_point or real.startswith(mount_point.rstrip('/') + '/')) and len(mount_point) > len(best):
                    best, best_type = mount_point, parts[2]
        return best_type
    except OSError:
        return None


def _warn_if_ram_backed(path: str) -> None:
    if _filesystem_type(path) in ('tmpfs', 'ramfs'):
        logger.warning(
            f"WARNING: {path} is on a RAM-backed filesystem; downloaded GFFs and sort spill files "
            f"count against memory. Set IMPORT_TMP_DIR to a disk-backed directory."
        )


def _sweep_stale_leftovers(tmp_root: str, annotations_root: str) -> None:
    """
    Remove what a previous run left behind when it was killed (OOM, restart): its work directory
    and unpublished ``.part`` files. Only call this while holding the exclusive lock.
    """
    try:
        for name in os.listdir(tmp_root):
            if name.startswith(RUN_DIR_PREFIX):
                shutil.rmtree(os.path.join(tmp_root, name), ignore_errors=True)
    except OSError as e:
        logger.warning(f"Could not sweep {tmp_root}: {e}")
    for dirpath, _dirnames, filenames in os.walk(annotations_root):
        for filename in filenames:
            if filename.endswith(PART_SUFFIXES):
                try:
                    os.remove(os.path.join(dirpath, filename))
                except OSError as e:
                    logger.warning(f"Could not remove stale {filename}: {e}")


def _taxon_node_count() -> int | None:
    try:
        return TaxonNode.objects.count()
    except Exception:
        return None


def _refresh_if_taxonomy_changed(taxon_nodes_before: int | None) -> None:
    """
    Early exits (nothing left to import) must not skip the taxonomy export and DB counts when
    this run did save new organisms / taxon nodes.
    """
    after = _taxon_node_count()
    if taxon_nodes_before is None or after is None or after == taxon_nodes_before:
        return
    logger.info(f"Taxonomy changed ({taxon_nodes_before} -> {after} taxon nodes); refreshing counts and export")
    stats_service.update_db_stats()
    from .taxonomy import export_flattened_taxonomy
    export_flattened_taxonomy.delay()


def _record_dropped(before: list[AnnotationToProcess], after: list[AnnotationToProcess], reason) -> None:
    """Record an AnnotationError for rows that were filtered out, so the drop is not silent."""
    kept = {id(annotation) for annotation in after}
    for annotation in before:
        if id(annotation) not in kept:
            annotation_service.handle_annotation_error(annotation, reason(annotation))


def _int_env(name: str) -> int | None:
    value = os.getenv(name, '').strip()
    return int(value) if value.isdigit() and int(value) > 0 else None


@shared_task(
    name='import_annotations',
    ignore_result=False,
    # Opt-in (seconds): a hung run would otherwise hold the lock and the worker forever. The soft
    # limit raises inside the task so the run dir, lock and assembly sync are still handled.
    soft_time_limit=_int_env('IMPORT_ANNOTATIONS_SOFT_TIME_LIMIT'),
    time_limit=_int_env('IMPORT_ANNOTATIONS_TIME_LIMIT'),
)
def import_annotations():
    """
    Orchestrate the import job: fetch → filter → enrich → process → persist → stats → cleanup.
    """
    if not ANNOTATIONS_PATH:
        # Without this, paths silently become "None/<taxid>/..." relative to the CWD.
        raise RuntimeError("LOCAL_ANNOTATIONS_DIR is not set; refusing to import annotations")
    os.makedirs(TMP_DIR, exist_ok=True)
    with _exclusive_run() as acquired:
        if not acquired:
            logger.info("Another import_annotations run is in progress, skipping this one")
            return
        _warn_if_ram_backed(TMP_DIR)
        _sweep_stale_leftovers(TMP_DIR, ANNOTATIONS_PATH)
        run_dir = tempfile.mkdtemp(prefix=RUN_DIR_PREFIX, dir=TMP_DIR)
        try:
            _run_import(run_dir)
        finally:
            shutil.rmtree(run_dir, ignore_errors=True)


def _run_import(run_dir: str) -> None:
    new_saved_assemblies: list[str] = []
    logger.info("Starting import annotations job...")
    # fetch annotations and deduplicate by md5 checksum and url path (exact match)
    new_annotations = []
    listed_urls: set[str] = set()  # every url the tracker lists right now (new or not)
    if DEV:
        url = URLS_TO_FETCH[0] #community_annotations.tsv
        fetched_annotations = annotation_service.fetch_from_url(url)
        listed_urls.update(a.access_url for a in fetched_annotations)
        # here we filter those incoming annotations 
        # that are already in the database by md5 checksum and url path 
        # exact match (perfect match) of the source file
        # we will handle later those which url exists but the md5 checksum is different
        filtered_annotations = annotation_service.filter_annotations_by_md5_checksum_and_url_path(fetched_annotations)
        new_annotations.extend(filtered_annotations)
    else:
        for url in URLS_TO_FETCH:
            fetched_annotations = annotation_service.fetch_from_url(url)
            listed_urls.update(a.access_url for a in fetched_annotations)
            # here we filter those incoming annotations 
            # that are already in the database by md5 checksum and url path 
            # exact match (perfect match) of the source file
            # we will handle later those which url exists but the md5 checksum is different
            filtered_annotations = annotation_service.filter_annotations_by_md5_checksum_and_url_path(fetched_annotations)
            new_annotations.extend(filtered_annotations)

    new_annotations = annotation_service.skip_known_conflicts(new_annotations)

    if DEV:
        new_annotations = random.sample(new_annotations, min(DEV_SAMPLE_SIZE, len(new_annotations)))

    logger.info(f"Found {len(new_annotations)} new annotations to process")
    
    # LINEAGE HANDLING STEP
    taxon_nodes_before = _taxon_node_count()
    valid_lineages = taxonomy_service.handle_taxonomy(new_annotations, run_dir) #lineages saved in the database, return a dict of taxid:lineage
    new_annotations_to_process = annotation_service.filter_annotations_dict_by_field(
        new_annotations, 'taxon_id', valid_lineages.keys()
    )
    _record_dropped(
        new_annotations, new_annotations_to_process,
        lambda a: f"Taxon id {a.taxon_id!r} could not be resolved to a lineage",
    )


    if not new_annotations_to_process:
        logger.info("No new annotations to process after filtering by lineage, exiting...")
        _refresh_if_taxonomy_changed(taxon_nodes_before)
        return
    
    # ASSEMBLY HANDLING STEP (here we also hanlde bioprojects)
    valid_accessions, new_saved_assemblies = assembly_service.handle_assemblies(
        new_annotations_to_process, run_dir, valid_lineages
    )
    try:
        assembly_filtered = annotation_service.filter_annotations_dict_by_field(
            new_annotations_to_process, 'assembly_accession', valid_accessions
        )
        _record_dropped(
            new_annotations_to_process, assembly_filtered,
            lambda a: f"Assembly {a.assembly_accession!r} was not found in NCBI",
        )
        new_annotations_to_process, repeated = annotation_service.dedupe_annotations(assembly_filtered)
        if repeated:
            logger.info(f"Skipping {len(repeated)} repeated rows (same url or source md5 listed more than once)")
        # same published file at a new url: reconcile the stored record, no download needed
        new_annotations_to_process, _moved = annotation_service.reconcile_moved_sources(
            new_annotations_to_process, listed_urls=listed_urls
        )
        if not new_annotations_to_process:
            logger.info("No new annotations to process after filtering by assembly, exiting...")
            _refresh_if_taxonomy_changed(taxon_nodes_before)
            return

        logger.info(f"Found {len(new_annotations_to_process)} new annotations to process")

        #the annotation id is the md5 of the uncompressed sorted file; the pipeline adds to this set as it goes
        existing_annotation_md5s = set(GenomeAnnotation.objects().no_cache().scalar('annotation_id'))
        saved_annotation_ids: list[str] = []
        md5_mismatches: list[tuple[AnnotationToProcess, str]] = []
        for annotations in create_batches(new_annotations_to_process, BATCH_SIZE):
            processed_annotations = process_annotations_pipeline(
                annotations, valid_lineages, existing_annotation_md5s, work_dir=run_dir,
                md5_mismatches=md5_mismatches,
            )
            if processed_annotations:
                saved_annotation_ids.extend(
                    annotation_service.save_annotations(processed_annotations, ANNOTATIONS_PATH) or []
                )
                _record_md5_mismatches(md5_mismatches, processed_annotations, saved_annotation_ids)
            else:
                logger.info("No annotations processed")

        #clean up annotations with errors
        annotation_service.clean_up_annotations_with_errors()

        #clean up corrupted annotations, only among those saved by this run (never touch older data)
        for saved_batch in create_batches(saved_annotation_ids, 500):
            query = (
                Q(annotation_id__in=saved_batch)
                & Q(features_summary__sources=[]) & Q(features_summary__types=[]) & Q(features_summary__attribute_keys=[])
            )
            annotation_service.delete_annotations(query, ANNOTATIONS_PATH)

        #UPDATE DB AND TAXON GENE STATS
        stats_service.update_db_stats()
        stats_service.update_taxon_gene_and_transcript_stats()
    finally:
        # The new assemblies are already persisted with a placeholder download_url. Next run they
        # count as "existing", so if this dispatch is skipped (early return or any later failure)
        # they would never get their FTP paths / sequences synced.
        if new_saved_assemblies:
            from .assemblies import sync_new_assemblies_from_summary
            sync_new_assemblies_from_summary.delay(accessions=new_saved_assemblies)

    from .taxonomy import export_flattened_taxonomy
    export_flattened_taxonomy.delay()

    logger.info("Import annotations job successfully finished")


def _record_md5_mismatches(md5_mismatches, processed_annotations, saved_ids) -> None:
    """
    The tracker md5 did not match the downloaded content (the file changed after the tracker probed
    it, or the tracker is lagging). The annotation is stored under the tracker md5 and heals itself
    once the tracker refreshes; meanwhile the mismatch is recorded. It must be written AFTER the
    save, because saving clears the errors of the stored urls/md5s.
    """
    saved = set(saved_ids)
    stored_md5s = {a.source_file_info.uncompressed_md5 for a in processed_annotations if a.annotation_id in saved}
    for annotation, message in md5_mismatches:
        if annotation.md5_checksum in stored_md5s:
            annotation_service.handle_annotation_error(
                annotation, message, kind=annotation_service.ERROR_KIND_MD5_MISMATCH
            )
    md5_mismatches.clear()


def _discard_failed_outputs(full_bgzipped_path: str | None, relative_bgzipped_path: str | None) -> None:
    """
    Best-effort removal of the files produced for an annotation that failed after (part of)
    its outputs were written. Never raises: it runs inside an except handler, and an
    exception here would abort the whole batch.
    """
    if not full_bgzipped_path:
        return
    relative_csi_path = f"{relative_bgzipped_path}.csi"
    targets = (
        (full_bgzipped_path, relative_bgzipped_path),
        (f"{full_bgzipped_path}.csi", relative_csi_path),
        # contigs.txt is keyed on the bgzipped path: only remove it if that path is unreferenced
        (f"{full_bgzipped_path}{seq_files.CONTIGS_SUFFIX}", relative_bgzipped_path),
    )
    for full_path, relative_path in targets:
        try:
            annotation_service.safe_remove_annotation_file(full_path, ANNOTATIONS_PATH, relative_path)
        except Exception as cleanup_error:
            logger.warning(f"- Could not remove {full_path}: {cleanup_error}")


def process_annotations_pipeline(annotations: list[AnnotationToProcess], valid_lineages: dict[str, list[str]], existing_annotation_md5s, work_dir: str | None = None, md5_mismatches: list | None = None) -> list[GenomeAnnotation]:
    """
    Download, sort, index and describe each annotation. `existing_annotation_md5s` is the set of
    content md5s already stored; when it is a set it is updated in place with every annotation
    processed here, so identical content appearing twice in one run is detected as a duplicate.
    """
    work_dir = work_dir or TMP_DIR
    processed_annotations = []
    for annotation_to_process in annotations:
        logger.info(f"Processing {annotation_to_process.access_url}:")
        tmp_subdir_path = None
        full_bgzipped_path = relative_bgzipped_path = None
        try:
            # Everything that can fail (including setup) lives inside the try, so one bad
            # annotation is recorded as an error instead of aborting the whole job.
            # the md5 names the work dir that is rmtree'd afterwards: validate before using it
            annotation_service.validate_path_fields(annotation_to_process)
            tmp_subdir_path = file_helper.create_dir_path(work_dir, f"{annotation_to_process.md5_checksum}")
            full_bgzipped_path, relative_bgzipped_path = annotation_service.init_annotation_file_paths(ANNOTATIONS_PATH, annotation_to_process)
            relative_csi_path = f"{relative_bgzipped_path}.csi"

            md5_checksum, file_size = annotation_service.process_annotation_file(annotation_to_process, tmp_subdir_path, full_bgzipped_path, existing_annotation_md5s)
            if md5_mismatches is not None:
                actual = annotation_service.compute_source_md5(
                    f"{tmp_subdir_path}/{annotation_to_process.md5_checksum}.gff.gz"
                )
                if actual and actual != annotation_to_process.md5_checksum:
                    message = (
                        f"Downloaded content md5 {actual} differs from the tracker md5 "
                        f"{annotation_to_process.md5_checksum} (file changed after the tracker probed it?)"
                    )
                    logger.warning(f"- {annotation_to_process.access_url}: {message}")
                    md5_mismatches.append((annotation_to_process, message))
            indexed_file_info = annotation_service.init_indexed_file_info(md5_checksum, file_size, relative_bgzipped_path, relative_csi_path)
            feature_summary = feature_summary_service.compute_features_summary(
                full_bgzipped_path
            )
            #if it has no types or sources we skip the annotation as it means it is empty
            if not feature_summary or not feature_summary.types or not feature_summary.sources:
                raise Exception("Annotation has no types or sources, skipping...")

            seq_files.write_contigs_from_tabix(full_bgzipped_path)

            feature_stats = feature_stats_service.compute_features_statistics(full_bgzipped_path)
            parsed_annotation = annotation_to_process.to_genome_annotation(
                annotation_id=md5_checksum,
                taxon_lineage=valid_lineages.get(annotation_to_process.taxon_id, []),
                indexed_file_info=indexed_file_info,
                features_summary=feature_summary,
                features_statistics=feature_stats,
            )
            # Alias enrichment: existing assemblies after import; new assemblies via sync_new_assemblies_from_summary
            #TODO: do we need to set bioprojects to the annotations or just the assemblies?
            #handle_bioprojects(parsed_annotation)
            processed_annotations.append(parsed_annotation)
            if isinstance(existing_annotation_md5s, set):
                existing_annotation_md5s.add(md5_checksum)
        except annotation_service.DuplicateAnnotationContentError as e:
            # The freshly downloaded+sorted content already belongs to an existing
            # annotation (same content, different/new source URL). Reconcile the
            # existing record's source metadata instead of treating this as an error.
            # process_annotation_file publishes nothing at the final path for duplicate
            # content, so there is nothing to delete (and nothing that must be preserved).
            logger.info(
                f"- {annotation_to_process.access_url}: content already exists "
                f"(md5 {e.md5_checksum}); reconciling source metadata"
            )
            if any(a.annotation_id == e.md5_checksum for a in processed_annotations):
                logger.info(f"- {annotation_to_process.access_url}: same content as another annotation of this batch, skipping")
                continue
            try:
                annotation_service.handle_duplicate_annotation_content(annotation_to_process, e.md5_checksum)
            except Exception as dup_error:
                logger.warning(f"- Could not reconcile duplicate {annotation_to_process.access_url}: {dup_error}")
        except Exception as e:
            str_error = str(e)
            logger.warning(f"- Error processing annotation {annotation_to_process.access_url}: {str_error}")
            annotation_service.handle_annotation_error(annotation_to_process, str_error)
            _discard_failed_outputs(full_bgzipped_path, relative_bgzipped_path)
        finally:
            if tmp_subdir_path:
                # A cleanup failure must never discard the already-processed annotations.
                shutil.rmtree(tmp_subdir_path, ignore_errors=True)

    return processed_annotations
