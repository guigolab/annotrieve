"""Harvest window + per-GFF shard + merge xref_hit tests."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from gene_corpus.catalog.models import AnnotationJob
from gene_corpus.gating import build_parse_gate
from gene_corpus.sql.merge import merge_shards_into_db
from gene_corpus.sql.per_gff import (
    connect_per_gff,
    init_schema as init_per_gff_schema,
    shard_dir,
    shard_sqlite_path,
    write_shard_meta,
)
from gene_corpus.sql.schema import connect_for_build, init_schema, seed_annotations
from gene_corpus.stream.harvest import FLAG_ATTACH_MISS, harvest_annotation


def _job(
    gff: Path,
    *,
    profile_id: str = "genbank",
    database: str = "GenBank",
    annotation_id: str = "test1",
    **gate_kw,
) -> AnnotationJob:
    default_attrs = {
        "genbank": [
            "ID",
            "Parent",
            "Name",
            "Ontology_term",
            "Dbxref",
            "description",
            "Note",
            "protein_id",
        ],
        "refseq": [
            "ID",
            "Parent",
            "Name",
            "description",
            "Dbxref",
            "transcript_id",
            "protein_id",
        ],
        "ensembl": ["ID", "Parent", "Name", "gene_id", "description", "biotype", "transcript_id"],
    }
    gate = build_parse_gate(
        profile_id,
        attribute_keys=gate_kw.get(
            "attribute_keys",
            default_attrs.get(profile_id, ["ID", "Parent", "Name"]),
        ),
        feature_types=gate_kw.get("feature_types", ["gene", "CDS", "mRNA", "exon"]),
        root_type_counts=gate_kw.get("root_type_counts", {"gene": 2}),
        has_cds=True,
    )
    return AnnotationJob(
        annotation_id=annotation_id,
        database=database,
        profile_id=profile_id,
        taxid=1,
        assembly_accession="GCA_TEST",
        provider=None,
        attribute_keys=list(gate.effective_attr_keys),
        feature_types=list(gate.feature_types),
        root_type_counts={"gene": 2},
        has_cds=True,
        bgzip_path="x",
        source_url="",
        gff_mode="local",
        resolved_path=str(gff),
        gate=gate,
    )


def _tier_a_map(shard: Path) -> dict[tuple[str, str], int]:
    """Load tier_a_counts from a finished shard (tests only)."""
    conn = sqlite3.connect(str(shard))
    try:
        return {
            (str(ns), str(acc)): int(gc)
            for ns, acc, gc in conn.execute(
                "SELECT namespace, accession, gene_count FROM tier_a_counts"
            )
        }
    finally:
        conn.close()


def _run_harvest(root: Path, gff_text: str, **job_kw):
    gff_path = root / "t.gff"
    gff_path.write_text(gff_text)
    per_gff = root / "per_gff"
    job = _job(gff_path, **job_kw)
    harvest_annotation(job, per_gff_root=per_gff)
    shard = shard_sqlite_path(per_gff, job.annotation_id)
    return _tier_a_map(shard), shard


def test_gene_direct_cds_go() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=g1;Ontology_term=GO:0008150
chr2\t.\tgene\t1\t50\t.\t+\t.\tID=g2;Name=bar
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("go", "GO:0008150")] == 1
        assert counts[("symbol", "foo")] == 1
        assert shard.exists()
        conn = sqlite3.connect(str(shard))
        xrefs = {
            (r[0], r[1])
            for r in conn.execute("SELECT namespace, accession FROM gene_xref")
        }
        assert ("go", "GO:0008150") in xrefs
        assert ("symbol", "foo") in xrefs
        tier_a = {
            (r[0], r[1])
            for r in conn.execute(
                "SELECT namespace, accession FROM tier_a_counts"
            )
        }
        assert ("go", "GO:0008150") in tier_a
        assert ("symbol", "foo") in tier_a
        from gene_corpus.sql.per_gff import meta_complete, read_shard_meta

        meta = read_shard_meta(conn)
        assert meta_complete(meta)
        assert meta["annotation_id"] == "test1"
        conn.close()


def test_tier_b_protein_in_xref_not_tier_a_counts() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=g1;Ontology_term=GO:0008150;protein_id=ABC123.1
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert ("go", "GO:0008150") in counts
        assert ("ncbi_gp", "ABC123.1") not in counts
        conn = sqlite3.connect(str(shard))
        xrefs = {
            (r[0], r[1])
            for r in conn.execute("SELECT namespace, accession FROM gene_xref")
        }
        assert ("ncbi_gp", "ABC123.1") in xrefs
        assert ("go", "GO:0008150") in xrefs
        tier_a = {
            r[0]
            for r in conn.execute("SELECT namespace FROM tier_a_counts")
        }
        assert "go" in tier_a
        assert "ncbi_gp" not in tier_a
        conn.close()


def test_flush_on_seqid_when_over_cap() -> None:
    lines = ["##gff-version 3"]
    lines.append("chr1\t.\tgene\t1\t10\t.\t+\t.\tID=g1;Name=a")
    lines.append("chr2\t.\tgene\t1\t10\t.\t+\t.\tID=g2;Name=b")
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        gff_path = root / "t.gff"
        gff_path.write_text("\n".join(lines) + "\n")
        per_gff = root / "per_gff"
        harvest_annotation(
            _job(gff_path),
            per_gff_root=per_gff,
            memory_flush_units=1,
        )
        shard = shard_sqlite_path(per_gff, "test1")
        counts = _tier_a_map(shard)
        assert counts[("symbol", "a")] == 1
        assert counts[("symbol", "b")] == 1


def test_exon_skipped_no_xref_no_span_change() -> None:
    """Exons are reader-skipped: no Dbxref, gene end stays gene-row only."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t10\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tmRNA\t1\t200\t.\t+\t.\tID=t1;Parent=g1
