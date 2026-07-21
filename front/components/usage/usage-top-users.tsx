"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { TopVisitor } from "@/lib/api/analytics"

const RANK_STYLES = [
  "bg-primary/15 text-primary border-primary/30",
  "bg-secondary/15 text-secondary border-secondary/30",
  "bg-accent/15 text-accent border-accent/30",
  "bg-muted text-muted-foreground border-border/60",
  "bg-muted text-muted-foreground border-border/60",
]

interface UsageTopUsersProps {
  visitors: TopVisitor[]
  loading?: boolean
  className?: string
}

export function UsageTopUsers({ visitors, loading, className }: UsageTopUsersProps) {
  const maxVisits = Math.max(1, ...visitors.map((v) => v.visits_count))

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Most active users</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Top five anonymous users by distinct days with API activity, and the country they
          connected from.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : visitors.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
          No visitor data yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {visitors.map((visitor, index) => (
            <Card
              key={`${visitor.country}-${index}`}
              className="border-border/60 bg-card/80 shadow-sm"
            >
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      RANK_STYLES[Math.min(index, RANK_STYLES.length - 1)]
                    )}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm font-medium truncate" title={visitor.country}>
                    {visitor.country}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span>Active days</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {visitor.visits_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{
                        width: `${Math.max(8, (visitor.visits_count / maxVisits) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
