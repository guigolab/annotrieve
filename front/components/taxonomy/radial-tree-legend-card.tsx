"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { GLASS_PANEL } from "./taxonomy-types"

export interface LegendItem {
  taxid: string
  name: string
  color: string
}

interface RadialTreeLegendCardProps {
  items: LegendItem[]
  rootName: string
  selectedTaxid: string | null
  onItemClick: (taxid: string) => void
  /** When true, suppresses the mobile bottom-0 card (e.g. when merged into BottomStackVizStrip) */
  hideMobile?: boolean
}

export function RadialTreeLegendCard({
  items,
  rootName,
  selectedTaxid,
  onItemClick,
  hideMobile = false,
}: RadialTreeLegendCardProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  if (items.length === 0) return null

  const header = (
    <button
      type="button"
      className="flex items-center justify-between w-full gap-2 px-2.5 py-1.5 md:cursor-default"
      onClick={() => setMobileOpen((v) => !v)}
      aria-expanded={mobileOpen}
      aria-controls="legend-items"
    >
      <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground truncate">
        Children of <span className="text-foreground/80">{rootName}</span>
      </span>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 text-muted-foreground transition-transform md:hidden",
          mobileOpen && "rotate-180"
        )}
        aria-hidden
      />
    </button>
  )

  const itemList = (
    <div
      id="legend-items"
      className="overflow-y-auto max-h-[calc(40vh-2.5rem)] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
    >
      {items.map((item) => {
        const isSelected = selectedTaxid === item.taxid
        return (
          <button
            key={item.taxid}
            type="button"
            onClick={() => onItemClick(item.taxid)}
            className={cn(
              "flex items-center gap-2 w-full px-2.5 py-1 text-left transition-colors rounded-sm",
              "hover:bg-muted/60",
              isSelected && "ring-1 ring-inset ring-secondary/40 bg-secondary/5"
            )}
          >
            <span
              className="shrink-0 rounded-full"
              style={{ width: 6, height: 6, backgroundColor: item.color }}
              aria-hidden
            />
            <span className="text-[11px] text-foreground/80 truncate">{item.name}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      {/* Mobile: collapsed pill, expands upward — hidden when merged into BottomStackVizStrip */}
      {!hideMobile && (
        <div
          className={cn(
            "pointer-events-auto absolute bottom-0 left-0 z-20 w-56 md:hidden",
            GLASS_PANEL,
            "rounded-none border-x-0 border-b-0 shadow-md"
          )}
        >
          {header}
          {mobileOpen && itemList}
        </div>
      )}

      {/* Desktop: always visible card at bottom-left */}
      <div
        className={cn(
          "pointer-events-auto absolute bottom-4 left-4 z-20 w-56 hidden md:block",
          GLASS_PANEL,
          "rounded-md shadow-md"
        )}
      >
        <div className="pt-1.5 pb-1 border-b border-border/50">
          <div className="px-2.5">
            <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
              Children of{" "}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-medium text-foreground/80">
              {rootName}
            </span>
          </div>
        </div>
        {itemList}
      </div>
    </>
  )
}
