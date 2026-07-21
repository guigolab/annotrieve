"use client"

import Link from "next/link"
import {
  BookOpen,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Link2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  type CommunityProvider,
  doiUrl,
} from "@/lib/community-providers"
import { cn } from "@/lib/utils"

type ExternalRef = {
  key: string
  href: string
  label: string
  icon: typeof Globe
  iconClass: string
  iconBg: string
}

export function buildProviderRefs(provider: CommunityProvider): ExternalRef[] {
  const refs: ExternalRef[] = []

  if (provider.homepageUrl) {
    refs.push({
      key: "homepage",
      href: provider.homepageUrl,
      label: "Homepage",
      icon: Globe,
      iconClass: "text-sky-600 dark:text-sky-400",
      iconBg: "bg-sky-500/10",
    })
  }
  if (provider.githubUrl) {
    refs.push({
      key: "github",
      href: provider.githubUrl,
      label: "GitHub",
      icon: Github,
      iconClass: "text-foreground/80",
      iconBg: "bg-muted",
    })
  }
  if (provider.preprintUrl) {
    refs.push({
      key: "preprint",
      href: provider.preprintUrl,
      label: "Preprint",
      icon: BookOpen,
      iconClass: "text-violet-600 dark:text-violet-400",
      iconBg: "bg-violet-500/10",
    })
  }
  if (provider.doi) {
    refs.push({
      key: "doi",
      href: doiUrl(provider.doi),
      label: provider.doi,
      icon: Link2,
      iconClass: "text-indigo-600 dark:text-indigo-400",
      iconBg: "bg-indigo-500/10",
    })
  }
  if (provider.dataReadmeUrl) {
    refs.push({
      key: "readme",
      href: provider.dataReadmeUrl,
      label: "Data README",
      icon: FileText,
      iconClass: "text-teal-600 dark:text-teal-400",
      iconBg: "bg-teal-500/10",
    })
  }

  return refs
}

interface ProviderDetailsDialogProps {
  provider: CommunityProvider
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProviderDetailsDialog({
  provider,
  open,
  onOpenChange,
}: ProviderDetailsDialogProps) {
  const refs = buildProviderRefs(provider)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{provider.projectDisplayName}</DialogTitle>
          <DialogDescription>{provider.providerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            {provider.description}
          </p>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Pipeline
            </p>
            <p className="text-foreground">
              {provider.pipelineMethod}
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono tabular-nums">v{provider.pipelineVersion}</span>
            </p>
          </div>

          {refs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Links
              </p>
              {(provider.doi || provider.preprintUrl) ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  To cite this dataset, use the DOI or preprint link below.
                </p>
              ) : null}
              <ul className="space-y-1.5">
                {refs.map(({ key, href, label, icon: Icon, iconClass, iconBg }) => (
                  <li key={key}>
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5",
                        "transition-colors hover:border-primary/40 hover:bg-primary/5",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                          iconBg
                        )}
                      >
                        <Icon className={cn("h-4 w-4", iconClass)} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {label}
                      </span>
                      <ExternalLink
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
