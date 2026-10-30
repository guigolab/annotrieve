"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface GenesViewToolbarProps {
  children: ReactNode
  className?: string
}

/** Slim single-row toolbar wrapper shared by Genes views. */
export function GenesViewToolbar({
  children,
  className,
}: GenesViewToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4",
        className,
      )}
    >
      {children}
    </div>
  )
}
