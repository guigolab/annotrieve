"use client"

import { cn } from "@/lib/utils"
import type { UsageCapabilityItem } from "@/lib/api/analytics"

interface UsageCapabilitiesProps {
  items: UsageCapabilityItem[]
  loading?: boolean
  empty?: boolean
  className?: string
}

export function UsageCapabilities({
  items,
  loading,
  empty,
  className,
}: UsageCapabilitiesProps) {
  const maxUsers = Math.max(1, ...items.map((i) => i.unique_users))

  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">What people use</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Unique users who used each part of Annotrieve at least once. Ranked by people, not
          request volume.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : empty || items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
          Aggregates update daily after the usage job runs.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {item.unique_users.toLocaleString()}{" "}
                  <span className="text-xs">users</span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                  style={{ width: `${Math.max(4, (item.unique_users / maxUsers) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
