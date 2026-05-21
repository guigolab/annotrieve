"use client"

import { Suspense, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TaxonDetailsView } from "@/components/entity-details/taxon-details-view"
import { AssemblyDetailsView } from "@/components/entity-details/assembly-details-view"
import { LoadingSpinner } from "@/components/ui/loading"

function AnnotationsDetailsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const taxonId = searchParams?.get("taxon")
  const assemblyId = searchParams?.get("assembly")

  const activeView = useMemo<"taxon" | "assembly" | null>(() => {
    if (taxonId) {
      return "taxon"
    }
    if (assemblyId) {
      return "assembly"
    }
    return null
  }, [taxonId, assemblyId])

  const handleBack = () => {
    router.push("/annotations")
  }

  return (
    <div className="min-h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-4">
        <header>
          <h1 className="sr-only">Annotation details</h1>
        </header>

        {activeView === "taxon" && taxonId && (
          <TaxonDetailsView taxid={taxonId} onClose={handleBack} />
        )}

        {activeView === "assembly" && assemblyId && (
          <AssemblyDetailsView accession={assemblyId} onClose={handleBack} />
        )}

        {!activeView && (
          <Card className="p-8 text-center space-y-4">
            <p className="text-lg font-semibold text-foreground">
              Select an entity to view its details
            </p>
            <p className="text-sm text-muted-foreground">
              Provide a <code>?taxon=</code> or <code>?assembly=</code> query parameter to load a
              taxon or assembly details page.
            </p>
            <Button onClick={handleBack} variant="outline" className="mx-auto">
              Go back to annotations
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function AnnotationsDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-6 min-h-[50vh]">
          <LoadingSpinner />
        </div>
      }
    >
      <AnnotationsDetailsContent />
    </Suspense>
  )
}
