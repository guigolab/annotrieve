"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/ui/section-header"
import { ExternalLink, Github } from "lucide-react"
import { REGISTRY_REPO_URL } from "@/lib/community-providers"

interface CommunityRegistrySectionProps {
  title?: string
  description?: ReactNode
}

/** Homepage teaser — full contribute UX lives on /community. */
export function CommunityRegistrySection({
  title = "Community annotations",
  description,
}: CommunityRegistrySectionProps) {
  return (
    <div className="container mx-auto px-4 py-12">
      <SectionHeader
        title={title}
        description={
          description ?? (
            <>
              Browse third-party providers listed in the{" "}
              <span className="font-medium text-foreground">Annotrieve community registry</span>
              , or contribute your own eukaryotic GFF3 annotations on GitHub.
            </>
          )
        }
        icon={Github}
        iconColor="text-primary"
        iconBgColor="bg-primary/10"
        align="center"
      />
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <Button asChild size="lg" className="gap-2 rounded-xl">
          <Link href="/community">See providers</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="gap-2 rounded-xl">
          <Link href={REGISTRY_REPO_URL} target="_blank" rel="noopener noreferrer">
            <Github className="h-5 w-5" />
            View registry
            <ExternalLink className="h-4 w-4 opacity-70" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
