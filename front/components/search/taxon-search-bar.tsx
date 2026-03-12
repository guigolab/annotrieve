"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

const DEFAULT_DEBOUNCE = 400
const DEFAULT_MIN_QUERY = 2

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

export interface TaxonSearchResult<T = any> {
  id: string
  modelKey: string
  label: string
  title: string
  subtitle?: string
  meta?: string
  data: T
}

function useDebouncedValue<T>(value: T, delay = DEFAULT_DEBOUNCE) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}

interface TaxonSearchBarProps {
  placeholder?: string
  models: SearchModelConfig[]
  minQueryLength?: number
  debounceMs?: number
  className?: string
  inputClassName?: string
  value?: string
  defaultValue?: string
  onQueryChange?: (value: string) => void
  onResults?: (results: TaxonSearchResult[]) => void
  onSelect?: (result: TaxonSearchResult) => void
  onNoResults?: () => void
  onSearchingChange?: (isSearching: boolean) => void
}

export function TaxonSearchBar({
  placeholder = "Search...",
  models,
  minQueryLength = DEFAULT_MIN_QUERY,
  debounceMs = DEFAULT_DEBOUNCE,
  className,
  inputClassName,
  value,
  defaultValue = "",
  onQueryChange,
  onResults,
  onSelect,
  onNoResults,
  onSearchingChange,
}: TaxonSearchBarProps) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [isSearching, setIsSearching] = useState(false)
  const latestRequestRef = useRef(0)

  const inputValue = value ?? internalValue
  const debouncedQuery = useDebouncedValue(inputValue, debounceMs)
  const trimmedQuery = debouncedQuery.trim()
  const shouldSearch = trimmedQuery.length >= minQueryLength

  useEffect(() => {
    if (!shouldSearch) {
      onResults?.([])
      setIsSearching(false)
      onSearchingChange?.(false)
      return
    }

    const requestId = ++latestRequestRef.current
    setIsSearching(true)
    onSearchingChange?.(true)

    Promise.all(
      models.map(async (model) => {
        try {
          const limit = model.limit ?? 5
          const data = await model.fetchResults(trimmedQuery, limit)
          return (data || []).map<TaxonSearchResult>((item) => ({
            id: model.getId(item),
            modelKey: model.key,
            label: model.label ?? model.key,
            title: model.getTitle(item),
            subtitle: model.getSubtitle?.(item),
            meta: model.getMeta?.(item),
            data: item,
          }))
        } catch (error) {
          console.error(`[TaxonSearchBar] Failed to fetch ${model.key} results`, error)
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
        // Emit results to parent
        onResults?.(unique)
        
        // If no results, notify parent
        if (unique.length === 0) {
          onNoResults?.()
        }
      })
      .finally(() => {
        if (latestRequestRef.current === requestId) {
          setIsSearching(false)
          onSearchingChange?.(false)
        }
      })
  }, [models, shouldSearch, trimmedQuery, onResults, onNoResults, onSearchingChange])

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
  }

  const resetInput = () => {
    updateValue("")
    onResults?.([])
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      resetInput()
    }
  }

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className={cn("pl-10", inputValue ? "pr-20" : "pr-10", inputClassName)}
        />
        {isSearching && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {inputValue && !isSearching && (
          <button
            onClick={resetInput}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

