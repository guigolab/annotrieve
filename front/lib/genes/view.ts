export const GENES_VIEWS = ["distribution", "annotations", "compare"] as const

export type GenesView = (typeof GENES_VIEWS)[number]

export const DEFAULT_VIEW: GenesView = "distribution"

/** Heatmap / distribution count unit. */
export const COUNT_UNITS = ["annotations", "species"] as const

export type CountUnit = (typeof COUNT_UNITS)[number]

export const DEFAULT_COUNT_UNIT: CountUnit = "annotations"

/** Allow-list parse; returns null when missing or invalid. */
export function parseView(raw: string | null | undefined): GenesView | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  return (GENES_VIEWS as readonly string[]).includes(value)
    ? (value as GenesView)
    : null
}

/** Allow-list parse; returns null when missing or invalid. */
export function parseCountUnit(
  raw: string | null | undefined,
): CountUnit | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  return (COUNT_UNITS as readonly string[]).includes(value)
    ? (value as CountUnit)
    : null
}

/**
 * Resolve the active view from URL fields.
 * An explicit valid `view` wins; otherwise `ann` present → annotations
 * (so existing gene/annotation deep links open the Annotations drawer); else distribution.
 */
export function resolveViewFromUrl(opts: {
  view: GenesView | null
  ann: string | null
}): GenesView {
  if (opts.view) return opts.view
  if (opts.ann) return "annotations"
  return DEFAULT_VIEW
}
