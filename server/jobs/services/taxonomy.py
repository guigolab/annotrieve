from db.models import TaxonNode, Organism, GenomeAssembly, GenomeAnnotation
from collections import defaultdict
from clients import ebi_client
from lxml import etree
from .classes import AnnotationToProcess, OrganismToProcess
import os
from .utils import create_batches
import gzip
from itertools import chain
from pymongo.operations import UpdateOne



def get_existing_lineages_dict(annotations: list[AnnotationToProcess])->dict[str, list[str]]:
    """
    Get the existing lineages for the taxids in the annotations. return a dict of taxid:lineage (from species to root)
    """
    all_taxids = set([annotation.taxon_id for annotation in annotations])
    existing_organisms = Organism.objects(taxid__in=list(all_taxids)).scalar('taxid','taxon_lineage')
    lineages = {taxid:lineage for taxid, lineage in existing_organisms}
    return lineages

def handle_taxonomy(annotations: list[AnnotationToProcess], tmp_dir: str, batch_size: int=9000) -> dict:
    """
    Fetch the taxonomy from the a list of AnnotationToProcess and store the lineages in a dictionary taxid:lineage, return the lineages dict
    """    
    lineages = get_existing_lineages_dict(annotations)
    input_taxids = {annotation.taxon_id for annotation in annotations}
    new_taxids = input_taxids - set(lineages.keys())
    if not new_taxids:
        return lineages

    print(f"Found {len(new_taxids)} new organisms to fetch")
    organisms_to_process = fetch_new_organisms(list(new_taxids), tmp_dir, batch_size)
    # save all the related taxons and return the list of taxids of saved taxons
    saved_taxids = save_organisms(organisms_to_process, batch_size)
    if not saved_taxids:
        return lineages

    print(f"Saved {len(saved_taxids)} new organisms")
    successfully_saved_organisms = [organism for organism in organisms_to_process if organism.taxon_id in saved_taxids]
    
    print("Saving taxonomies")
    save_taxons(successfully_saved_organisms)

    print("Updating taxon hierarchy")
    organisms_to_update = Organism.objects(taxid__in=saved_taxids)
    for organism in organisms_to_update:
        ordered_taxons = get_ordered_taxons(organism.taxon_lineage)
        update_taxon_hierarchy(ordered_taxons)
        
    print("Taxon hierarchy updated")
    lineages = get_existing_lineages_dict(annotations)
    return lineages #return all the valid lineages


def fetch_new_organisms(taxids: list[str], tmp_dir: str, batch_size: int=9000)->list[OrganismToProcess]:
    """
    Fetch new organisms from ENA browser in bulk (up to 10k taxids at a time) and parse them into OrganismToProcess objects
    """
    batches = create_batches(taxids, batch_size)
    organisms_to_process = []
    for idx, batch in enumerate(batches):
        # Use index in filename to avoid collisions when different batches have same length
        path_to_gzipped_xml_file = os.path.join(tmp_dir, f'taxons_{idx}_{len(batch)}.xml.gz')
        fetch_success = ebi_client.get_xml_from_ena_browser(batch, path_to_gzipped_xml_file)
        if not fetch_success or not os.path.exists(path_to_gzipped_xml_file) or os.path.getsize(path_to_gzipped_xml_file) == 0:
            continue

        organisms_to_process.extend(
            parse_taxons_and_organisms_from_ena_browser(path_to_gzipped_xml_file)
        )
        # Best-effort cleanup to save disk space
        try:
            os.remove(path_to_gzipped_xml_file)
        except Exception:
            pass
    return organisms_to_process

def save_organisms(organisms_to_process: list[OrganismToProcess], batch_size: int=5000)->list[str]:
    """
    Save new organisms and return the list of taxids of saved organisms (those with a lineage successfully saved)
    """
    organisms_to_save = [organism.to_organism() for organism in organisms_to_process]
    batches = create_batches(organisms_to_save, batch_size)
    saved_taxids = []
    for batch in batches:
        taxids_in_batch = [organism.taxid for organism in batch]
        try:
            Organism.objects.insert(batch)
            saved_taxids.extend(taxids_in_batch)
        except Exception as e:
            print(f"Error saving organisms: {e}")
            Organism.objects(taxid__in=taxids_in_batch).delete()
            continue
    
    return saved_taxids

