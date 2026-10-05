"""Corpus profiles for ensembl / genbank / refseq (no TOGA2 in v1 dry-run)."""

from gene_corpus.profiles.ensembl import EnsemblProfile
from gene_corpus.profiles.genbank import GenBankProfile
from gene_corpus.profiles.refseq import RefSeqProfile

PROFILES: dict[str, EnsemblProfile | GenBankProfile | RefSeqProfile] = {
    "ensembl": EnsemblProfile(),
    "genbank": GenBankProfile(),
    "refseq": RefSeqProfile(),
}

__all__ = [
    "EnsemblProfile",
    "GenBankProfile",
    "PROFILES",
    "RefSeqProfile",
]
