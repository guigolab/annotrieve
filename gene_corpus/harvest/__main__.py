"""Allow ``python -m gene_corpus.harvest``."""
from __future__ import annotations

from gene_corpus.harvest_cli import main

if __name__ == "__main__":
    raise SystemExit(main())
