import { getFilesBase, joinUrl } from '@/lib/config/env'

export async function headFile(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

export function chromosomesFileUrl(taxid: string, assemblyAccession: string): string {
  return joinUrl(getFilesBase(), `${taxid}/${assemblyAccession}/chromosomes.json`)
}

export function chrAliasesFileUrl(taxid: string, assemblyAccession: string): string {
  return joinUrl(getFilesBase(), `${taxid}/${assemblyAccession}/chr_aliases.tsv`)
}

export function contigsFileUrl(bgzippedPath: string): string {
  const rel = bgzippedPath.startsWith('/') ? bgzippedPath : `/${bgzippedPath}`
  return joinUrl(getFilesBase(), `${rel}.contigs.txt`)
}

export interface ChromosomeFileRow {
  canonical_id?: string
  chr_name?: string
  sequence_name?: string
  ucsc_style_name?: string
  genbank_accession?: string
  refseq_accession?: string
  sequence_role?: string
  length?: number
}

export async function fetchChromosomesFromFiles(
  taxid: string,
  assemblyAccession: string,
  pairedAccession?: string | null,
): Promise<ChromosomeFileRow[]> {
  const primaryUrl = chromosomesFileUrl(taxid, assemblyAccession)
  let response = await fetch(primaryUrl)
  if (!response.ok && pairedAccession) {
    response = await fetch(chromosomesFileUrl(taxid, pairedAccession))
  }
  if (!response.ok) {
    throw new Error(`chromosomes.json not found for ${assemblyAccession}`)
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function resolveChrAliasesFileUrl(
  taxid: string,
  assemblyAccession: string,
  pairedAccession?: string | null,
): Promise<string> {
  const primary = chrAliasesFileUrl(taxid, assemblyAccession)
  if (await headFile(primary)) {
    return primary
  }
  if (pairedAccession) {
    const paired = chrAliasesFileUrl(taxid, pairedAccession)
    if (await headFile(paired)) {
      return paired
    }
  }
  return primary
}

export async function assemblyHasChromosomesFile(
  taxid: string,
  assemblyAccession: string,
  pairedAccession?: string | null,
): Promise<boolean> {
  if (await headFile(chromosomesFileUrl(taxid, assemblyAccession))) {
    return true
  }
  if (pairedAccession) {
    return headFile(chromosomesFileUrl(taxid, pairedAccession))
  }
  return false
}
