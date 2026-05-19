from celery import shared_task

from .services import assembly as assembly_service


@shared_task(name="sync_new_assemblies_from_summary", ignore_result=False)
def sync_new_assemblies_from_summary(
    accessions: list[str],
    chunk_size: int = 500,
):
    """
    Sync FTP paths and sequences for newly inserted assemblies only.
    """
    if not accessions:
        return {"targets": 0}
    print(f"Starting assembly sync for {len(accessions)} new assemblies...")
    stats = assembly_service.sync_assemblies_ftp_and_sequences(
        accessions=accessions,
        chunk_size=chunk_size,
    )
    print(f"New assembly sync finished: {stats}")
    return stats
