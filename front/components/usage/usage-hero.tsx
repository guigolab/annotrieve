"use client"

import { cn } from "@/lib/utils"
import type { UsageSummary } from "@/lib/api/analytics"

interface UsageHeroProps {
  summary: UsageSummary | null
  loading?: boolean
  className?: string
}

function formatCount(n: number | undefined): string {
  if (n == null) return "—"
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export function UsageHero({ summary, loading, className }: UsageHeroProps) {
  const metrics = [
    {
      key: "unique",
      label: "Unique users",
      value: loading ? null : summary?.unique_users,
      hint: "Clients with API activity",
    },
    {
      key: "active",
      label: "Active (30 days)",
      value: loading ? null : summary?.active_30d,
      hint: "Seen in the last 30 days",
    },
    {
      key: "countries",
      label: "Countries",
      value: loading ? null : summary?.countries,
      hint: "Approximate geo reach",
    },
  ] as const

  return (
    <section className={cn("space-y-6", className)}>
      <div className="space-y-2 max-w-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Public usage</h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Anonymous usage of Annotrieve&apos;s API — UI, CLI, and scripts. We never store IP
          addresses; counts reflect distinct clients with API activity (hashed fingerprints and
          approximate country only).
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {metrics.map(({ key, label, value, hint }) => (
          <div
            key={key}
            className="rounded-xl border border-border/60 bg-card/80 px-5 py-4 shadow-sm"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {value == null ? (
                <span className="text-muted-foreground/50">—</span>
              ) : (
                formatCount(value)
              )}
            </dd>
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </dl>

      {summary != null && summary.returning_pct > 0 ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{summary.returning_pct}%</span>{" "}
          of users returned on more than one day.
        </p>
      ) : null}
    </section>
  )
}
