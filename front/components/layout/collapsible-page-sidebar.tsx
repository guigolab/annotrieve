"use client"

import type { ReactNode, CSSProperties } from "react"
import { PanelLeftClose } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CollapsiblePageSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  width: number
  title: string
  children: ReactNode
  /** Extra classes on the outer aside */
  className?: string
  /** Allow vertical scroll inside sidebar (default true) */
  scrollable?: boolean
}

export function CollapsiblePageSidebar({
  open,
  onOpenChange,
  width,
  title,
  children,
  className,
  scrollable = true,
}: CollapsiblePageSidebarProps) {
  const cssVar = { "--sidebar-w": `${width}px` } as CSSProperties

  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => onOpenChange(false)}
      />
      <aside
        className={cn(
          "flex-shrink-0 border-r border-border bg-background transition-[transform,width] duration-200 ease-out",
          "fixed left-0 top-14 bottom-0 z-50 flex flex-col md:relative md:left-auto md:top-auto md:bottom-auto md:z-auto",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          open ? "md:w-[var(--sidebar-w)]" : "md:w-0 md:overflow-hidden",
          scrollable ? "overflow-y-auto" : "overflow-hidden",
          className
        )}
        style={cssVar}
      >
        <div
          className="h-full w-[var(--sidebar-w)] min-w-0 flex flex-col"
          style={cssVar}
        >
          <div
            className="flex items-center justify-between px-3 py-2 border-b border-border md:hidden shrink-0"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </div>
      </aside>
    </>
  )
}