chr1\t.\texon\t1\t200\t.\t+\t.\tParent=t1;Dbxref=GeneID:999;Name=should_not_emit
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(
            Path(d), gff, profile_id="refseq", database="RefSeq"
        )
        assert counts[("symbol", "foo")] == 1
        assert ("geneid", "999") not in counts
        assert ("symbol", "should_not_emit") not in counts
        conn = sqlite3.connect(str(shard))
        end = conn.execute(
            "SELECT end FROM gene WHERE source_gene_id='g1'"
        ).fetchone()[0]
        assert end == 10
        conn.close()


def test_child_does_not_extend_gene_end() -> None:
    """Contained children attach; gene coordinates stay gene-row only."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tmRNA\t1\t100\t.\t+\t.\tID=t1;Parent=g1
chr1\t.\tCDS\t10\t90\t.\t+\t0\tID=c1;Parent=t1;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("go", "GO:0008150")] == 1
        conn = sqlite3.connect(str(shard))
        start, end = conn.execute(
            "SELECT start, end FROM gene WHERE source_gene_id='g1'"
        ).fetchone()
        assert start == 1
        assert end == 100
        conn.close()


def test_source_gene_id_is_raw_gff_id() -> None:
    """source_gene_id keeps the GFF ID string; exact Parent still attaches."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=gene-LOC1;Name=foo
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=gene-LOC1;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("go", "GO:0008150")] == 1
        conn = sqlite3.connect(str(shard))
        sid = conn.execute(
            "SELECT source_gene_id FROM gene WHERE primary_name='foo'"
        ).fetchone()[0]
        assert sid == "gene-LOC1"
        conn.close()


def test_parent_suffix_does_not_attach() -> None:
    """Bare Parent suffix after gene- prefix must not attach."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=gene-LOC1;Name=foo
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=LOC1;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("symbol", "foo")] == 1
        assert ("go", "GO:0008150") not in counts
        conn = sqlite3.connect(str(shard))
        n = conn.execute("SELECT COUNT(*) FROM gene").fetchone()[0]
        assert n == 1
        sid = conn.execute("SELECT source_gene_id FROM gene").fetchone()[0]
        assert sid == "gene-LOC1"
        conn.close()


def test_gene_without_id_skipped() -> None:
    """Top-level gene with no ID is not stored; children cannot attach."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tName=orphan
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=orphan;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert ("symbol", "orphan") not in counts
        assert ("go", "GO:0008150") not in counts
        conn = sqlite3.connect(str(shard))
        assert conn.execute("SELECT COUNT(*) FROM gene").fetchone()[0] == 0
        conn.close()


