"""
Harvest one GFF into a per-annotation SQLite shard.

Open-locus window: flush when W >= MEMORY_FLUSH_UNITS and seqid changes,
plus always at EOF. No mid-seqid flush.

Writes ``per_gff/{annotation_id}/genes.sqlite``
(gene + gene_xref + tier_a_counts + meta).
"""
from __future__ import annotations

import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from gene_corpus.catalog.models import AnnotationJob, ParseGate
from gene_corpus.gating import DNA_LANDMARKS
from gene_corpus.namespaces.tiers import TIER_A
from gene_corpus.sql.per_gff import (
    GeneRow,
    XrefRow,
    connect_per_gff,
    finalize_shard,
    init_schema,
    insert_genes,
    insert_xrefs,
    shard_dir,
    shard_sqlite_path,
    shard_tmp_path,
)
from gene_corpus.stream.attrs import (
    first_attr,
    parse_attributes,
)
from gene_corpus.stream.prose import finalize_prose
from gene_corpus.stream.reader import iter_gff_lines

# Open-window mid load budget (genes + transcript keys + xref pairs).
MEMORY_FLUSH_UNITS = 2_000_000

# Commit batched inserts every N flushed loci.
_COMMIT_EVERY = 500

# parse_flags bit 0: child Parent matched duplicate gene IDs but none contained it.
FLAG_ATTACH_MISS = 1

# Default gene-like roots when root_type_counts unknown.
_DEFAULT_GENE_ROOTS = frozenset(
    {
        "gene",
        "pseudogene",
        "ncRNA_gene",
        "rRNA_gene",
        "tRNA_gene",
        "miRNA_gene",
        "snRNA_gene",
        "snoRNA_gene",
        "lnc_RNA",
    }
)


def _profile_bundle(profile_id: str):
    """Lazy import to avoid profiles ↔ stream circular imports."""
    import gene_corpus.profiles.ensembl as ensembl
    import gene_corpus.profiles.genbank as genbank
    import gene_corpus.profiles.refseq as refseq
    from gene_corpus.profiles import PROFILES

    modules = {
        "ensembl": ensembl,
        "genbank": genbank,
        "refseq": refseq,
    }
    return PROFILES[profile_id], modules[profile_id]


def _strand_int(strand: str) -> int:
    if strand == "+":
        return 1
    if strand == "-":
        return -1
    return 0


def _via_level(*, is_gene: bool, ft_cf: str) -> int:
    if is_gene:
        return 0
    if ft_cf == "cds":
        return 2
    return 1


@dataclass
class _Locus:
    gene_key: str
    source_gene_id: str
    feature_type: str
    seqid: str
    start: int
    end: int
    strand: int
    primary_name: str | None = None
    biotype: str | None = None
    gene_description: str | None = None
    # (ns, acc) → (origin, via_level); prefer lower via_level on conflict.
    xrefs: dict[tuple[str, str], tuple[str, int]] = field(default_factory=dict)
    parse_flags: int = 0
    id_keys: set[tuple[str, str]] = field(default_factory=set)
    transcript_keys: set[tuple[str, str]] = field(default_factory=set)


def _is_gene_root(
    ftype: str, gene_roots_cf: frozenset[str], roots_unknown: bool
) -> bool:
    ft = ftype.casefold()
    if ft in DNA_LANDMARKS:
        return False
    if roots_unknown:
        return ft in _DEFAULT_GENE_ROOTS or ft.endswith("_gene") or ft == "gene"
    return ft in gene_roots_cf


def _pick_attach(
    candidates: list[_Locus], child_start: int, child_end: int
) -> list[_Locus]:
    """
    Containment → tightest span. If none contain: flag all candidates, return [].

    Always requires the child span to sit inside the parent locus (including
    the unique-Parent case).
    """
    if not candidates:
        return []

    contained = [
        L
        for L in candidates
        if L.start <= child_start and child_end <= L.end
    ]
    if not contained:
        for L in candidates:
            L.parse_flags |= FLAG_ATTACH_MISS
        return []
    if len(contained) == 1:
        return contained
    best = min(contained, key=lambda L: (L.end - L.start, L.start, L.gene_key))
    return [best]


def _shard_meta_from_job(job: AnnotationJob) -> dict[str, str]:
    """Dimension fields stored in the shard for merge-time annotation seed."""
    return {
        "annotation_id": job.annotation_id,
        "taxid": str(job.taxid),
        "assembly_accession": job.assembly_accession,
        "organism_name": job.organism_name or "",
        "source_database": job.database,
        "source_provider": job.provider or "",
        "profile_id": job.profile_id,
        "gff_path": job.resolved_path or "",
    }


