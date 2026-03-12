"use client"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ChevronDown, ChevronUp, Loader2, Search } from "lucide-react"

interface FilterAccordionSectionProps {
  title: string
  description: string
  options: Record<string, number>
  selected: string[]
  onChange: (values: string[]) => void
  isLoading: boolean
  isOpen: boolean
  onToggle: () => void
  searchQuery?: string
  onSearchChange?: (value: string) => void
  useExternalToggle?: boolean
}

export function FilterAccordionSection({
  title,
  description,
  options,
  selected,
  onChange,
  isLoading,
  isOpen,
  onToggle,
  searchQuery = "",
  onSearchChange,
  useExternalToggle = false,
}: FilterAccordionSectionProps) {
  const sortedOptions = Object.entries(options)
    .filter(([k]) => k !== "no_value")
    .sort((a, b) => b[1] - a[1])

  const filteredOptions = sortedOptions.filter(([option]) =>
    option.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const renderContent = () => {
    const shouldShowDescription = !useExternalToggle

    if (isLoading) {
      return (
        <div className="py-4 text-center text-sm text-muted-foreground">
          Loading options...
        </div>
      )
    }

    if (sortedOptions.length === 0) {
      return (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No options available
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {shouldShowDescription && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}

        {sortedOptions.length > 10 && (
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search options..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        )}

        <div className="max-h-64 overflow-y-auto p-4 border rounded-lg">
          {filteredOptions.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No options match your search
            </div>
          ) : (
            filteredOptions.map(([option, count]) => (
              <div key={option} className="flex items-center space-x-3 py-2">
                <Checkbox
                  id={`${title}-${option}`}
                  checked={selected.includes(option)}
                  onCheckedChange={() => {
                    if (selected.includes(option)) {
                      onChange(selected.filter((v) => v !== option))
                    } else {
                      onChange([...selected, option])
                    }
                  }}
                />
                <Label
                  htmlFor={`${title}-${option}`}
                  className="flex-1 text-sm cursor-pointer flex items-center justify-between"
                >
                  <span className="flex-1">{option}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {count.toLocaleString()}
                  </span>
                </Label>
              </div>
            ))
          )}
        </div>

        {sortedOptions.length > 10 && searchQuery && (
          <div className="text-xs text-muted-foreground pt-3 border-t">
            Showing {filteredOptions.length} of {sortedOptions.length} options
          </div>
        )}
      </div>
    )
  }

  if (useExternalToggle) {
    if (!isOpen) return null

    return (
      <div className="space-y-4">
        {renderContent()}
      </div>
    )
  }

  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold">{title}</span>
          {isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
          {selected.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {selected.length}
            </Badge>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="border-t p-5">
          {renderContent()}
        </div>
      )}
    </div>
  )
}

