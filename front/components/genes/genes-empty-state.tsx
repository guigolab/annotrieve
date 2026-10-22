"use client"

import { Dna } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EXAMPLE_GENE_SETS } from "@/lib/genes/ui"

interface GenesEmptyStateProps {
  onExample: (names: string[]) => void
}

export function GenesEmptyState({ onExample }: GenesEmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-dashed bg-muted/20 px-6 py-10 text-center space-y-5">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Dna className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            Define a gene set
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Enter exact gene names, or a prefix ending in{" "}
            <span className="font-mono">*</span>, then press Search. Scope by
            taxa if you want, then explore annotations that contain your set.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_GENE_SETS.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full text-xs"
              onClick={() => onExample(example.names)}
            >
              {example.label}
              <span className="ml-1.5 font-mono text-muted-foreground">
                {example.names.join(", ")}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
