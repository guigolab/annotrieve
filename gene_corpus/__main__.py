"""Allow ``python -m gene_corpus`` (dispatcher)."""
from __future__ import annotations

from gene_corpus.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