def test_unresolved_parent_skipped() -> None:
    """Child whose Parent is not an open ID contributes no xrefs."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=missing;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("symbol", "foo")] == 1
        assert ("go", "GO:0008150") not in counts
        conn = sqlite3.connect(str(shard))
        assert conn.execute("SELECT COUNT(*) FROM gene").fetchone()[0] == 1
        conn.close()


def test_duplicate_id_attach_tightest() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t1000\t.\t+\t.\tID=dup;Name=wide
chr1\t.\tgene\t100\t200\t.\t+\t.\tID=dup;Name=tight
chr1\t.\tCDS\t110\t150\t.\t+\t0\tID=c1;Parent=dup;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert counts[("go", "GO:0008150")] == 1
        conn = sqlite3.connect(str(shard))
        rows = conn.execute(
            """
            SELECT g.primary_name, g.start, g.end
            FROM gene g
            JOIN gene_xref x ON x.local_id = g.local_id
            WHERE x.namespace='go' AND x.accession='GO:0008150'
            """
        ).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "tight"
        assert rows[0][1] == 100
        conn.close()


def test_duplicate_id_attach_miss_flags() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t50\t.\t+\t.\tID=dup;Name=a
chr1\t.\tgene\t100\t150\t.\t+\t.\tID=dup;Name=b
chr1\t.\tCDS\t60\t90\t.\t+\t0\tID=c1;Parent=dup;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert ("go", "GO:0008150") not in counts
        conn = sqlite3.connect(str(shard))
        flags = [
            r[0]
            for r in conn.execute("SELECT parse_flags FROM gene ORDER BY start")
        ]
        assert flags == [FLAG_ATTACH_MISS, FLAG_ATTACH_MISS]
        conn.close()


def test_unique_parent_outside_span_no_attach() -> None:
    """Single Parent candidate still requires containment."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t50\t.\t+\t.\tID=g1;Name=foo
chr1\t.\tCDS\t100\t200\t.\t+\t0\tID=c1;Parent=g1;Ontology_term=GO:0008150
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        assert ("go", "GO:0008150") not in counts
        assert counts.get(("symbol", "foo")) == 1
        conn = sqlite3.connect(str(shard))
        flags = conn.execute(
            "SELECT parse_flags FROM gene WHERE source_gene_id='g1'"
        ).fetchone()[0]
        assert flags == FLAG_ATTACH_MISS
        conn.close()


def test_refseq_description_prose() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo;description=selenoprotein S
chr1\t.\tmRNA\t1\t100\t.\t+\t.\tID=t1;Parent=g1;product=ignored isoform X1
"""
    with tempfile.TemporaryDirectory() as d:
        _counts, shard = _run_harvest(
            Path(d),
            gff,
            profile_id="refseq",
            database="RefSeq",
            annotation_id="rs1",
        )
        conn = sqlite3.connect(str(shard))
        prose, kind = conn.execute(
            "SELECT prose, prose_kind FROM gene"
        ).fetchone()
        assert prose == "selenoprotein S"
        assert kind == "description"
        conn.close()


def test_refseq_bare_uncharacterized_prose_null() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo;description=uncharacterized LOC143119705
"""
    with tempfile.TemporaryDirectory() as d:
        _counts, shard = _run_harvest(
            Path(d),
            gff,
            profile_id="refseq",
            database="RefSeq",
            annotation_id="rs2",
        )
        conn = sqlite3.connect(str(shard))
        prose, kind = conn.execute(
            "SELECT prose, prose_kind FROM gene"
        ).fetchone()
        assert prose is None
        assert kind is None
        conn.close()


