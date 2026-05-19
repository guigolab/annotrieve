import gzip
import pysam
from typing import Iterable, Iterator, Optional


def stream_gff_file(file_path: str, index_format: str = "csi", seqid: Optional[str] = None, start: Optional[int] = None, end: Optional[int] = None, feature_type: Optional[str] = None, feature_source: Optional[str] = None, biotype: Optional[str] = None) -> Iterator[str]:
    has_filters = feature_type or feature_source or biotype
    if has_filters:
        with pysam.TabixFile(file_path, index=f"{file_path}.{index_format}") as file:
            for line in file.fetch(seqid, start, end):
                fields = line.split("\t", 8)
                if feature_type and fields[2] != feature_type:
                    continue
                if feature_source and fields[1] != feature_source:
                    continue
                if biotype:
                    attributes = {k: v for k, v in (item.split('=') for item in fields[8].split(';') if '=' in item)}
                    if biotype not in attributes.values():
                        continue
                yield line + '\n'
    else:
        with pysam.TabixFile(file_path, index=f"{file_path}.{index_format}") as file:
            for line in file.fetch(seqid, start, end):
                yield line + "\n"


def stream_contigs(file_path: str, index_format: str = "csi") -> Iterator[str]:
    with pysam.TabixFile(file_path, index=f"{file_path}.{index_format}") as file:
        for contig in file.contigs:
            yield contig + "\n"


def stream_contigs_names(file_path: str, index_format: str = "csi") -> Iterator[str]:
    with pysam.TabixFile(file_path, index=f"{file_path}.{index_format}") as file:
        for contig in file.contigs:
            yield contig


def stream_tabix_gff_file(file_path: str, index_format: str = "csi") -> Iterator[str]:
    with pysam.TabixFile(file_path, index=f"{file_path}.{index_format}") as file:
        for line in file.fetch():
            yield line


def stream_plain_gff_file(file_path: str) -> Iterator[str]:
    """
    Stream a GFF (optionally gzipped) without requiring a tabix index.
    Header lines starting with '#' are skipped to mirror stream_tabix_gff_file.
    """
    if file_path.endswith(".gz"):
        opener = gzip.open  # type: ignore[assignment]
        mode = "rt"
    else:
        opener = open  # type: ignore[assignment]
        mode = "r"

    with opener(file_path, mode, encoding="utf-8", errors="replace") as fh:  # type: ignore[arg-type]
        for line in fh:
            if not line:
                continue
            if line.startswith("#"):
                continue
            yield line.rstrip("\n")

