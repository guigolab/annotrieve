"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui"
import { RightSidebar } from "@/components/sidebar/right-sidebar"
import { CompareSubsetSelector } from "@/components/annotations-compare/compare-subset-selector"
import { GeneComparisonChart } from "@/components/annotations-compare/gene-comparison-chart"
import { TranscriptComparisonChart } from "@/components/annotations-compare/transcript-comparison-chart"
import { SubsetSummaryCards } from "@/components/annotations-compare/subset-summary-cards"

export default function AnnotationsComparePage() {
  const router = useRouter()
  const [selectedSubsetIds, setSelectedSubsetIds] = useState<string[]>([])

  const handleBack = () => {
    router.push("/annotations")
  }

  return (
    <>
      <RightSidebar />
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Header */}
        <header className="px-6 pt-6 pb-4 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/75 backdrop-blur flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to annotations
                </Button>
              </div>
              <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-accent" />
                Compare Filter Sets
              </h1>
              <p className="text-sm text-muted-foreground">
                Compare gene and transcript statistics across different filter sets using boxplots. Select up to 5 filter sets to compare.
              </p>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar - Subset Selector */}
          <div className="w-64 flex-shrink-0 border-r border-border">
            <CompareSubsetSelector
              selectedSubsetIds={selectedSubsetIds}
              onSelectionChange={setSelectedSubsetIds}
            />
          </div>

          {/* Right Main Content - Comparison Charts */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-background">
            <div className="p-4 space-y-4">
              {/* Summary Cards */}
              <div
                className={selectedSubsetIds.length > 0 
                  ? "transition-all duration-300 ease-in-out opacity-100 max-h-[1000px] overflow-hidden"
                  : "transition-all duration-300 ease-in-out opacity-0 max-h-0 overflow-hidden"
                }
              >
                {selectedSubsetIds.length > 0 && (
                  <SubsetSummaryCards selectedSubsetIds={selectedSubsetIds} />
                )}
              </div>

              {/* Gene Comparison */}
              <Card className="p-4">
                <GeneComparisonChart selectedSubsetIds={selectedSubsetIds} />
              </Card>

              {/* Transcript Comparison */}
              <Card className="p-4">
                <TranscriptComparisonChart selectedSubsetIds={selectedSubsetIds} />
              </Card>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

