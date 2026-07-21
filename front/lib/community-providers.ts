/**
 * Static catalog of community registry providers.
 * Replace / extend with an API once registry import exposes provider metadata.
 */

export type CommunityProviderStatus = "listed" | "import_pending" | "available"

export type CommunityProvider = {
  /** Stable slug, e.g. "toga2" */
  id: string
  /** Folder name in annotrieve-registry */
  registryFolder: string
  providerName: string
  projectDisplayName: string
  pipelineMethod: string
  pipelineVersion: string
  description: string
  homepageUrl?: string
  /** Provider / project GitHub repository */
  githubUrl?: string
  /** bioRxiv (or journal) page */
  preprintUrl?: string
  /** Optional; UI shows DOI only when set */
  doi?: string
  /** Integration / data README */
  dataReadmeUrl?: string
  /** Exact value on Annotation.source_file_info.provider (frequencies + browse filter) */
  filterProvider: string
  status: CommunityProviderStatus
}

export const REGISTRY_REPO_URL = "https://github.com/guigolab/annotrieve-registry"
export const CONTRIBUTING_URL = `${REGISTRY_REPO_URL}/blob/master/CONTRIBUTING.md`

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`
}

export const COMMUNITY_PROVIDERS: CommunityProvider[] = [
  {
    id: "toga2",
    registryFolder: "TOGA2",
    providerName: "Hiller Lab, Senckenberg Research Institute",
    projectDisplayName: "TOGA2 vertebrate gene annotations",
    pipelineMethod: "TOGA2 comparative genome annotation pipeline",
    pipelineVersion: "2.0.9",
    description:
      "Comparative gene annotations generated with the TOGA2 pipeline. Different vertebrate clades were annotated using clade-specific reference assemblies for mammals, birds, testudines, and percomorph fishes. See the project homepage for details on reference assemblies and methodology.",
    homepageUrl: "https://genome.senckenberg.de",
    githubUrl: "https://github.com/hillerlab/TOGA2",
    preprintUrl: "https://www.biorxiv.org/content/10.64898/2026.06.30.735536v1",
    dataReadmeUrl:
      "https://genome.senckenberg.de/download/TOGA2/TOGA2integration/README.txt",
    filterProvider: "Hiller Lab, Senckenberg Research Institute",
    status: "available",
  },
]
