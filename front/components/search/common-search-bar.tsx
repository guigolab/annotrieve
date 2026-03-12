"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { INSDCSearchResults } from "./insdc-search-results"
import { CommonSearchResult } from "@/lib/types"

const DEFAULT_DEBOUNCE = 400
const DEFAULT_MIN_QUERY = 2

function useDebouncedValue<T>(value: T, delay = DEFAULT_DEBOUNCE) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

export interface SearchModelConfig<T = any> {
  key: string
  label?: string
  limit?: number
  fetchResults: (query: string, limit: number) => Promise<T[]>
  getId: (item: T) => string
  getTitle: (item: T) => string
  getSubtitle?: (item: T) => string | undefined
  getMeta?: (item: T) => string | undefined
}

interface CommonSearchBarProps {
  placeholder?: string
  models: SearchModelConfig[]
  minQueryLength?: number
  debounceMs?: number
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  closeOnSelect?: boolean
  clearOnSelect?: boolean
  value?: string
  defaultValue?: string
  onQueryChange?: (value: string) => void
  onSelect: (result: CommonSearchResult) => void
}

export function CommonSearchBar({
  placeholder = "Search...",
  models,
  minQueryLength = DEFAULT_MIN_QUERY,
  debounceMs = DEFAULT_DEBOUNCE,
  className,
  inputClassName,
  dropdownClassName,
  closeOnSelect = true,
  clearOnSelect = true,
  value,
  defaultValue = "",
  onQueryChange,
  onSelect,
}: CommonSearchBarProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [results, setResults] = useState<CommonSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const latestRequestRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const inputValue = value ?? internalValue
  const debouncedQuery = useDebouncedValue(inputValue, debounceMs)
  const trimmedQuery = debouncedQuery.trim()
  const shouldSearch = trimmedQuery.length >= minQueryLength

  useEffect(() => {
    if (!shouldSearch) {
      setResults([])
      setIsSearching(false)
      return
    }

    const requestId = ++latestRequestRef.current
    setIsSearching(true)

    Promise.all(
      models.map(async (model) => {
        try {
          const limit = model.limit ?? 5
          const data = await model.fetchResults(trimmedQuery, limit)
          return (data || []).map<CommonSearchResult>((item) => ({
            id: model.getId(item),
            modelKey: model.key,
            label: model.label ?? model.key,
            title: model.getTitle(item),
            subtitle: model.getSubtitle?.(item),
            meta: model.getMeta?.(item),
            data: item,
          }))
        } catch (error) {
          console.error(`[CommonSearchBar] Failed to fetch ${model.key} results`, error)
          return []
        }
      })
    )
      .then((modelResults) => {
        if (latestRequestRef.current !== requestId) return
        const merged = modelResults.flat()
        const seen = new Set<string>()
        const unique = merged.filter((result) => {
          if (seen.has(result.id)) return false
          seen.add(result.id)
          return true
        })
        setResults(unique)
        setHighlightedIndex(0)
        setIsOpen(true)
      })
      .finally(() => {
        if (latestRequestRef.current === requestId) {
          setIsSearching(false)
        }
      })
  }, [models, shouldSearch, trimmedQuery])

  const handleOutsideClick = useCallback(
    (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    },
    []
  )

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [handleOutsideClick])

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value)
    }
  }, [value])

  const updateValue = (next: string) => {
    if (value === undefined) {
      setInternalValue(next)
    }
    onQueryChange?.(next)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value
    updateValue(nextValue)
    if (!isOpen && nextValue.length >= minQueryLength) {
      setIsOpen(true)
    }
  }

  const resetInput = () => {
    updateValue("")
    setResults([])
    setIsOpen(false)
  }

  const handleSelect = (result: CommonSearchResult) => {
    onSelect(result)
    if (clearOnSelect) {
      updateValue("")
    }
    if (closeOnSelect) {
      setIsOpen(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev + 1) % results.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const selected = results[highlightedIndex]
      if (selected) {
        handleSelect(selected)
      }
    } else if (event.key === "Escape") {
      setIsOpen(false)
    }
  }

  const showDropdown =
    isOpen && (results.length > 0 || isSearching || inputValue.length > 0)
  const shouldShowInsdcFallback =
    !isSearching && shouldSearch && results.length === 0

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={cn("pl-10 pr-10", inputClassName)}
        />
        {inputValue && (
          <button
            onClick={resetInput}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className={cn(
            "absolute top-full mt-2 w-full bg-popover border rounded-lg shadow-lg z-50 overflow-hidden",
            dropdownClassName
          )}
        >
          <div className="max-h-[360px] overflow-y-auto">
            {isSearching ? (
              <div className="px-4 py-6 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                <p className="text-sm">Searching...</p>
              </div>
            ) : results.length > 0 ? (
              results.map((result, index) => (
                <button
                  key={`${result.modelKey}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    "w-full px-4 py-3 flex items-start gap-3 hover:bg-accent/50 transition-colors text-left",
                    index === highlightedIndex && "bg-accent/30"
                  )}
                >
                  <Badge variant="outline" className="text-xs capitalize">
                    {result.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {result.title}
                    </div>
                    {result.subtitle && (
                      <div className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </div>
                    )}
                  </div>
                  {result.meta && (
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {result.meta}
                    </div>
                  )}
                </button>
              ))
            ) : shouldShowInsdcFallback ? (
              <INSDCSearchResults
                query={inputValue}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

