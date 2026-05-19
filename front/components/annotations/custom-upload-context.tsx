"use client"

import { createContext, useContext, type ReactNode } from "react"
import {
  useCustomUploadSession,
  type CustomUploadSessionValue,
} from "@/lib/hooks/use-custom-upload-session"
import { DuplicateCustomDialog } from "@/components/annotations/duplicate-custom-dialog"
import { JsonlImportReviewDialog } from "@/components/annotations/jsonl-import-review-dialog"

const CustomUploadContext = createContext<CustomUploadSessionValue | null>(null)

export function CustomUploadProvider({
  children,
  onFavoritesChanged,
  onAddedToFavorites,
}: {
  children: ReactNode
  onFavoritesChanged?: () => void
  onAddedToFavorites?: () => void
}) {
  const value = useCustomUploadSession(onFavoritesChanged, onAddedToFavorites)
  return (
    <CustomUploadContext.Provider value={value}>
      {children}
      <DuplicateCustomDialog
        open={value.duplicateExistingName != null}
        existingName={value.duplicateExistingName ?? ""}
        onOverwrite={value.confirmDuplicateOverwrite}
        onCancel={value.dismissDuplicateDialog}
      />
      <JsonlImportReviewDialog
        open={value.jsonlReviewOpen}
        preview={value.jsonlPreview}
        fileName={value.jsonlFileName}
        onCancel={value.dismissJsonlReview}
        onImportSkipDuplicates={() => value.commitJsonlImport("skip")}
        onImportOverwrite={() => value.commitJsonlImport("overwrite")}
      />
    </CustomUploadContext.Provider>
  )
}

export function useCustomUpload() {
  const ctx = useContext(CustomUploadContext)
  if (!ctx) {
    throw new Error("useCustomUpload must be used within CustomUploadProvider")
  }
  return ctx
}