def test_genbank_note_and_product_not_prose() -> None:
    """Product/Note are ignored for prose; Note still yields EggNOG xref."""
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo;Note=expressed protein
chr1\t.\tCDS\t1\t100\t.\t+\t0\tID=c1;Parent=g1;product=hypothetical protein;Note=EggNog:ENOG410X
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(Path(d), gff)
        conn = sqlite3.connect(str(shard))
        prose, kind = conn.execute(
            "SELECT prose, prose_kind FROM gene"
        ).fetchone()
        assert prose is None
        assert kind is None
        xrefs = {
            (r[0], r[1])
            for r in conn.execute("SELECT namespace, accession FROM gene_xref")
        }
        assert ("eggnog", "ENOG410X") in xrefs
        conn.close()
        assert ("eggnog", "ENOG410X") in counts


def test_genbank_description_prose_when_present() -> None:
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=g1;Name=foo;description=rare genbank desc
"""
    with tempfile.TemporaryDirectory() as d:
        _counts, shard = _run_harvest(Path(d), gff)
        conn = sqlite3.connect(str(shard))
        prose, kind = conn.execute(
            "SELECT prose, prose_kind FROM gene"
        ).fetchone()
        assert prose == "rare genbank desc"
        assert kind == "description"
        conn.close()


def test_ensembl_tier_b_description_in_xref_not_tier_a() -> None:
    # Real Ensembl encodes ';' inside description as %3B so col9 doesn't split.
    gff = """##gff-version 3
