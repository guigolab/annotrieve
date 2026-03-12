"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlatTreeNode } from "@/lib/api/taxons"

export interface ExpandableSearchProps {
  query: string
  results: FlatTreeNode[]
  showResults: boolean
  onChange: (q: string) => void
  onSelect: (node: FlatTreeNode) => void
  onBlur: () => void
}

export function ExpandableSearch({
  query,
  results,
  showResults,
  onChange,
  onSelect,
  onBlur,
}: ExpandableSearchProps) {
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focused && !query) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
        onBlur()
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [focused, query, onBlur])

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setFocused(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
        className={cn(
          "flex items-center gap-2 h-8 rounded-lg px-2.5 border transition-all duration-200 text-sm",
          focused || query
            ? "w-52 bg-background border-border text-foreground"
            : "w-8 bg-transparent border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search taxon…"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          className={cn(
            "bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground w-full transition-opacity",
            focused || query ? "opacity-100" : "opacity-0 w-0"
          )}
          aria-label="Search taxon by name or ID"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={(e) => {
              e.stopPropagation()
              onChange("")
              setFocused(false)
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </button>

      {showResults && results.length > 0 && (
        <div className="absolute right-0 top-full mt-1.5 w-64 z-50 rounded-lg shadow-lg overflow-hidden border border-border bg-popover">
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                onSelect(node)
                setFocused(false)
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border last:border-0"
            >
              <div className="text-sm text-foreground truncate">{node.scientific_name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                ID {node.id} · {node.annotations_count.toLocaleString()} annotations
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
