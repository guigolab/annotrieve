"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  buildAnnotationsListUrl,
  mergeSearchParams,
} from "@/lib/annotations-url"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"

export function AnnotationsNavDialogProvider() {
  const router = useRouter()
  const pendingNav = useAnnotationsFiltersStore((s) => s.pendingAnnotationsNav)
  const setPendingAnnotationsNav = useAnnotationsFiltersStore((s) => s.setPendingAnnotationsNav)
  const lastKnownSearchParams = useAnnotationsFiltersStore((s) => s.lastKnownSearchParams)

  const handleClose = () => setPendingAnnotationsNav(null)

  const handleKeepAndAdd = () => {
    if (!pendingNav) return
    const merged = mergeSearchParams(lastKnownSearchParams, pendingNav.incoming, "merge")
    setPendingAnnotationsNav(null)
    router.push(buildAnnotationsListUrl(merged))
  }

  const handleReplace = () => {
    if (!pendingNav) return
    setPendingAnnotationsNav(null)
    router.push(buildAnnotationsListUrl(pendingNav.incoming))
  }

  return (
    <Dialog open={pendingNav != null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Active annotation filters</DialogTitle>
          <DialogDescription>
            You have active annotation filters from a previous session. Keep them and add{" "}
            <span className="font-medium text-foreground">{pendingNav?.label}</span>, or replace
            with only this filter?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleReplace}>
            Replace
          </Button>
          <Button onClick={handleKeepAndAdd}>Keep &amp; add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
