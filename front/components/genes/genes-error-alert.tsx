"use client"

import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

interface GenesErrorAlertProps {
  message: string
  onRetry?: () => void
}

export function GenesErrorAlert({ message, onRetry }: GenesErrorAlertProps) {
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm shrink-0"
    >
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">Search failed</div>
        <div className="text-muted-foreground">{message}</div>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  )
}
