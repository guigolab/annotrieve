from unittest.mock import patch

import pytest

from db.models import GenomeAssembly
from helpers import assembly_sequence_files as seq_files
from jobs.services import stats as stats_service
from .mongomock_helper import connect_mongomock

pytestmark = pytest.mark.unit

URL = "https://ftp.ncbi.nlm.nih.gov/a/b_genomic.fna.gz"


def _old_id(hours: int = 48):
    """A unique _id created `hours` ago: the prune only touches assemblies older than a day."""
    from datetime import datetime, timedelta, timezone
    from bson import ObjectId
    stamp = ObjectId.from_datetime(datetime.now(timezone.utc) - timedelta(hours=hours)).binary[:4]
    return ObjectId(stamp + ObjectId().binary[4:])


@pytest.fixture
def seeded(tmp_path, monkeypatch):
    connect_mongomock("prune_files")
    GenomeAssembly.drop_collection()
    monkeypatch.setattr(seq_files, "ANNOTATIONS_PATH", str(tmp_path))
    for i, acc in enumerate(("GCA_1.1", "GCA_2.1")):
        GenomeAssembly(id=_old_id(), assembly_accession=acc, assembly_name="n", taxid="9", organism_name="o",
                       download_url=f"{URL}{i}").save()
        d = tmp_path / "9" / acc
        d.mkdir(parents=True)
        for n in ("assembly_report.txt", "chromosomes.json", "chr_aliases.tsv"):
            (d / n).write_text("x")
    return tmp_path


def test_pruned_assemblies_lose_db_row_and_files(seeded):
    stats_service.update_assemblies_counts()
    assert GenomeAssembly.objects.count() == 0
    assert not (seeded / "9" / "GCA_1.1").exists() and not (seeded / "9" / "GCA_2.1").exists()


def test_file_errors_never_abort_the_stats_update(seeded):
    with patch.object(seq_files, "delete_assembly_files", side_effect=OSError("nfs down")):
        stats_service.update_assemblies_counts()  # must not raise
    assert GenomeAssembly.objects.count() == 0


def test_assembly_younger_than_a_day_is_not_pruned(seeded):
    """The import saves an assembly before its annotations: it must survive a stats run meanwhile."""
    GenomeAssembly(assembly_accession="GCA_3.1", assembly_name="n", taxid="9", organism_name="o",
                   download_url=f"{URL}new").save()
    d = seeded / "9" / "GCA_3.1"
    d.mkdir(parents=True)
    (d / "chromosomes.json").write_text("x")
    stats_service.update_assemblies_counts()
    assert [a.assembly_accession for a in GenomeAssembly.objects] == ["GCA_3.1"]
    assert (d / "chromosomes.json").is_file()
    assert not (seeded / "9" / "GCA_1.1").exists()  # the old ones are still pruned