def save_taxons(organisms_to_process: list[OrganismToProcess], batch_size: int=5000)->bool | list[str]:
    """
    Save new taxons and return the list of taxids of saved taxons
    """
    all_taxids = set(chain(*[organism.taxon_lineage for organism in organisms_to_process]))
    existing_taxids = set(TaxonNode.objects(taxid__in=list(all_taxids)).scalar('taxid'))
    new_taxids = all_taxids - existing_taxids

    # Deduplicate by taxid while keeping the first occurrence
    unique_taxons_by_taxid = {}
    for organism in organisms_to_process:
        for taxon in organism.parsed_taxon_lineage:
            # Skip taxons with invalid taxids (None, empty, or "None")
            if not taxon.taxid or taxon.taxid == "None":
                continue
            if taxon.taxid in new_taxids and taxon.taxid not in unique_taxons_by_taxid:
                unique_taxons_by_taxid[taxon.taxid] = taxon

    taxons_to_save = list(unique_taxons_by_taxid.values())
    batches = create_batches(taxons_to_save, batch_size)
    saved_taxids = []
    for batch in batches:
        taxids_in_batch = [taxon.taxid for taxon in batch]
        try:
            TaxonNode.objects.insert(batch)
            saved_taxids.extend(taxids_in_batch)
        except Exception as e:
            print(f"Error saving taxons: {e}")
            TaxonNode.objects(taxid__in=taxids_in_batch).delete()
            Organism.objects(taxon_lineage__in=taxids_in_batch).delete()
            continue
        
    print(f"Total taxons saved: {len(saved_taxids)}")
    return saved_taxids

def get_ordered_taxons(taxids: list[str])->list[TaxonNode]:
    """
    Reload taxons from database and return them ordered by lineage from species to root
    """
    reloaded_taxons = TaxonNode.objects(taxid__in=taxids)
    taxon_map = {t.taxid: t for t in reloaded_taxons}
    # Filter out any taxids that weren't found in the database
    return [taxon_map[t] for t in taxids if t in taxon_map]


def update_taxon_hierarchy(ordered_taxons: list[TaxonNode]):
    """
    Update the taxon hierarchy in a best-effort manner, add the children to the father taxon
    and set parent_id on each child.
    """
    for index in range(len(ordered_taxons) - 1):
        child_taxon = ordered_taxons[index]
        father_taxon = ordered_taxons[index + 1]
        father_taxon.modify(add_to_set__children=child_taxon.taxid)
        child_taxon.modify(set__parent_id=father_taxon.taxid)


