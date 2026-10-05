"""Harvest skip-existing shard without re-harvest."""
from __future__ import annotations

import tempfile
import time
from pathlib import Path

from gene_corpus.catalog.models import AnnotationJob, ParseGate
from gene_corpus.harvest_cli import _counts_from_shard, process_one
from gene_corpus.sql.per_gff import (
    connect_per_gff,
    init_schema,
    shard_dir,
    shard_sqlite_path,
    write_shard_meta,
)


def _minimal_job(annotation_id: str = "ann1") -> AnnotationJob:
    gate = ParseGate(
        effective_attr_keys=frozenset({"ID", "Parent", "Name"}),
        keep_gene=frozenset({"ID", "Parent", "Name"}),
        keep_transcript=frozenset({"ID", "Parent"}),
        keep_cds=frozenset({"ID", "Parent"}),
        gene_root_types=frozenset({"gene"}),
        feature_types=frozenset({"gene"}),
        child_feature_types=frozenset(),
        skip_types=frozenset({"exon"}),
        want_cds=False,
        file_keys_unknown=False,
        roots_unknown=False,
        child_types_unknown=False,
    )
    return AnnotationJob(
        annotation_id=annotation_id,
        database="GenBank",
        profile_id="genbank",
        taxid=1,
        assembly_accession="GCA_TEST",
        provider=None,
        attribute_keys=["ID", "Parent", "Name"],
        feature_types=["gene"],
        root_type_counts={"gene": 1},
        has_cds=False,
        bgzip_path="x",
        source_url="",
        gff_mode="local",
        resolved_path="/tmp/missing.gff",  # must not be opened on skip
        gate=gate,
    )


def _seed_shard(per_gff: Path, annotation_id: str) -> Path:
    folder = shard_dir(per_gff, annotation_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = shard_sqlite_path(per_gff, annotation_id)
    conn = connect_per_gff(path)
    init_schema(conn)
    conn.execute(
        """
        INSERT INTO tier_a_counts (namespace, accession, gene_count)
        VALUES ('go', 'GO:0008150', 3)
        """
    )
    write_shard_meta(
        conn,
        {
            "annotation_id": annotation_id,
            "taxid": "1",
            "assembly_accession": "GCA_TEST",
            "organism_name": "",
            "source_database": "GenBank",
            "source_provider": "",
            "profile_id": "genbank",
            "gff_path": "/tmp/missing.gff",
        },
    )
    conn.commit()
    conn.close()
    return path


def test_counts_from_shard() -> None:
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        per_gff = root / "per_gff"
        job = _minimal_job()
        _seed_shard(per_gff, job.annotation_id)

        n_pairs, ann_id = _counts_from_shard(job, str(per_gff))
        assert n_pairs == 1
        assert ann_id == "ann1"


def test_process_one_skips_existing_shard() -> None:
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        per_gff = root / "per_gff"
        job = _minimal_job()
        shard = _seed_shard(per_gff, job.annotation_id)
        mtime_before = shard.stat().st_mtime
        time.sleep(0.02)

        n_pairs, ann_id, skipped = process_one(job, str(per_gff))
        assert skipped is True
        assert n_pairs == 1
        assert ann_id == "ann1"
        assert shard.stat().st_mtime == mtime_before


def test_force_does_not_predelete_on_failed_harvest() -> None:
    """--force must not unlink the good shard before a failed harvest."""
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        per_gff = root / "per_gff"
        job = _minimal_job()
        shard = _seed_shard(per_gff, job.annotation_id)
        body_before = shard.read_bytes()

        try:
            process_one(job, str(per_gff), force=True)
            raise AssertionError("expected harvest to fail (missing GFF)")
        except Exception:
            pass

        assert shard.is_file()
        assert shard.read_bytes() == body_before
