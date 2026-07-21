"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  ListChecks,
  Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ProviderDetailsDialog } from "@/components/community/provider-details-dialog"
import {
  type CommunityProvider,
  type CommunityProviderStatus,
} from "@/lib/community-providers"
import { buildAnnotationsListUrl } from "@/lib/annotations-url"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<CommunityProviderStatus, string> = {
  listed: "Listed",
  import_pending: "Import pending",
  available: "Available",
}

const STATUS_ICON: Record<CommunityProviderStatus, typeof Clock> = {
  listed: ListChecks,
  import_pending: Clock,
  available: CheckCircle2,
}

const STATUS_BADGE_CLASS: Record<CommunityProviderStatus, string> = {
  listed: "border-border/70 bg-muted/60 text-muted-foreground",
  import_pending: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  available: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
}

interface ProviderCardProps {
  provider: CommunityProvider
  /** null while frequencies are loading */
  annotationCount: number | null
  className?: string
  /** Open the details dialog on mount (e.g. deep link from annotation overview) */
  autoOpenDetails?: boolean
  /** Visually emphasize this card (e.g. deep-link target) */
  highlighted?: boolean
}

export function ProviderCard({
  provider,
  annotationCount,
  className,
  autoOpenDetails = false,
  highlighted = false,
}: ProviderCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const StatusIcon = STATUS_ICON[provider.status]
  const isPending = provider.status === "import_pending"
  const canBrowse = provider.status === "available" && annotationCount != null && annotationCount > 0
  const browseHref = buildAnnotationsListUrl({ providers: [provider.filterProvider] })

  useEffect(() => {
    if (autoOpenDetails) {
      setDetailsOpen(true)
    }
  }, [autoOpenDetails])

  return (
    <>
      <Card
        id={`provider-${provider.id}`}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden border-border/60 bg-card/80 backdrop-blur-sm shadow-sm hover:shadow-md hover:border-primary/40 transition-all duration-300 scroll-mt-24",
          highlighted && "ring-2 ring-primary/50 border-primary/40",
          className
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "inline-flex items-center gap-1 font-medium text-[11px] px-2 py-0",
                STATUS_BADGE_CLASS[provider.status]
              )}
            >
              <StatusIcon className="h-3 w-3" aria-hidden />
              {STATUS_LABEL[provider.status]}
            </Badge>
          </div>

          {/* Hero metric */}
          <div className="space-y-0.5">
            {annotationCount === null ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <span className="text-sm">Loading…</span>
              </div>
            ) : isPending ? (
              <>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-muted-foreground/50">
                  —
                </p>
                <p className="text-xs text-muted-foreground">Not imported yet</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {annotationCount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  annotation{annotationCount === 1 ? "" : "s"}
                </p>
              </>
            )}
          </div>

          {/* Identity */}
          <div className="space-y-1 min-w-0">
            <h3 className="text-base font-semibold leading-snug tracking-tight line-clamp-2 group-hover:text-primary transition-colors duration-300">
              {provider.projectDisplayName}
            </h3>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{provider.providerName}</span>
            </p>
          </div>

          {/* Footer actions */}
          <div className="mt-auto space-y-2 border-t border-border/40 pt-3">
            {canBrowse ? (
              <Button asChild size="sm" className="w-full gap-1.5 rounded-lg">
                <Link href={browseHref}>
                  Browse annotations
                  <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={canBrowse ? "outline" : "default"}
              className="w-full gap-1.5 rounded-lg"
              onClick={() => setDetailsOpen(true)}
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
              Details
            </Button>
          </div>
        </CardContent>

        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Card>

      <ProviderDetailsDialog
        provider={provider}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </>
  )
}
