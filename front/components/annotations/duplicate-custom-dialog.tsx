"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface DuplicateCustomDialogProps {
  open: boolean
  existingName: string
  onOverwrite: () => void
  onCancel: () => void
}

export function DuplicateCustomDialog({
  open,
  existingName,
  onOverwrite,
  onCancel,
}: DuplicateCustomDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate upload detected</DialogTitle>
          <DialogDescription>
            This file matches <span className="font-semibold text-foreground">{existingName}</span>{" "}
            (same content). You can overwrite the existing entry or cancel.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Adding as a separate entry with the same file content is not supported yet — same file
          content shares one annotation ID.
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onOverwrite}>Overwrite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
