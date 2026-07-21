"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BookOpen, ExternalLink, Users } from "lucide-react"
import { ProviderCard } from "@/components/community/provider-card"
import { HomeFooter } from "@/components/home/home-footer"
import { Button } from "@/components/ui/button"
import { getAnnotationsFrequencies } from "@/lib/api/annotations"
import {
  COMMUNITY_PROVIDERS,
  CONTRIBUTING_URL,
  REGISTRY_REPO_URL,
} from "@/lib/community-providers"

function CommunityPageContent() {
  const searchParams = useSearchParams()
  const highlightProviderId = searchParams?.get("provider") ?? null

  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const frequencies = await getAnnotationsFrequencies("provider")
        if (!cancelled) setCounts(frequencies ?? {})
      } catch (err) {
        console.error("Failed to load provider frequencies:", err)
        if (!cancelled) setCounts({})
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!highlightProviderId) return
    const el = document.getElementById(`provider-${highlightProviderId}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [highlightProviderId])

  const totalImported = useMemo(() => {
    if (counts === null) return null
    return COMMUNITY_PROVIDERS.reduce(
      (sum, p) => sum + (counts[p.filterProvider] ?? 0),
      0
    )
  }, [counts])

  const providerCount = COMMUNITY_PROVIDERS.length

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="container mx-auto max-w-7xl flex-1 px-4 pt-8 pb-20 sm:pt-10 sm:pb-24">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Community providers
              </h1>
            </div>
            <p className="max-w-2xl text-sm sm:text-base text-muted-foreground leading-relaxed">
              Third-party eukaryotic GFF3 projects listed in the{" "}
              <Link
                href={REGISTRY_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                community registry
              </Link>
              . Counts reflect annotations imported into Annotrieve.
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {providerCount} provider{providerCount === 1 ? "" : "s"}
              {totalImported === null ? null : (
                <>
                  {" · "}
                  {totalImported.toLocaleString()} annotation
                  {totalImported === 1 ? "" : "s"} imported
                </>
              )}
            </p>
          </div>

          <div className="shrink-0">
            <Button asChild className="gap-1.5 rounded-xl">
              <Link href={CONTRIBUTING_URL} target="_blank" rel="noopener noreferrer">
                <BookOpen className="h-4 w-4" aria-hidden />
                Contribute your project
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </Link>
            </Button>
          </div>
        </header>

        <section aria-labelledby="providers-heading">
          <h2 id="providers-heading" className="sr-only">
            Provider directory
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {COMMUNITY_PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                annotationCount={
                  counts === null ? null : (counts[provider.filterProvider] ?? 0)
                }
                highlighted={highlightProviderId === provider.id}
                autoOpenDetails={highlightProviderId === provider.id}
              />
            ))}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Don&apos;t see your project?{" "}
            <Link
              href={CONTRIBUTING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Contribute it on GitHub
              <ExternalLink className="ml-1 inline h-3 w-3 opacity-70 align-[-0.1em]" aria-hidden />
            </Link>
          </p>
        </section>
      </div>

      <HomeFooter />
    </div>
  )
}

export default function CommunityPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">Loading community providers…</p>
        </div>
      }
    >
      <CommunityPageContent />
    </Suspense>
  )
}
