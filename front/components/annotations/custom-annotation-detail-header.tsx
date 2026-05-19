"use client"

import type { CustomAnnotation } from "@/lib/types"

function formatFileSize(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`
}

function formatUploadedDate(iso: string): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface CustomAnnotationDetailHeaderProps {
  annotation: CustomAnnotation
}

export function CustomAnnotationDetailHeader({ annotation }: CustomAnnotationDetailHeaderProps) {
  return (
    <div className="flex flex-col flex-shrink-0 px-4 pb-4 pt-0 space-y-3 border-t border-border/50">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Annotation name
        </span>
        <span
          className="text-base font-semibold text-foreground truncate"
          title={annotation.custom_name}
        >
          {annotation.custom_name}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            File size
          </span>
          <span className="text-sm text-foreground font-medium">
            {formatFileSize(annotation.uploaded_file_size)}
          </span>
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Uploaded
          </span>
          <span className="text-sm text-foreground font-medium">
            {formatUploadedDate(annotation.uploaded_at)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          MD5 checksum
        </span>
        <span
          className="text-xs font-mono text-muted-foreground truncate"
          title={annotation.uploaded_md5}
        >
          {annotation.uploaded_md5}
        </span>
      </div>
    </div>
  )
}