"use client"
import { X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface BetaBannerProps {
  isVisible: boolean
  onClose: () => void
}

export function BetaBanner({ isVisible, onClose }: BetaBannerProps) {
  if (!isVisible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium">
            🚀 This is a <strong>beta version</strong> of Annotrieve! We'd love to have your feedback.
          </p>
          <div className="flex gap-4 mt-2">
            <a
              href="https://github.com/emiliorighi/annotrieve/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-100 hover:text-white transition-colors flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              GitHub Issues
            </a>
            <a
              href="https://forms.gle/yQWNKVhEJwAEFYaC6"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-100 hover:text-white transition-colors flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Feedback Form
            </a>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-white hover:bg-white/20 ml-4"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