chr1\t.\tgene\t1\t100\t.\t+\t.\tID=gene:ENSG1;gene_id=ENSG1;Name=foo;description=selenoprotein S [Source:INSDC protein ID%3BAcc:CAA12345.1] [Source:RefSeq mRNA%3BAcc:NM_000001.1] [Source:HGNC Symbol%3BAcc:HGNC:11998]
"""
    with tempfile.TemporaryDirectory() as d:
        counts, shard = _run_harvest(
            Path(d),
            gff,
            profile_id="ensembl",
            database="Ensembl",
            annotation_id="ens1",
        )
        assert ("hgnc", "11998") in counts
        assert ("ensembl", "ENSG1") in counts
        assert ("insdc_protein", "CAA12345.1") not in counts
        assert ("refseq_mrna", "NM_000001.1") not in counts
        conn = sqlite3.connect(str(shard))
        xrefs = {
            (r[0], r[1])
            for r in conn.execute("SELECT namespace, accession FROM gene_xref")
        }
        assert ("insdc_protein", "CAA12345.1") in xrefs
        assert ("refseq_mrna", "NM_000001.1") in xrefs
        assert ("hgnc", "11998") in xrefs
        tier_a = {
            r[0]
            for r in conn.execute("SELECT DISTINCT namespace FROM tier_a_counts")
        }
        assert "hgnc" in tier_a
        assert "ensembl" in tier_a
        assert "insdc_protein" not in tier_a
        assert "refseq_mrna" not in tier_a
        conn.close()


def _ann_row(key: int, annotation_id: str) -> dict:
    return {
        "annotation_key": key,
        "annotation_id": annotation_id,
        "taxid": 1,
        "assembly_accession": "GCA",
        "organism_name": None,
        "source_database": "GenBank",
        "source_provider": None,
        "profile_id": "genbank",
        "gff_path": None,
    }


def test_build_wipe_deletes_prior_sqlite() -> None:
    """--build hygiene: unlink prior DB then init_schema yields empty tables."""
    with tempfile.TemporaryDirectory() as d:
        work = Path(d)
        per_gff = work / "per_gff"
        per_gff.mkdir()
        (per_gff / "old").mkdir()
        db_path = work / "gene_corpus.sqlite"
        conn = connect_for_build(db_path)
        init_schema(conn)
        seed_annotations(conn, [_ann_row(1, "old")])
        conn.execute(
            "INSERT INTO xref_hit "
            "(namespace, accession, annotation_key, gene_count) "
            "VALUES ('go', 'GO:1', 1, 1)"
        )
        conn.execute(
            "INSERT INTO xref_meta (namespace, accession, n_annotations) "
            "VALUES ('go', 'GO:1', 1)"
        )
        conn.commit()
        conn.close()

        # Same wipe sequence as merge CLI (global DB only).
        for path in (
            db_path,
            Path(str(db_path) + "-wal"),
            Path(str(db_path) + "-shm"),
        ):
            if path.exists():
                path.unlink()

        conn = connect_for_build(db_path)
        init_schema(conn)
        n_ann = conn.execute("SELECT COUNT(*) FROM annotation").fetchone()[0]
        n_hit = conn.execute("SELECT COUNT(*) FROM xref_hit").fetchone()[0]
        n_meta = conn.execute("SELECT COUNT(*) FROM xref_meta").fetchone()[0]
        assert n_ann == 0
        assert n_hit == 0
        assert n_meta == 0
        conn.close()


def _seed_tier_a_shard(
    per_gff: Path,
    annotation_id: str,
    rows: list[tuple[str, str, int]],
    *,
    with_meta: bool = False,
) -> Path:
    folder = shard_dir(per_gff, annotation_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = shard_sqlite_path(per_gff, annotation_id)
    conn = connect_per_gff(path)
    init_per_gff_schema(conn)
    conn.executemany(
        """
        INSERT INTO tier_a_counts (namespace, accession, gene_count)
        VALUES (?, ?, ?)
        """,
        rows,
    )
    if with_meta:
        write_shard_meta(
            conn,
            {
                "annotation_id": annotation_id,
                "taxid": "1",
                "assembly_accession": "GCA",
                "organism_name": "",
                "source_database": "GenBank",
                "source_provider": "",
                "profile_id": "genbank",
                "gff_path": "",
            },
        )
    conn.commit()
    conn.close()
    return path


def test_merge_shards_into_db() -> None:
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        per_gff = root / "per_gff"
        _seed_tier_a_shard(
            per_gff, "a", [("go", "GO:0008150", 3), ("symbol", "tp53", 1)]
        )
        _seed_tier_a_shard(per_gff, "b", [("go", "GO:0008150", 1)])
        db = root / "db.sqlite"
        conn = connect_for_build(db)
        init_schema(conn)
        seed_annotations(conn, [_ann_row(1, "a"), _ann_row(2, "b")])
        n_hit, n_meta = merge_shards_into_db(conn, per_gff)
        assert n_hit == 3
        assert n_meta == 2
        hits = conn.execute(
            "SELECT namespace, accession, annotation_key, gene_count "
            "FROM xref_hit ORDER BY namespace, accession, annotation_key"
        ).fetchall()
        assert hits == [
            ("go", "GO:0008150", 1, 3),
            ("go", "GO:0008150", 2, 1),
            ("symbol", "tp53", 1, 1),
        ]
        meta = conn.execute(
            "SELECT namespace, accession, n_annotations FROM xref_meta "
            "ORDER BY namespace, accession"
        ).fetchall()
        assert meta == [
            ("go", "GO:0008150", 2),
            ("symbol", "tp53", 1),
        ]
        conn.close()


def test_merge_cli_discovers_meta_shards() -> None:
    """Merge CLI seeds annotation from shard meta only (no jobs list)."""
    from gene_corpus.merge_cli import main as merge_main

    with tempfile.TemporaryDirectory() as d:
        work = Path(d)
        per_gff = work / "per_gff"
        _seed_tier_a_shard(
            per_gff,
            "b",
            [("go", "GO:0008150", 1)],
            with_meta=True,
        )
        _seed_tier_a_shard(
            per_gff,
            "a",
            [("go", "GO:0008150", 3), ("symbol", "tp53", 1)],
            with_meta=True,
        )
        assert merge_main(["--work-dir", str(work)]) == 0
        conn = connect_for_build(work / "gene_corpus.sqlite")
        keys = conn.execute(
            "SELECT annotation_key, annotation_id FROM annotation "
            "ORDER BY annotation_key"
        ).fetchall()
        # Keys assigned by sorted annotation_id: a=1, b=2
        assert keys == [(1, "a"), (2, "b")]
        n_hit = conn.execute("SELECT COUNT(*) FROM xref_hit").fetchone()[0]
        assert n_hit == 3
        conn.close()