def rebuild_taxon_hierarchy_from_lineages():
    """
    Rebuild the taxon hierarchy from all existing taxon_lineage data in assemblies, annotations, and organisms.
    This ensures that parent-child relationships are correctly set even if they weren't established during initial import.
    
    Memory-efficient implementation: streams lineages and processes taxon nodes in batches to avoid loading all 20k into memory.
    """
    
    print("Rebuilding taxon hierarchy from all lineages...")
    
    # Build parent-child relationships incrementally by streaming lineages
    # parent_taxid -> set of child_taxids; child_taxid -> parent_taxid
    parent_to_children = defaultdict(set)
    child_to_parent: dict[str, str] = {}
    
    # Process lineages from assemblies
    for doc in GenomeAssembly.objects.aggregate([
        {"$project": {"taxon_lineage": 1}},
        {"$match": {"taxon_lineage": {"$ne": [], "$exists": True}}},
        {"$group": {"_id": "$taxon_lineage"}}
    ]):
        lineage = doc["_id"]
        # lineage is ordered from species (index 0) to root (last index)
        for i in range(len(lineage) - 1):
            child_taxid = lineage[i]
            parent_taxid = lineage[i + 1]
            parent_to_children[parent_taxid].add(child_taxid)
            child_to_parent[child_taxid] = parent_taxid

    # Process lineages from annotations
    for doc in GenomeAnnotation.objects.aggregate([
        {"$project": {"taxon_lineage": 1}},
        {"$match": {"taxon_lineage": {"$ne": [], "$exists": True}}},
        {"$group": {"_id": "$taxon_lineage"}}
    ]):
        lineage = doc["_id"]
        for i in range(len(lineage) - 1):
            child_taxid = lineage[i]
            parent_taxid = lineage[i + 1]
            parent_to_children[parent_taxid].add(child_taxid)
            child_to_parent[child_taxid] = parent_taxid

    # Process lineages from organisms
    for doc in Organism.objects.aggregate([
        {"$project": {"taxon_lineage": 1}},
        {"$match": {"taxon_lineage": {"$ne": [], "$exists": True}}},
        {"$group": {"_id": "$taxon_lineage"}}
    ]):
        lineage = doc["_id"]
        for i in range(len(lineage) - 1):
            child_taxid = lineage[i]
            parent_taxid = lineage[i + 1]
            parent_to_children[parent_taxid].add(child_taxid)
            child_to_parent[child_taxid] = parent_taxid

    # Convert sets to sorted lists for consistency
    parent_to_children = {k: sorted(list(v)) for k, v in parent_to_children.items()}
    
    # Use raw MongoDB collection for efficient bulk updates
    taxon_collection = TaxonNode._get_collection()
    updated_count = 0
    batch_size = 1000
    
    # Process taxons that should have children (those in parent_to_children) in batches
    parent_taxids_list = list(parent_to_children.keys())
    
    for batch_taxids in create_batches(parent_taxids_list, batch_size):
        # Build bulk operations for this batch
        bulk_ops = []
        for taxid in batch_taxids:
            expected_children = parent_to_children[taxid]
            bulk_ops.append(
                UpdateOne(
                    {'taxid': taxid},
                    {'$set': {'children': expected_children}}
                )
            )
        
        if bulk_ops:
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count
    
    # Clear children for taxons that shouldn't have any (not in parent_to_children but currently have children)
    # Process in batches as we find them to avoid loading all into memory
    all_parent_taxids_set = set(parent_to_children.keys())
    
    # Find taxons with children that aren't in our parent list, process in batches
    batch_taxids_to_clear = []
    for doc in taxon_collection.find(
        {'taxid': {'$nin': list(all_parent_taxids_set)}, 'children': {'$ne': []}},
        {'taxid': 1}
    ):
        batch_taxids_to_clear.append(doc['taxid'])
        
        # Process batch when it reaches batch_size
        if len(batch_taxids_to_clear) >= batch_size:
            bulk_ops = [
                UpdateOne(
                    {'taxid': taxid},
                    {'$set': {'children': []}}
                )
                for taxid in batch_taxids_to_clear
            ]
            
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count
            batch_taxids_to_clear = []
    
    # Process remaining taxids
    if batch_taxids_to_clear:
        bulk_ops = [
            UpdateOne(
                {'taxid': taxid},
                {'$set': {'children': []}}
            )
            for taxid in batch_taxids_to_clear
        ]
        
        result = taxon_collection.bulk_write(bulk_ops, ordered=False)
        updated_count += result.modified_count
    
    # Set parent_id on all taxons that appear as children in lineages
    child_taxids_list = list(child_to_parent.keys())
    for batch_taxids in create_batches(child_taxids_list, batch_size):
        bulk_ops = [
            UpdateOne(
                {'taxid': taxid},
                {'$set': {'parent_id': child_to_parent[taxid]}}
            )
            for taxid in batch_taxids
        ]
        if bulk_ops:
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count

    # Clear parent_id for taxons that are not children of any lineage-derived parent
    all_child_taxids_set = set(child_to_parent.keys())
    batch_taxids_to_clear_parent = []
    for doc in taxon_collection.find(
        {'taxid': {'$nin': list(all_child_taxids_set)}, 'parent_id': {'$exists': True, '$ne': None}},
        {'taxid': 1}
    ):
        batch_taxids_to_clear_parent.append(doc['taxid'])
        if len(batch_taxids_to_clear_parent) >= batch_size:
            bulk_ops = [
                UpdateOne({'taxid': taxid}, {'$unset': {'parent_id': ''}})
                for taxid in batch_taxids_to_clear_parent
            ]
            result = taxon_collection.bulk_write(bulk_ops, ordered=False)
            updated_count += result.modified_count
            batch_taxids_to_clear_parent = []

    if batch_taxids_to_clear_parent:
        bulk_ops = [
            UpdateOne({'taxid': taxid}, {'$unset': {'parent_id': ''}})
            for taxid in batch_taxids_to_clear_parent
        ]
        result = taxon_collection.bulk_write(bulk_ops, ordered=False)
        updated_count += result.modified_count

    print(f"Rebuilt taxon hierarchy: updated {updated_count} taxon nodes")


