const stripTrailingSlash = (value: string) =>
  value.replace(/\/+$/, '')

const ensureLeadingSlash = (value: string) =>
  value.startsWith('/') ? value : `/${value}`

const isGithubPagesHost = () =>
  typeof window !== 'undefined' && window.location.hostname.includes('github.io')

export const getFrontendBase = (): string => {
  const envValue = process.env.NEXT_PUBLIC_FRONTEND_BASE
  if (envValue && envValue.trim().length > 0) {
    return stripTrailingSlash(envValue.trim())
  }

  if (isGithubPagesHost()) {
    return stripTrailingSlash('https://genome.crg.es/annotrieve')
  }

  return stripTrailingSlash(ensureLeadingSlash('/annotrieve'))
}

export const getApiBase = (): string => {
  const envValue = process.env.NEXT_PUBLIC_API_BASE
  if (envValue && envValue.trim().length > 0) {
    return stripTrailingSlash(envValue.trim())
  }

  return stripTrailingSlash(`${getFrontendBase()}/api/v0`)
}

export const getFilesBase = (): string => {
  const envValue = process.env.NEXT_PUBLIC_FILES_BASE
  if (envValue && envValue.trim().length > 0) {
    return stripTrailingSlash(envValue.trim())
  }

  return stripTrailingSlash(`${getFrontendBase()}/files`)
}

/** Production annotrieve-xrefs API (optional override via NEXT_PUBLIC_XREFS_API_BASE). */
export const PRODUCTION_XREFS_API_BASE = 'https://genome.crg.es/annotrieve-xrefs/api/v1'

export const getXrefsApiBase = (): string => {
  const envValue = process.env.NEXT_PUBLIC_XREFS_API_BASE
  if (envValue && envValue.trim().length > 0) {
    return stripTrailingSlash(envValue.trim())
  }
  return PRODUCTION_XREFS_API_BASE
}

export const joinUrl = (base: string, path: string): string => {
  const cleanedBase = stripTrailingSlash(base)
  const cleanedPath = path.replace(/^\/+/, '')
  return `${cleanedBase}/${cleanedPath}`
}

