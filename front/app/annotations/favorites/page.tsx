"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AnnotationsCompare } from "@/components/annotations-compare/annotations-compare"
import { listAnnotations } from "@/lib/api/annotations"
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import type { Annotation } from "@/lib/types"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { AlertCircle, ArrowLeft, GitCompare, Loader2, RefreshCw, Star, Trash2, AlertTriangle } from "lucide-react"

export default function FavoritesComparePage() {
  const router = useRouter()

  const annotationsCart = useSelectedAnnotationsStore((state) => state.annotationsCart)
  const removeFromCart = useSelectedAnnotationsStore((state) => state.removeFromCart)
  const favoriteSelections = useMemo(
    () => Array.from(annotationsCart.values()),
    [annotationsCart]
  )

  const favoriteIds = useMemo(() => {
    const unique = new Set<string>()
    favoriteSelections.forEach((annotation) => {
      if (annotation?.annotation_id) {
        unique.add(annotation.annotation_id)
      }
    })
    return Array.from(unique)
  }, [favoriteSelections])

  const [favoriteAnnotations, setFavoriteAnnotations] = useState<Annotation[]>([])
  const [totalFavorites, setTotalFavorites] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchFavorites = async () => {
      if (favoriteIds.length === 0) {
        setFavoriteAnnotations([])
        setTotalFavorites(0)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const params: Record<string, any> = {
          md5_checksums: favoriteIds.join(','),
          limit: favoriteIds.length + 1,
          offset: 0,
        }
        const res = await listAnnotations(params as any)
        if (cancelled) return
        const results = (res as any)?.results || []
        setFavoriteAnnotations(results as Annotation[])
        setTotalFavorites((res as any)?.total ?? results.length)
      } catch (err) {
        if (cancelled) return
        console.error('Error loading favorite annotations:', err)
        setFavoriteAnnotations([])
        setTotalFavorites(0)
        setError('Unable to load favorite annotations. Please try again.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchFavorites()

    return () => {
      cancelled = true
    }
  }, [favoriteIds, refreshToken])

  const selectionCount = favoriteIds.length
  const loadedCount = favoriteAnnotations.length

  const notFoundIds = useMemo(() => {
    if (loading || favoriteIds.length === 0) return []
    const loadedIds = new Set(favoriteAnnotations.map((a) => a.annotation_id))
    return favoriteIds.filter((id) => !loadedIds.has(id))
  }, [loading, favoriteIds, favoriteAnnotations])

  const [notFoundDialogOpen, setNotFoundDialogOpen] = useState(false)

  const handleRetry = () => setRefreshToken((prev) => prev + 1)

  const handleRemoveNotFound = (id: string) => {
    removeFromCart(id)
  }

  const handleRemoveAllNotFound = () => {
    notFoundIds.forEach((id) => removeFromCart(id))
    setNotFoundDialogOpen(false)
  }

  let content: ReactNode
  if (selectionCount === 0) {
    content = (
      <div className="flex h-full items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center border-2 border-dashed">
          <Star className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No favorites yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Star annotations from the main search page to build a favorites list you can compare here.
          </p>
          <Button variant="default" onClick={() => router.push('/annotations')}>
            Browse annotations
          </Button>
        </Card>
      </div>
    )
  } else if (error) {
    content = (
      <div className="flex h-full items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" onClick={() => router.push('/annotations')}>
              Back to search
            </Button>
          </div>
        </Card>
      </div>
    )
  } else if (loading && loadedCount === 0) {
    content = (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading favorite annotations…</span>
        </div>
      </div>
    )
  } else if (loadedCount === 0) {
    content = (
      <div className="flex h-full items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center border-2 border-dashed">
          <GitCompare className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">No matching favorites found</h2>
          <p className="text-sm text-muted-foreground mb-6">
            We couldn’t load the selected favorites. Try refreshing or updating your selection.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => router.push('/annotations')}>
              Manage favorites
            </Button>
          </div>
        </Card>
      </div>
    )
  } else {
    content = (
      <div className="h-full lg:overflow-hidden overflow-y-auto">
        <AnnotationsCompare
          favoriteAnnotations={favoriteAnnotations}
          showFavs
          totalAnnotations={totalFavorites || selectionCount}
        />
      </div>
    )
  }

  return (
    <>
      <RightSidebar />
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        <header aria-label="Favorite annotations" className="px-6 pt-6 pb-4 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => router.push('/annotations')}>
                <ArrowLeft className="h-4 w-4" />
                Back to annotations
              </Button>
            </div>
              <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">                 <Star className="h-4 w-4 text-accent" />
              Favorite Annotations</h1>
              <p className="text-sm text-muted-foreground">
                Select up to 10 annotations to visualize overlaps, gene metrics, and transcript composition side by side.
              </p>
            </div>

          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              Selected favorites: <span className="text-foreground font-semibold">{selectionCount}</span>
            </span>
            {selectionCount > 0 && (
              <span>
                Loaded annotations: <span className="text-foreground font-semibold">{loadedCount}</span>
              </span>
            )}
            {notFoundIds.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/80"
                onClick={() => setNotFoundDialogOpen(true)}
              >
                <AlertTriangle className="h-4 w-4" />
                {notFoundIds.length} favorite{notFoundIds.length !== 1 ? "s" : ""} not found
              </Button>
            )}
          </div>
        </header>

        <Dialog open={notFoundDialogOpen} onOpenChange={setNotFoundDialogOpen}>
          <DialogContent className="max-w-md sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Favorites not found
              </DialogTitle>
              <DialogDescription>
                The following {notFoundIds.length} favorite{notFoundIds.length !== 1 ? "s" : ""} could not be loaded (e.g. removed or unavailable). Remove them from your favorites to clean up.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-[240px] overflow-y-auto rounded-md border border-border bg-muted/30 py-2 text-sm">
              {notFoundIds.map((id) => {
                const cartEntry = annotationsCart.get(id)
                const label = cartEntry?.organism_name ?? cartEntry?.assembly_name ?? id
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="truncate text-foreground" title={id}>
                      {label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveNotFound(id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </li>
                )
              })}
            </ul>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setNotFoundDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={handleRemoveAllNotFound}
              >
                <Trash2 className="h-4 w-4" />
                Remove all not found
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <main className="flex-1 min-h-0 lg:overflow-hidden overflow-y-auto bg-background">
          {content}
        </main>
      </div>
    </>
  )
}