def parse_taxons_and_organisms_from_ena_browser(xml_path: str) -> list[OrganismToProcess]:
    """
    Memory-efficient streaming parser for ENA taxonomy XML files (gzipped).
    Assumes valid ENA structure:
      <TAXON_SET><taxon>...</taxon> ... </TAXON_SET>
    Only top-level <taxon> nodes represent organisms.
    """
    organisms = []

    with gzip.open(xml_path, "rb") as f:
        # Stream everything; handle tag=taxon manually
        context = etree.iterparse(f, events=("end",))

        for _, elem in context:
            if elem.tag != "taxon":
                continue

            parent = elem.getparent()
            if parent is None or parent.tag != "TAXON_SET":
                # lineage/child taxons—do NOT clear them now
                continue

            # --------- Top-level organism taxon ---------
            taxid = elem.get("taxId")
            if not taxid:
                elem.clear()
                continue

            organism = OrganismToProcess(
                taxid=taxid,
                organism_name=elem.get("scientificName"),
                common_name=elem.get("commonName"),
                taxon_lineage=[taxid],
                parsed_taxon_lineage=[
                    TaxonNode(
                        taxid=taxid,
                        scientific_name=elem.get("scientificName"),
                        rank="organism"
                    )
                ]
            )

            # --------- Parse lineage ---------
            lineage_elem = elem.find("lineage")
            if lineage_elem is not None:
                for lt in lineage_elem.findall("taxon"):
                    lt_taxid = lt.get("taxId")
                    if not lt_taxid or lt.get("scientificName") == "root":
                        continue

                    organism.taxon_lineage.append(lt_taxid)
                    organism.parsed_taxon_lineage.append(
                        TaxonNode(
                            taxid=lt_taxid,
                            scientific_name=lt.get("scientificName"),
                            rank=lt.get("rank") or "other"
                        )
                    )

            organisms.append(organism)

            # --------- Memory cleanup ONLY for top-level taxon ---------
            elem.clear()
            while elem.getprevious() is not None:
                del elem.getparent()[0]

    return organisms


def get_new_organisms_taxids(taxids: list[str])->list[str]:
    """
    Get the new organisms taxids from the taxids set
    - taxids: list of taxids to check
    - return: list of new organisms taxids
    """
    taxid_set = set(taxids)
    existing_organisms = set(Organism.objects(taxid__in=taxids).scalar('taxid'))
    new_taxids = taxid_set - existing_organisms
    return list(new_taxids)


def handle_new_lineage(organism: OrganismToProcess):
    """
    Handle the new lineage for an organism
    - organism: OrganismToProcess
    """
    #check if all the taxons already exists in the db and save the new ones
    existing_taxons = TaxonNode.objects(taxid__in=organism.taxon_lineage)
    new_taxons = set(organism.taxon_lineage) - set(existing_taxons.scalar('taxid'))
    if new_taxons:
        taxons_to_save = [taxon for taxon in organism.parsed_taxon_lineage if taxon.taxid in new_taxons]
        try:
            TaxonNode.objects.insert(taxons_to_save)
            print(f"Saved {len(taxons_to_save)} new taxons")
        except Exception as e:
            print(f"Error saving new taxons: {e}")
            # Update the existing taxons with the new rank and scientific name
    taxon_lineage_lookup = {item.taxid: item for item in organism.parsed_taxon_lineage}
    for taxon in existing_taxons:
        if taxon.taxid in taxon_lineage_lookup:
            lineage_item = taxon_lineage_lookup[taxon.taxid]
            payload = dict()
            if taxon.scientific_name != lineage_item.scientific_name:
                payload['scientific_name'] = lineage_item.scientific_name
            if taxon.rank != lineage_item.rank:
                payload['rank'] = lineage_item.rank
            if payload:
                taxon.modify(**payload)

    # Set parent_id from lineage (species index 0 toward root)
    ordered_taxons = get_ordered_taxons(organism.taxon_lineage)
    update_taxon_hierarchy(ordered_taxons)