def harvest_annotation(
    job: AnnotationJob,
    *,
    per_gff_root: Path,
    memory_flush_units: int = MEMORY_FLUSH_UNITS,
) -> int:
    """
    Stream job.resolved_path → per-GFF shard (with meta).

    Returns the number of Tier A ``tier_a_counts`` rows. Existing
    ``genes.sqlite`` is left in place until atomic finalize replace.
    """
    if job.gate is None:
        raise ValueError("job.gate is required")
    if not job.resolved_path:
        raise ValueError("job.resolved_path is required for harvest")
    profile, mod = _profile_bundle(job.profile_id)
    gate: ParseGate = job.gate

    gene_roots_cf = gate.gene_root_types  # already casefolded by build_parse_gate
    roots_unknown = gate.roots_unknown
    skip = gate.skip_types
    keep_gene = gate.keep_gene
    keep_transcript = gate.keep_transcript
    keep_cds = gate.keep_cds
    child_types = gate.child_feature_types
    child_types_unknown = gate.child_types_unknown
    single = mod.SINGLE_VALUED_KEYS

    open_loci: list[_Locus] = []
    by_id: dict[tuple[str, str], list[_Locus]] = defaultdict(list)
    transcript_to_gene: dict[tuple[str, str], list[_Locus]] = defaultdict(list)
    current_seqid: str | None = None
    last_start: int | None = None
    n_xref_pairs = 0
    peak_w = 0
    warned_backwards = False

    next_local_id = 0
    pending_genes: list[GeneRow] = []
    pending_xrefs: list[XrefRow] = []
    flushes_since_commit = 0

    shard_folder = shard_dir(per_gff_root, job.annotation_id)
    tmp_path = shard_tmp_path(per_gff_root, job.annotation_id)
    final_path = shard_sqlite_path(per_gff_root, job.annotation_id)
    shard_folder.mkdir(parents=True, exist_ok=True)
    if tmp_path.exists():
        tmp_path.unlink()
    # Do not unlink final_path here — os.replace in finalize_shard swaps
    # atomically so a failed harvest keeps the previous good shard.

    conn = None
    shard_ok = False
    try:
        conn = connect_per_gff(tmp_path)
        init_schema(conn)

        def window_w() -> int:
            return len(open_loci) + len(transcript_to_gene) + n_xref_pairs

        def _commit_pending() -> None:
            nonlocal flushes_since_commit
            if pending_genes or pending_xrefs:
                insert_genes(conn, pending_genes)
                insert_xrefs(conn, pending_xrefs)
                conn.commit()
                pending_genes.clear()
                pending_xrefs.clear()
            flushes_since_commit = 0

        def flush_locus(locus: _Locus, *, cleanup: bool = True) -> None:
            nonlocal n_xref_pairs, next_local_id, flushes_since_commit
            local_id = next_local_id
            next_local_id += 1
            prose, prose_kind = finalize_prose(
                job.profile_id,
                gene_description=locus.gene_description,
            )
            pending_genes.append(
                (
                    local_id,
                    locus.source_gene_id,
                    locus.feature_type,
                    locus.seqid,
                    locus.start,
                    locus.end,
                    locus.strand,
                    locus.biotype,
                    locus.primary_name,
                    prose,
                    prose_kind,
                    locus.parse_flags,
                )
            )
            for (ns, acc), (origin, via_level) in locus.xrefs.items():
                pending_xrefs.append(
                    (local_id, ns, acc, None, origin, via_level)
                )
            n_xref_pairs -= len(locus.xrefs)
            if n_xref_pairs < 0:
                n_xref_pairs = 0
            flushes_since_commit += 1
            if flushes_since_commit >= _COMMIT_EVERY:
                _commit_pending()

            if not cleanup:
                return
            for key in locus.id_keys:
                lst = by_id.get(key)
                if not lst:
                    continue
                try:
                    lst.remove(locus)
                except ValueError:
                    pass
                if not lst:
                    del by_id[key]
            for key in locus.transcript_keys:
                lst = transcript_to_gene.get(key)
                if not lst:
                    continue
                try:
                    lst.remove(locus)
                except ValueError:
                    pass
                if not lst:
                    del transcript_to_gene[key]

        def flush_all_open() -> None:
            nonlocal open_loci, peak_w
            peak_w = max(peak_w, window_w())
            for loc in open_loci:
                flush_locus(loc, cleanup=False)
            open_loci = []
            by_id.clear()
            transcript_to_gene.clear()
            _commit_pending()

        def add_xrefs(
            locus: _Locus,
            ftype: str,
            attrs: dict[str, list[str]],
            *,
            is_gene: bool,
        ) -> None:
            nonlocal n_xref_pairs
            via = _via_level(is_gene=is_gene, ft_cf=ftype.casefold())
            before = len(locus.xrefs)
            for ns, acc, origin in profile.parse_feature(ftype, attrs):
                if not ns or not acc:
                    continue
                key = (ns, acc)
                prev = locus.xrefs.get(key)
                if prev is None or via < prev[1]:
                    locus.xrefs[key] = (origin, via)
            n_xref_pairs += len(locus.xrefs) - before

        def resolve_parents(seqid: str, parents: list[str]) -> list[_Locus]:
            found: list[_Locus] = []
            for parent in parents:
                key = (seqid, parent)
                if key in by_id:
                    found.extend(by_id[key])
                elif key in transcript_to_gene:
                    found.extend(transcript_to_gene[key])
            # Dedupe by object identity — same GFF ID may appear at multiple loci.
            uniq: dict[int, _Locus] = {id(L): L for L in found}
            return list(uniq.values())

        path = Path(job.resolved_path)
        # Landmarks + profile skips (incl. exon) in reader.
        for line in iter_gff_lines(path, skip_types=skip):
            ft = line.feature_type
            ft_cf = ft.casefold()

            if current_seqid is not None and line.seqid != current_seqid:
                # Flush when window is large enough (never mid-seqid).
                if window_w() >= memory_flush_units:
                    flush_all_open()
                elif peak_w < window_w():
                    peak_w = window_w()
                last_start = None
            current_seqid = line.seqid

            if (
                last_start is not None
                and line.start < last_start
                and not warned_backwards
            ):
                print(
                    f"harvest warn {job.annotation_id}: start went backwards "
                    f"on {line.seqid} ({last_start} → {line.start})",
                    file=sys.stderr,
                )
                warned_backwards = True
            last_start = line.start

            # Choose keep-set by feature class before materializing attrs.
            is_gene = False
            # Peek Parent cheaply: full parse only after we know the keep set.
            # Gene roots have no Parent; children do. Detect via substring first.
            has_parent = "Parent=" in line.attr_column
            if not has_parent and _is_gene_root(ft, gene_roots_cf, roots_unknown):
                is_gene = True
                keep = keep_gene
            elif ft_cf == "cds":
                if not gate.want_cds:
                    continue
                keep = keep_cds
            else:
                if not child_types_unknown and ft_cf not in child_types:
                    continue
                keep = keep_transcript

            attrs = parse_attributes(
                line.attr_column,
                single_valued_keys=single,
                keep_keys=keep,
            )
            raw_id = first_attr(attrs, "ID")
            parents = list(attrs.get("Parent") or [])

            if is_gene:
                # Skip top-level features with no ID — no synthetic id, no gene row.
                if not raw_id:
                    continue
                # Internal key must be unique even when GFF IDs collide across loci.
                gene_key = (
                    f"{line.seqid}:{line.start}-{line.end}:{raw_id}"
                )
                locus = _Locus(
                    gene_key=gene_key,
                    source_gene_id=raw_id,
                    feature_type=ft,
                    seqid=line.seqid,
                    start=line.start,
                    end=line.end,
                    strand=_strand_int(line.strand),
                    primary_name=profile.primary_name(attrs),
                    biotype=profile.biotype(attrs),
                    gene_description=first_attr(attrs, "description"),
                )
                add_xrefs(locus, ft, attrs, is_gene=True)
                open_loci.append(locus)
                key = (line.seqid, raw_id)
                locus.id_keys.add(key)
                by_id[key].append(locus)
                continue

            if not parents:
                continue

            parent_loci = resolve_parents(line.seqid, parents)
            if not parent_loci:
                continue

            attached = _pick_attach(parent_loci, line.start, line.end)
            if not attached:
                continue

            for locus in attached:
                add_xrefs(locus, ft, attrs, is_gene=False)

            if raw_id and ft_cf != "cds":
                key = (line.seqid, raw_id)
                for locus in attached:
                    locus.transcript_keys.add(key)
                    transcript_to_gene[key].append(locus)

        flush_all_open()
        if peak_w >= memory_flush_units:
            print(
                f"harvest warn {job.annotation_id}: peak open-window W={peak_w} "
                f">= {memory_flush_units}",
                file=sys.stderr,
            )

        n_pairs = finalize_shard(
            conn,
            tmp_path=tmp_path,
            final_path=final_path,
            tier_a_namespaces=TIER_A,
            meta=_shard_meta_from_job(job),
        )
        # finalize_shard closed the connection and replaced tmp → final.
        conn = None
        shard_ok = True
        return n_pairs
    finally:
        if not shard_ok:
            if conn is not None:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001 — best-effort cleanup
                    pass
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    pass
