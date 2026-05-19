from fastapi import HTTPException
from db.models import GenomeAssembly
from helpers import response as response_helper, query_visitors as query_visitors_helper
from helpers.parameters import format_boolean_param
from jobs.services.assembly import (
    assemblies_with_complete_report,
    assemblies_with_failed_report,
    assemblies_with_incomplete_report,
    assemblies_with_pending_report,
)
from fastapi.responses import FileResponse
import os

from helpers import assembly_sequence_files as seq_files

def get_assemblies(filter: str = None, 
                    taxids: str = None, 
                    assembly_accessions: str = None, 
                    offset: int = 0, 
                    limit: int = 20, 
                    sort_by: str = None, 
                    sort_order: str = None, 
                    field: str = None, 
                    submitters: str = None, 
                    response_type: str = 'metadata',
                    assembly_levels: str = None,
                    refseq_categories: str = None,
                    assembly_statuses: str = None,
                    assembly_types: str = None,
                    report_status: str = None,
                    report_incomplete: str | bool = None,
                    ):
    try:

        query = {}
        if taxids:
            query['taxon_lineage__in'] = taxids.split(',') if isinstance(taxids, str) else taxids
        if assembly_accessions:
            query['assembly_accession__in'] = assembly_accessions.split(',') if isinstance(assembly_accessions, str) else assembly_accessions
        if submitters:
            query['submitter__in'] = [submitters]
        if assembly_levels:
            query['assembly_level__in'] = assembly_levels.split(',') if isinstance(assembly_levels, str) else assembly_levels
        if refseq_categories:
            query['refseq_category__in'] = refseq_categories.split(',') if isinstance(refseq_categories, str) else refseq_categories
        if assembly_statuses:
            query['assembly_status__in'] = assembly_statuses.split(',') if isinstance(assembly_statuses, str) else assembly_statuses
        if assembly_types:
            query['assembly_type__in'] = assembly_types.split(',') if isinstance(assembly_types, str) else assembly_types
        assemblies = GenomeAssembly.objects(**query)
        if report_status is not None:
            status = report_status.strip().lower()
            if status == "failed":
                assemblies = assemblies.filter(assemblies_with_failed_report())
            elif status == "ok":
                assemblies = assemblies.filter(assemblies_with_complete_report())
            elif status == "pending":
                assemblies = assemblies.filter(assemblies_with_pending_report())
            else:
                raise HTTPException(
                    status_code=400,
                    detail="report_status must be one of: pending, ok, failed",
                )
        if report_incomplete is not None:
            if format_boolean_param(report_incomplete):
                assemblies = assemblies.filter(assemblies_with_incomplete_report())
            else:
                assemblies = assemblies.filter(assemblies_with_complete_report())
        
        q_filter =  query_visitors_helper.assembly_query(filter) if filter else None
        if q_filter:
            assemblies = assemblies.filter(q_filter)
        if response_type == 'frequencies':
            if not field:
                raise HTTPException(status_code=400, detail=f"Field is required for frequencies response")
            return query_visitors_helper.get_frequencies(assemblies, field, type='assembly')

        if sort_by:
            sort = '-' + sort_by if sort_order == 'desc' else sort_by
            assemblies = assemblies.order_by(sort)

        return response_helper.json_response_with_pagination(assemblies, assemblies.count(), offset, limit)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching assemblies: {e}")

def get_assembly(assembly_accession: str):
    assembly = GenomeAssembly.objects(assembly_accession=assembly_accession).exclude('id').first()
    if not assembly:
        raise HTTPException(status_code=404, detail=f"Assembly {assembly_accession} not found")
    return assembly


def get_chromosomes_file(accession: str):
    """Stream chromosomes.json from LOCAL_ANNOTATIONS_DIR for the assembly (or its pair)."""
    assembly = get_assembly(accession)
    path = seq_files.resolve_chromosomes_path(
        assembly.taxid, accession, assembly.paired_assembly_accession
    )
    if not path or not os.path.isfile(path):
        raise HTTPException(
            status_code=404,
            detail=f"Assembly {accession} lacks chromosomes.json on disk",
        )
    return FileResponse(
        path,
        media_type="application/json",
        filename=f"{accession}_chromosomes.json",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Accel-Buffering": "no",
        },
    )


def get_paired_assembly(assembly_accession: str):
    assembly = get_assembly(assembly_accession)
    paired_assembly_accession = assembly.paired_assembly_accession
    if not paired_assembly_accession:
        raise HTTPException(status_code=404, detail=f"Assembly {assembly_accession} is not a paired assembly")
    return get_assembly(paired_assembly_accession)

def get_chr_aliases_file(accession: str):
    assembly = get_assembly(accession)
    path = seq_files.resolve_chr_aliases_path(
        assembly.taxid, accession, assembly.paired_assembly_accession
    )
    if not path or not os.path.isfile(path):
        raise HTTPException(
            status_code=404,
            detail=f"Assembly {accession} lacks chr_aliases.tsv on disk",
        )
    return FileResponse(
        path,
        media_type="text/tab-separated-values",
        filename=f"{accession}_chr_aliases.tsv",
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Accel-Buffering": "no",
        },
    )