def process_organism(organism: OrganismToProcess, existing_organism: Organism):
    """
    Process an organism
    - organism: OrganismToProcess
    """
    payload = dict()
    payload_of_related_documents = dict()
    if existing_organism.taxon_lineage != organism.taxon_lineage:
        payload['taxon_lineage'] = organism.taxon_lineage
        payload_of_related_documents['taxon_lineage'] = organism.taxon_lineage
        handle_new_lineage(organism)
    if existing_organism.organism_name != organism.organism_name:
        payload['organism_name'] = organism.organism_name
        payload_of_related_documents['organism_name'] = organism.organism_name
    if existing_organism.common_name != organism.common_name:
        payload['common_name'] = organism.common_name
    return payload, payload_of_related_documents


TMP_DIR = "/tmp"


def fetch_new_organisms_from_assembly_taxids(assembly_taxids: list[str]) -> None:
    """
    Fetch new organisms from assembly taxids and update taxonomy and related assemblies.
    """
    new_taxids = get_new_organisms_taxids(assembly_taxids)
    if not new_taxids:
        return
    new_organisms_to_process = [
        organism
        for organism in fetch_new_organisms(new_taxids, TMP_DIR)
        if organism.taxon_lineage
    ]
    if not new_organisms_to_process:
        return

    saved_taxids = save_organisms(new_organisms_to_process)
    if not saved_taxids:
        return

    save_taxons([o for o in new_organisms_to_process if o.taxon_id in saved_taxids])

    saved_organisms = Organism.objects(taxid__in=saved_taxids)
    for organism in saved_organisms:
        payload = dict(
            taxon_lineage=organism.taxon_lineage,
            organism_name=organism.organism_name,
        )
        GenomeAssembly.objects(taxid=organism.taxid).update(**payload)


def update_records_with_empty_taxon_lineage_fallback(
    model: type[GenomeAssembly] | type[GenomeAnnotation],
) -> None:
    """
    Update documents with empty taxon_lineage using organism lineage as fallback.
    """
    documents_with_empty_taxon_lineage = model.objects(taxon_lineage=[])
    if documents_with_empty_taxon_lineage.count() > 0:
        related_taxids = set(documents_with_empty_taxon_lineage.scalar("taxid"))
        related_organisms = Organism.objects(taxid__in=list(related_taxids))
        for organism in related_organisms:
            if organism.taxon_lineage:
                update_payload = dict(
                    taxon_lineage=organism.taxon_lineage,
                    organism_name=organism.organism_name,
                )
                model.objects(taxid=organism.taxid).update(**update_payload)


def update_taxonomy_from_ebi() -> None:
    """Refresh organism records and related assemblies/annotations from EBI."""
    all_taxids = Organism.objects().scalar("taxid")
    batches = create_batches(list(all_taxids), 5000)
    for batch in batches:
        organisms_to_process = fetch_new_organisms(batch, TMP_DIR)
        existing_organisms_map = {
            organism.taxid: organism for organism in Organism.objects(taxid__in=batch)
        }
        for organism in organisms_to_process:
            if not organism.taxon_lineage or organism.taxon_id not in existing_organisms_map:
                continue
            existing_organism = existing_organisms_map[organism.taxon_id]
            payload, payload_of_related_documents = process_organism(
                organism, existing_organism
            )
            if payload:
                existing_organism.modify(**payload)
            if payload_of_related_documents:
                GenomeAssembly.objects(taxid=organism.taxon_id).update(
                    **payload_of_related_documents
                )
                GenomeAnnotation.objects(taxid=organism.taxon_id).update(
                    **payload_of_related_documents
                )