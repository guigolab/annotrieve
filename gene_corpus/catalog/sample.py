"""Full corpus vs per-database sampling for gene_corpus jobs."""
from __future__ import annotations

import random
from collections import defaultdict

from gene_corpus.catalog.report import ReportRow

# Stable order for summaries / round-robin.
DATABASE_ORDER: tuple[str, ...] = ("Ensembl", "GenBank", "RefSeq")


def sample_rows_round_robin(
    rows: list[ReportRow],
    *,
    per_db: int,
    seed: int = 42,
) -> list[ReportRow]:
    """
    Per database: group by taxid, shuffle, round-robin until per_db.

    Same diversity idea as scripts/gene_name_audit_lib.sample_jobs_round_robin.
    """
    if per_db <= 0:
        return []

    rng = random.Random(seed)
    by_db: dict[str, list[ReportRow]] = defaultdict(list)
    for row in rows:
        by_db[row.database].append(row)

    selected: list[ReportRow] = []
    for db_label in DATABASE_ORDER:
        # Match report casing flexibly.
        pool: list[ReportRow] = []
        for key, items in by_db.items():
            if key.casefold() == db_label.casefold():
                pool.extend(items)
        if not pool:
            continue

        by_tax: dict[int, list[ReportRow]] = defaultdict(list)
        for row in pool:
            by_tax[row.taxid].append(row)
        tax_ids = list(by_tax.keys())
        rng.shuffle(tax_ids)
        for tid in tax_ids:
            rng.shuffle(by_tax[tid])

        picked = 0
        tax_i = 0
        while picked < per_db and tax_ids:
            tid = tax_ids[tax_i % len(tax_ids)]
            bucket = by_tax[tid]
            if bucket:
                selected.append(bucket.pop())
                picked += 1
            if not bucket:
                tax_ids = [t for t in tax_ids if by_tax[t]]
                if not tax_ids:
                    break
                tax_i = tax_i % len(tax_ids)
            else:
                tax_i = (tax_i + 1) % len(tax_ids)

    return selected
