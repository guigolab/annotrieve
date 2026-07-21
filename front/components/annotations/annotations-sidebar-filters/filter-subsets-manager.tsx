"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAnnotationSubsetsStore, type AnnotationSubset } from "@/lib/stores/annotation-subsets"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { Save, X, GitCompare, Trash2, Edit2, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

function SubsetCard({ subset }: { subset: AnnotationSubset }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(subset.name)
  const updateSubset = useAnnotationSubsetsStore((state) => state.updateSubset)
  const deleteSubset = useAnnotationSubsetsStore((state) => state.deleteSubset)
  const setLastLoadedSubsetId = useAnnotationSubsetsStore((state) => state.setLastLoadedSubsetId)
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)

  const loadFilterSubset = useAnnotationsFiltersStore((state) => state.loadFilterSubset)

  const handleLoad = () => {
    loadFilterSubset(subset.filters)
    setLastLoadedSubsetId(subset.id)
  }

  const handleSaveEdit = () => {
    const trimmedName = editName.trim()
    if (!trimmedName) return

    const nameExists = subsets.some(
      (s) => s.id !== subset.id && s.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (nameExists) {
      return
    }

    updateSubset(subset.id, { name: trimmedName })
    setIsEditing(false)
  }

  const isNameDuplicate = Boolean(
    editName.trim() &&
      subsets.some(
        (s) => s.id !== subset.id && s.name.toLowerCase() === editName.trim().toLowerCase()
      )
  )

  const handleCancelEdit = () => {
    setEditName(subset.name)
    setIsEditing(false)
  }

  const handleDelete = () => {
    deleteSubset(subset.id)
  }

  return (
    <div
      className={cn(
        "group relative rounded-md border bg-card/80 p-2 transition-all hover:bg-card hover:shadow-sm",
        "border-border/70"
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: subset.color }}
        />

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isNameDuplicate) handleSaveEdit()
                    if (e.key === "Escape") handleCancelEdit()
                  }}
                  className={cn(
                    "h-7 text-xs",
                    isNameDuplicate && "border-destructive focus-visible:ring-destructive"
                  )}
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={handleSaveEdit}
                  disabled={isNameDuplicate || !editName.trim()}
                  title={isNameDuplicate ? "A filter set with this name already exists" : "Save"}
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEdit}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {isNameDuplicate && (
                <p className="text-[10px] text-destructive px-1">
                  A filter set with this name already exists
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleLoad}
                className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate flex-1 text-left"
                title={`Load "${subset.name}" filters`}
              >
                {subset.name}
              </button>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5"
                  onClick={() => setIsEditing(true)}
                  title="Rename"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function FilterSubsetsManager() {
  const router = useRouter()
  const subsets = useAnnotationSubsetsStore((state) => state.subsets)
  const hasSubsets = useAnnotationSubsetsStore((state) => state.hasSubsets())
  const [isOpen, setIsOpen] = useState(false)
  // Zustand persist can rehydrate before first paint; gate UI so SSR/static HTML matches.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const visibleSubsets = hydrated ? subsets : []
  const visibleHasSubsets = hydrated && hasSubsets

  const handleCompare = () => {
    if (visibleSubsets.length >= 2) {
      router.push("/annotations/compare")
    }
  }

  return (
    <div className="border-t backdrop-blur supports-[backdrop-filter]:bg-background/75 flex-shrink-0">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="p-3">
          <div
            className={cn(
              "flex items-center justify-between gap-2 transition-opacity duration-200 ease-out",
              hydrated ? "opacity-100" : "opacity-0"
            )}
          >
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    isOpen ? "transform rotate-90" : "transform rotate-0"
                  )}
                />
                <span className="text-sm font-semibold">Saved Filters</span>
                {visibleHasSubsets && (
                  <span className="text-xs text-muted-foreground">({visibleSubsets.length})</span>
                )}
              </button>
            </CollapsibleTrigger>
            {visibleSubsets.length >= 2 && (
              <Button
                size="sm"
                className="h-6 px-2 text-xs font-semibold"
                onClick={handleCompare}
              >
                <GitCompare className="h-3 w-3 mr-1" />
                Compare
              </Button>
            )}
          </div>

          <CollapsibleContent className="space-y-2">
            {visibleHasSubsets ? (
              <>
                <p className="text-xs text-muted-foreground px-0.5">
                  Click on a filter set name to load its filters
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {visibleSubsets.map((subset) => (
                    <SubsetCard key={subset.id} subset={subset} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground mb-2">No saved filter sets</p>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  )
}
