"""
Root CLI dispatcher — use the split harvest / merge entry points.

    python -m gene_corpus.harvest --help
    python -m gene_corpus.merge --help
"""
from __future__ import annotations

import sys


def main(argv: list[str] | None = None) -> int:
    _ = argv
    print(
        "gene_corpus: use separate harvest and merge commands:\n"
        "  python -m gene_corpus.harvest --work-dir DIR "
        "--files-root FILES [--annotation-id ID ...]\n"
        "  python -m gene_corpus.merge --work-dir DIR\n",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
