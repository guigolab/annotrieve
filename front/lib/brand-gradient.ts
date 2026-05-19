/** Brand gradient stops — matches hero title `from-primary via-secondary to-accent`. */
export const BRAND_GRADIENT_COLORS = {
  primary: "#0891b2",
  secondary: "#d97706",
  accent: "#9333ea",
} as const

export const BRAND_GRADIENT_CSS = `linear-gradient(90deg, ${BRAND_GRADIENT_COLORS.primary} 0%, ${BRAND_GRADIENT_COLORS.secondary} 50%, ${BRAND_GRADIENT_COLORS.accent} 100%)`
