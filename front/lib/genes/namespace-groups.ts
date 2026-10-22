export type NamespaceGroupId =
  | "identity"
  | "domains"
  | "uniprot"
  | "model"
  | "eggnog"
  | "other"

export interface NamespaceGroup {
  id: NamespaceGroupId
  label: string
  namespaces: string[]
}

/** Static Tier A groupings for the catalogue accordion (README namespaces). */
const GROUP_ORDER: NamespaceGroupId[] = [
  "identity",
  "domains",
  "uniprot",
  "model",
  "eggnog",
  "other",
]

const GROUP_LABELS: Record<NamespaceGroupId, string> = {
  identity: "Identity",
  domains: "Domains & ontology",
  uniprot: "UniProt",
  model: "Model / community",
  eggnog: "eggNOG / COG",
  other: "Other",
}

const NAMESPACE_GROUP: Record<string, NamespaceGroupId> = {
  symbol: "identity",
  alias: "identity",
  geneid: "identity",
  interpro: "domains",
  pfam: "domains",
  go: "domains",
  goa: "domains",
  rfam: "domains",
  cdd: "domains",
  tigrfam: "domains",
  ncbiortholog: "domains",
  jgidb: "domains",
  phytozome: "domains",
  mirbase: "domains",
  hgnc: "model",
  mgi: "model",
  rgd: "model",
  zfin: "model",
  vgnc: "model",
  flybase: "model",
  wormbase: "model",
  sgd: "model",
  tair: "model",
  xenbase: "model",
  dictybase: "model",
  vectorbase: "model",
  pombase: "model",
  "rap-db": "model",
  araport: "model",
  beebase: "model",
  beetlebase: "model",
  bgd: "model",
  aphidbase: "model",
  cgd: "model",
  genedb: "model",
  mim: "model",
  marpolbase: "model",
  apidb_toxodb: "model",
  apidb_cryptodb: "model",
  apidb_plasmodb: "model",
  "imgt/gene-db": "model",
  ensembl: "model",
  ensemblgenomes: "model",
  cgnc: "model",
  fungidb: "model",
  i5knal: "model",
  nasoniabase: "model",
  "uniprot/swiss-prot": "uniprot",
  "uniprot/trembl": "uniprot",
  uniprotkb: "uniprot",
  eggnog: "eggnog",
  cog: "eggnog",
}

export function groupNamespaces(
  namespaces: { namespace: string; accession_count: number }[],
): NamespaceGroup[] {
  const buckets = new Map<NamespaceGroupId, { namespace: string; accession_count: number }[]>()
  for (const id of GROUP_ORDER) buckets.set(id, [])

  for (const row of namespaces) {
    const groupId = NAMESPACE_GROUP[row.namespace] ?? "other"
    buckets.get(groupId)!.push(row)
  }

  return GROUP_ORDER.map((id) => {
    const rows = buckets.get(id) ?? []
    rows.sort((a, b) => {
      if (b.accession_count !== a.accession_count) {
        return b.accession_count - a.accession_count
      }
      return a.namespace.localeCompare(b.namespace)
    })
    return {
      id,
      label: GROUP_LABELS[id],
      namespaces: rows.map((r) => r.namespace),
    }
  }).filter((g) => g.namespaces.length > 0)
}

export function namespaceCountMap(
  namespaces: { namespace: string; accession_count: number }[],
): Map<string, number> {
  return new Map(namespaces.map((n) => [n.namespace, n.accession_count]))
}
