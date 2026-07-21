"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Shield } from "lucide-react"
import { UsageHero } from "@/components/usage/usage-hero"
import { UsageReach } from "@/components/usage/usage-reach"
import { UsageTopUsers } from "@/components/usage/usage-top-users"
import { UsageCapabilities } from "@/components/usage/usage-capabilities"
import { UsageTopEntities } from "@/components/usage/usage-top-entities"
import { HomeFooter } from "@/components/home/home-footer"
import {
  getCountryFrequencies,
  getTopEntities,
  getTopVisitors,
  getUsageCapabilities,
  getUsageSummary,
  type CountryFrequencies,
  type TopEntitiesResponse,
  type TopVisitor,
  type UsageCapabilitiesResponse,
  type UsageSummary,
} from "@/lib/api/analytics"

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [countries, setCountries] = useState<CountryFrequencies>({})
  const [topVisitors, setTopVisitors] = useState<TopVisitor[]>([])
  const [capabilities, setCapabilities] = useState<UsageCapabilitiesResponse | null>(null)
  const [entities, setEntities] = useState<TopEntitiesResponse | null>(null)
  const [loadingCore, setLoadingCore] = useState(true)
  const [loadingRollup, setLoadingRollup] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingCore(true)
      setLoadingRollup(true)
      try {
        const [summaryRes, freqRes, visitorsRes] = await Promise.all([
          getUsageSummary(),
          getCountryFrequencies(),
          getTopVisitors(5),
        ])
        if (!cancelled) {
          setSummary(summaryRes)
          setCountries(freqRes ?? {})
          setTopVisitors(visitorsRes ?? [])
        }
      } catch (err) {
        console.error("Failed to load usage summary/reach:", err)
      } finally {
        if (!cancelled) setLoadingCore(false)
      }

      try {
        const [capsRes, entitiesRes] = await Promise.all([
          getUsageCapabilities(),
          getTopEntities(),
        ])
        if (!cancelled) {
          setCapabilities(capsRes)
          setEntities(entitiesRes)
        }
      } catch (err) {
        console.error("Failed to load usage rollup sections:", err)
        if (!cancelled) {
          setCapabilities({ items: [], as_of: null })
          setEntities({
            top_assemblies: [],
            top_annotations: [],
            top_taxons: [],
            as_of: null,
          })
        }
      } finally {
        if (!cancelled) setLoadingRollup(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className="container mx-auto max-w-7xl flex-1 space-y-14 px-4 pt-8 pb-20 sm:pt-10 sm:pb-24">
        <UsageHero summary={summary} loading={loadingCore} />

        <UsageReach countryFrequencies={countries} loading={loadingCore} />

        <UsageTopUsers visitors={topVisitors} loading={loadingCore} />

        <UsageCapabilities
          items={capabilities?.items ?? []}
          loading={loadingRollup}
          empty={!loadingRollup && (capabilities?.as_of == null) && (capabilities?.items.length ?? 0) === 0}
        />

        <UsageTopEntities data={entities} loading={loadingRollup} />

        <aside className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="flex items-start gap-2 leading-relaxed">
            <Shield className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
            <span>
              Anonymous, country-level analytics from API logs. No IP addresses are stored—only
              hashed fingerprints and approximate country.
            </span>
          </p>
          <Link
            href="/privacy/"
            className="shrink-0 font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            Privacy policy
          </Link>
        </aside>
      </div>

      <HomeFooter />
    </div>
  )
}
