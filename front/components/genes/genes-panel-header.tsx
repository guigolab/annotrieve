"use client"

import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PanelLevel } from "@/lib/genes/store"
import { cn } from "@/lib/utils"

export interface PanelCrumb {
  label: string
  italic?: boolean
  onClick?: () => void
}

interface GenesPanelHeaderProps {
  level: PanelLevel
  crumbs: PanelCrumb[]
  countLabel?: string
  onBack?: () => void
  children?: React.ReactNode
}

export function GenesPanelHeader({
  level,
  crumbs,
  countLabel,
  onBack,
  children,
}: GenesPanelHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border/60 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        {level !== "list" && onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <nav
          aria-label="Panel breadcrumb"
          className="min-w-0 flex-1 flex items-center gap-1 text-sm overflow-hidden"
        >
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1 min-w-0">
                {i > 0 && (
                  <span className="text-muted-foreground shrink-0" aria-hidden>
                    ›
                  </span>
                )}
                {crumb.onClick && !last ? (
                  <button
                    type="button"
                    className={cn(
                      "truncate hover:underline text-muted-foreground",
                      crumb.italic && "italic",
                    )}
                    onClick={crumb.onClick}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "truncate font-semibold outline-none",
                      crumb.italic && "italic",
                      !last && "font-normal text-muted-foreground",
                    )}
                    tabIndex={last ? -1 : undefined}
                    data-panel-heading={last ? "" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            )
          })}
        </nav>
        {level === "list" && countLabel != null && (
          <span className="tabular-nums text-sm text-muted-foreground shrink-0">
            {countLabel}
          </span>
        )}
      </div>
      {children}
    </header>
  )
}
