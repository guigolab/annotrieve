"use client"

import { useState, useMemo, useCallback, type ReactNode, Suspense } from "react"
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
import { useSelectedAnnotationsStore } from "@/lib/stores/selected-annotations"
import { getAnnotationDisplayName } from "@/lib/annotation-display"
import type { CustomAnnotation } from "@/lib/types"
import { useMergedFavoriteAnnotations } from "@/lib/hooks/use-merged-favorite-annotations"
import {
  useFavoritesCart,
  useActiveCustomAnnotations,
  usePruneOrphanedCustomAnnotations,
} from "@/lib/hooks/use-favorites-state"

type DrawerMode = "upload" | "view"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { UploadCustomDrawer } from "@/components/annotations/upload-custom-drawer"
import { CustomUploadProvider } from "@/components/annotations/custom-upload-context"
import { ExportCustomAnnotationsButton } from "@/components/annotations/export-custom-annotations-button"
import { UploadHeaderButton } from "@/components/annotations/upload-header-button"
import { AlertCircle, ArrowLeft, GitCompare, Loader2, PanelLeft, PanelLeftClose, RefreshCw, Star, Trash2, AlertTriangle } from "lucide-react"
import { useResponsiveSidebar } from "@/lib/hooks/use-responsive-sidebar"

function FavoritesComparePageContent({
  refreshToken,
  onRefresh,
  onViewCustomAnnotation,
  onOpenUploadDrawer,
  listSidebarOpen,
  onListSidebarOpenChange,
  toggleListSidebar,
}: {
  refreshToken: number
  onRefresh: () => void
  onViewCustomAnnotation: (annotation: CustomAnnotation) => void
  onOpenUploadDrawer: () => void
  listSidebarOpen: boolean
  onListSidebarOpenChange: (open: boolean) => void
  toggleListSidebar: () => void
}) {
  const router = useRouter()

  usePruneOrphanedCustomAnnotations(true)
  const { annotationsCart, favoriteSelections } = useFavoritesCart()
  const activeCustomAnnotations = useActiveCustomAnnotations()
  const removeFromCart = useSelectedAnnotationsStore((state) => state.removeFromCart)

  const customIdsSet = useMemo(
    () => new Set(activeCustomAnnotations.map((a) => a.annotation_id)),
    [activeCustomAnnotations],
  )

  const {
    favoriteAnnotations,
    totalFavorites,
    loading,
    error,
    favoriteIds,
  } = useMergedFavoriteAnnotations({
    favoriteSelections,
    customAnnotations: activeCustomAnnotations,
    refreshToken,
  })

  const selectionCount = favoriteIds.length
  const loadedCount = favoriteAnnotations.length

  const notFoundIds = useMemo(() => {
    if (loading || favoriteIds.length === 0) return []
    const loadedIds = new Set(favoriteAnnotations.map((a) => a.annotation_id))
    return favoriteIds.filter((id) => !loadedIds.has(id) && !customIdsSet.has(id))
  }, [loading, favoriteIds, favoriteAnnotations, customIdsSet])

  const [notFoundDialogOpen, setNotFoundDialogOpen] = useState(false)

  const handleRetry = () => onRefresh()

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
      <div className="h-full min-h-0 overflow-hidden">
        <AnnotationsCompare
          favoriteAnnotations={favoriteAnnotations}
          showFavs
          totalAnnotations={totalFavorites || selectionCount}
          selectionCount={selectionCount}
          customCount={activeCustomAnnotations.length}
          onViewCustomAnnotation={onViewCustomAnnotation}
          listSidebarOpen={listSidebarOpen}
          onListSidebarOpenChange={onListSidebarOpenChange}
        />
      </div>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <RightSidebar />
      </Suspense>
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        <header aria-label="Favorite annotations" className="px-4 sm:px-6 py-3 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur">
          <div
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div
              className="flex items-center gap-2 min-w-0 flex-1"
            >
              {loadedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 gap-1.5 shrink-0 md:hidden"
                  onClick={toggleListSidebar}
                  aria-label={listSidebarOpen ? "Close annotations list" : "Open annotations list"}
                >
                  {listSidebarOpen ? (
                    <PanelLeftClose className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                  <span className="text-sm">{listSidebarOpen ? "Hide" : "List"}</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => router.push('/annotations')} className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only sm:not-sr-only sm:inline">Back</span>
              </Button>
              <h1 className="text-lg sm:text-xl font-semibold text-foreground flex items-center gap-2 truncate min-w-0">
                <Star className="h-4 w-4 text-accent shrink-0" />
                <span className="truncate">Favorite Annotations</span>
              </h1>
            </div>
            <div
              className="flex items-center gap-2 shrink-0 flex-wrap justify-end"
            >
              {notFoundIds.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 sm:gap-2 border-amber-500/60 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/80"
                  onClick={() => setNotFoundDialogOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">
                    {notFoundIds.length} favorite{notFoundIds.length !== 1 ? "s" : ""} not found
                  </span>
                  <span className="sm:hidden">{notFoundIds.length} missing</span>
                </Button>
              )}
              <ExportCustomAnnotationsButton customAnnotations={activeCustomAnnotations} />
              <UploadHeaderButton onOpenDrawer={onOpenUploadDrawer} />
            </div>
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
                const label = cartEntry ? getAnnotationDisplayName(cartEntry) : id
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

export default function FavoritesComparePage() {
  const { sidebarOpen: listSidebarOpen, setSidebarOpen: onListSidebarOpenChange, toggleSidebar: toggleListSidebar } =
    useResponsiveSidebar()
  const [refreshToken, setRefreshToken] = useState(0)
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("upload")
  const [viewAnnotation, setViewAnnotation] = useState<CustomAnnotation | null>(null)

  const onFavoritesChanged = useCallback(() => setRefreshToken((t) => t + 1), [])
  const onAddedToFavorites = useCallback(() => setUploadDrawerOpen(false), [])

  const handleUploadDrawerOpenChange = useCallback((open: boolean) => {
    setUploadDrawerOpen(open)
    if (!open) {
      setDrawerMode("upload")
      setViewAnnotation(null)
    }
  }, [])

  const handleViewCustomAnnotation = useCallback((annotation: CustomAnnotation) => {
    setViewAnnotation(annotation)
    setDrawerMode("view")
    setUploadDrawerOpen(true)
  }, [])

  const handleOpenUploadDrawer = useCallback(() => {
    setDrawerMode("upload")
    setViewAnnotation(null)
    setUploadDrawerOpen(true)
  }, [])

  return (
    <CustomUploadProvider
      onFavoritesChanged={onFavoritesChanged}
      onAddedToFavorites={onAddedToFavorites}
    >
      <FavoritesComparePageContent
        refreshToken={refreshToken}
        onRefresh={onFavoritesChanged}
        onViewCustomAnnotation={handleViewCustomAnnotation}
        onOpenUploadDrawer={handleOpenUploadDrawer}
        listSidebarOpen={listSidebarOpen}
        onListSidebarOpenChange={onListSidebarOpenChange}
        toggleListSidebar={toggleListSidebar}
      />
      <UploadCustomDrawer
        open={uploadDrawerOpen}
        onOpenChange={handleUploadDrawerOpenChange}
        mode={drawerMode}
        viewAnnotation={viewAnnotation}
      />
    </CustomUploadProvider>
  )
}

