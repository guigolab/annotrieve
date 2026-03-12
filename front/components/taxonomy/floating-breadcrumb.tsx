"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { GLASS_PANEL, TAXONOMY_LINK_MUTED } from "./taxonomy-types"

export interface BreadcrumbEntry {
  taxid: string
  name: string
}

interface FloatingBreadcrumbProps {
  /** Ancestors only (path to current root, excluding the current root). */
  path: BreadcrumbEntry[]
  onNavigate: (taxid: string, name: string) => void
  className?: string
}

const MAX_SHOWN = 4

export function FloatingBreadcrumb({
  path,
  onNavigate,
  className,
}: FloatingBreadcrumbProps) {
  const [expanded, setExpanded] = useState(false)

  if (path.length === 0) {
    return (
      <nav
        className={cn(GLASS_PANEL, "flex items-center px-3 py-1.5 text-xs max-w-[320px] lg:max-w-sm", className)}
        aria-label="Taxon lineage"
      >
        <span className="text-muted-foreground/80" title="Ancestors of current root; click to re-root">
          Lineage — click ancestor to re-root
        </span>
      </nav>
    )
  }

  const shouldCollapse = path.length > MAX_SHOWN && !expanded
  let displayPath: BreadcrumbEntry[]

  if (shouldCollapse) {
    displayPath = [
      ...path.slice(0, 2),
      { taxid: "__ellipsis__", name: "…" },
      ...path.slice(-2),
    ]
  } else {
    displayPath = path
  }

  return (
    <nav
      className={cn(GLASS_PANEL, "flex items-center gap-1 px-3 py-1.5 text-xs max-w-[320px] lg:max-w-sm", className)}
      aria-label="Taxon lineage — click to re-root"
    >
      {displayPath.map(({ taxid, name }, i) => {
        const isEllipsis = taxid === "__ellipsis__"
        return (
          <span key={taxid + i} className="flex items-center gap-1 shrink-0">
            {i > 0 && (
              <span className="text-muted-foreground/50 select-none text-[10px]">›</span>
            )}
            {isEllipsis ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className={cn(TAXONOMY_LINK_MUTED, "px-0.5")}
                title="Show full path"
              >
                {name}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(taxid, name)}
                className={cn(TAXONOMY_LINK_MUTED, "truncate max-w-[100px]")}
                title={`Re-root to ${name}`}
              >
                {name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
