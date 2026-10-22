import type { FlatTreeNode } from "@/lib/api/taxons"

export function buildTaxonIndex(
  flatNodes: FlatTreeNode[],
): Map<string, FlatTreeNode> {
  const index = new Map<string, FlatTreeNode>()
  for (const n of flatNodes) index.set(n.id, n)
  return index
}
