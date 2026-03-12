"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {  Search, Loader2, CheckCircle2, XCircle, Dna, ChevronRight, ArrowRight, ArrowLeft, Database, FileText } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { listTaxons, getTaxonAncestors } from "@/lib/api/taxons"
import type { TaxonRecord } from "@/lib/api/types"
import { buildEntityDetailsUrl } from "@/lib/utils"

interface INSDCSearchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
}

type DatabaseType = "NCBI" | "ENA" | "DDBJ"
type FieldType = "assembly_accession" | "scientific_name" | "taxid"
type SearchStatus = "idle" | "searching" | "success" | "error"

interface DatabaseSearchResult {
  database: DatabaseType
  status: SearchStatus
  url?: string
  error?: string
}

interface TaxonomyResult {
  taxId: string
  scientificName: string
  commonName?: string
  rank?: string
  lineage?: string
  lineageArray?: string[] // For traversal
  database: DatabaseType
}

type Step = "form" | "results" | "organisms"

export function INSDCSearchModal({ open, onOpenChange, initialQuery = "" }: INSDCSearchModalProps) {
  const router = useRouter()
  
  const [step, setStep] = useState<Step>("form")
  const [query, setQuery] = useState(initialQuery)
  const [fieldType, setFieldType] = useState<FieldType>("scientific_name")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<DatabaseSearchResult[]>([])
  const [taxonomyResults, setTaxonomyResults] = useState<TaxonomyResult[]>([])
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<TaxonomyResult | null>(null)
  const selectedTaxonomyRef = useRef<TaxonomyResult | null>(null)
  const [isMatching, setIsMatching] = useState(false)
  const [matchedTaxon, setMatchedTaxon] = useState<TaxonRecord | null>(null)
  const [ancestors, setAncestors] = useState<TaxonRecord[]>([])
  const [lastSearchedQuery, setLastSearchedQuery] = useState("")
  const [cooldownTime, setCooldownTime] = useState(0)
  
  // Keep ref in sync with state
  useEffect(() => {
    selectedTaxonomyRef.current = selectedTaxonomy
  }, [selectedTaxonomy])

  // Update query and reset when new initialQuery comes in
  useEffect(() => {
    if (initialQuery && initialQuery.trim() && initialQuery.trim() !== query.trim()) {
      // New search from search bar - reset everything
      setStep("form")
      setQuery(initialQuery)
      setSearchResults([])
      setTaxonomyResults([])
      setSelectedTaxonomy(null)
      selectedTaxonomyRef.current = null
      setMatchedTaxon(null)
      setAncestors([])
      setIsMatching(false)
      setCooldownTime(0)
      setLastSearchedQuery("")
    }
  }, [initialQuery])

  // Cooldown timer
  useEffect(() => {
    if (cooldownTime > 0) {
      const timer = setTimeout(() => {
        setCooldownTime(cooldownTime - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldownTime])

  // Clear results when user manually changes query in the form
  useEffect(() => {
    if (query.trim() !== lastSearchedQuery.trim()) {
      setSearchResults([])
      setTaxonomyResults([])
      setSelectedTaxonomy(null)
      selectedTaxonomyRef.current = null
    }
  }, [query, lastSearchedQuery])

  const buildApiUrl = (database: DatabaseType, fieldType: FieldType, query: string): string => {
    switch (database) {
      case "NCBI":
        // NCBI API works for both scientific_name and taxid
        return `https://api.ncbi.nlm.nih.gov/datasets/v2/taxonomy/taxon/${encodeURIComponent(query)}`
      
      case "ENA":
        if (fieldType === "scientific_name") {
          return `https://www.ebi.ac.uk/ena/taxonomy/rest/scientific-name/${encodeURIComponent(query)}`
        } else if (fieldType === "taxid") {
          return `https://www.ebi.ac.uk/ena/taxonomy/rest/tax-id/${encodeURIComponent(query)}`
        }
        break
      
      case "DDBJ":
        // DDBJ doesn't have a public REST API for taxonomy lookup
        return ""
    }
    return ""
  }

  const fetchFromDatabase = async (database: DatabaseType, fieldType: FieldType, query: string): Promise<{ success: boolean; results?: TaxonomyResult[]; url?: string }> => {
    const apiUrl = buildApiUrl(database, fieldType, query)
    
    if (!apiUrl) {
      return { success: false }
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        return { success: false }
      }

      const data = await response.json()
      
      const results: TaxonomyResult[] = []
      
      // Parse NCBI response
      if (database === "NCBI") {
        if (data?.taxonomy_nodes && data.taxonomy_nodes.length > 0) {
          for (const node of data.taxonomy_nodes) {
            if (node.taxonomy && !node.error) {
              const tax = node.taxonomy
              // NCBI returns lineage as array of taxids
              let lineageStr = undefined
              let lineageArr = undefined
              
              if (tax.blast_name) {
                lineageStr = tax.blast_name
              }
              
              if (tax.lineage && Array.isArray(tax.lineage)) {
                // Store lineage taxids for traversal (reverse order: most specific to root)
                lineageArr = [...tax.lineage].reverse().map(String)
              }
              
              results.push({
                taxId: String(tax.tax_id || ''),
                scientificName: tax.organism_name || tax.scientific_name || '',
                commonName: tax.common_name || undefined,
                rank: tax.rank || undefined,
                lineage: lineageStr,
                lineageArray: lineageArr,
                database: "NCBI"
              })
            }
          }
        }
      } 
      // Parse ENA response
      else if (database === "ENA") {
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item?.taxId) {
            // ENA returns lineage as string, we need to extract it differently
            const lineageStr = item.lineage
            
            results.push({
              taxId: String(item.taxId),
              scientificName: item.scientificName || '',
              commonName: item.commonName || undefined,
              rank: item.rank || undefined,
              lineage: lineageStr,
              lineageArray: undefined, // ENA doesn't provide taxid array
              database: "ENA"
            })
          }
        }
      }
      
      return results.length > 0 ? { success: true, results, url: apiUrl } : { success: false }
    } catch (error) {
      console.error(`Error fetching from ${database}:`, error)
      return { success: false }
    }
  }

  const handleSearch = async () => {
    if (!query.trim() || isSearching) return

    setIsSearching(true)
    setLastSearchedQuery(query)
    setCooldownTime(3)
    setTaxonomyResults([]) // Clear previous results
    setSelectedTaxonomy(null) // Clear selection
    selectedTaxonomyRef.current = null // Clear ref
    setStep("results") // Move to results step

    // Only search NCBI and ENA (DDBJ doesn't have public API)
    const databasesToSearch: DatabaseType[] = ["NCBI", "ENA"]

    const searchStatusResults: DatabaseSearchResult[] = []
    const allTaxonomyResults: TaxonomyResult[] = []

    // Search through databases, stop after first success
    for (const database of databasesToSearch) {
      // Add database to results with searching status
      const currentResult: DatabaseSearchResult = {
        database,
        status: "searching"
      }
      searchStatusResults.push(currentResult)
      setSearchResults([...searchStatusResults])

      try {
        // Fetch data from the API
        const result = await fetchFromDatabase(database, fieldType, query.trim())
        
        if (result.success && result.results && result.results.length > 0) {
          currentResult.status = "success"
          currentResult.url = result.url
          setSearchResults([...searchStatusResults])
          
          // Add taxonomy results
          allTaxonomyResults.push(...result.results)
          setTaxonomyResults([...allTaxonomyResults])
          
          // Stop searching after first successful result
          break
        } else {
          currentResult.status = "error"
          currentResult.error = "Not found"
          setSearchResults([...searchStatusResults])
        }
      } catch (error) {
        currentResult.status = "error"
        currentResult.error = "Failed to connect"
        setSearchResults([...searchStatusResults])
      }
    }

    setIsSearching(false)
  }

  const handleSelectTaxonomy = (taxonomy: TaxonomyResult) => {
    setSelectedTaxonomy(taxonomy)
    selectedTaxonomyRef.current = taxonomy
  }

  const handleFindClosestOrganism = async () => {
    // Use ref to get the latest selectedTaxonomy to avoid stale closures
    const taxonomy = selectedTaxonomyRef.current
    if (!taxonomy) {
      console.warn("No taxonomy selected")
      return
    }

    setIsMatching(true)
    setStep("organisms") // Go directly to organisms step
    
    // Clear previous results
    setMatchedTaxon(null)
    setAncestors([])

    let foundTaxon: TaxonRecord | null = null

    // First try the exact taxid
    try {
      const exactMatch = await listTaxons({ taxids: taxonomy.taxId })
      if (exactMatch.results && exactMatch.results.length > 0) {
        foundTaxon = exactMatch.results[0]
      }
    } catch (error) {
      console.log("Exact taxid not found, trying lineage...")
    }

    // If no exact match, traverse the lineage
    if (!foundTaxon && taxonomy.lineageArray && taxonomy.lineageArray.length > 0) {
      for (const ancestorTaxId of taxonomy.lineageArray) {
        try {
          const ancestorMatch = await listTaxons({ taxids: ancestorTaxId })
          if (ancestorMatch.results && ancestorMatch.results.length > 0) {
            foundTaxon = ancestorMatch.results[0]
            console.log(`Found match in lineage: ${ancestorTaxId}`)
            break
          }
        } catch (error) {
          console.error("Failed to fetch ancestor:", error)
          // Continue to next ancestor
          continue
        }
      }
    }

    // If we found a matching taxon, fetch ancestors
    if (foundTaxon) {
      setMatchedTaxon(foundTaxon)
      
      try {
        const ancestorsResponse = await getTaxonAncestors(String(foundTaxon.taxid))
        // Ancestors are typically returned from root to leaf, so reverse to show from leaf to root
        setAncestors((ancestorsResponse.results || []))
      } catch (error) {
        console.error("Failed to fetch ancestors:", error)
        setAncestors([])
      }
    } else {
      // No match found
      setMatchedTaxon(null)
      setAncestors([])
    }

    setIsMatching(false)
  }

  const handleSelectAncestor = (taxon: TaxonRecord) => {
    router.push(buildEntityDetailsUrl("taxon", String(taxon.taxid)))
    handleClose()
  }

  const handleViewTaxonDetails = () => {
    if (matchedTaxon) {
      router.push(buildEntityDetailsUrl("taxon", String(matchedTaxon.taxid)))
      handleClose()
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Keep state when closing - only reset when new initialQuery comes in
  }

  const handleDialogChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true)
    } else {
      handleClose()
    }
  }

  const handleReset = () => {
    setStep("form")
    setQuery("")
    setSearchResults([])
    setTaxonomyResults([])
    setSelectedTaxonomy(null)
    selectedTaxonomyRef.current = null
    setMatchedTaxon(null)
    setAncestors([])
    setIsMatching(false)
    setCooldownTime(0)
    setLastSearchedQuery("")
  }

  const handleBack = () => {
    if (step === "organisms") {
      setStep("results")
      setMatchedTaxon(null)
      setAncestors([])
      setIsMatching(false) // Reset matching state when going back
    } else if (step === "results") {
      setStep("form")
      setSelectedTaxonomy(null)
      selectedTaxonomyRef.current = null
    }
  }

  const getStatusIcon = (status: SearchStatus) => {
    switch (status) {
      case "searching":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = (status: SearchStatus) => {
    switch (status) {
      case "searching":
        return "Searching..."
      case "success":
        return "Found!"
      case "error":
        return "Not found"
      default:
        return ""
    }
  }

  const isButtonDisabled = !query.trim() || isSearching || cooldownTime > 0 || (lastSearchedQuery === query && searchResults.length > 0)


  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <div className="flex flex-col h-full max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Search className="h-5 w-5" />
                  Search INSDC Databases
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Find taxonomy records in external databases
                </DialogDescription>
              </div>
              {(step === "results" || step === "organisms") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="text-xs"
                >
                  New Search
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
          {/* Step Indicator */}
          <div className="px-6 py-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  step === "form" ? "bg-primary text-primary-foreground" : step === "results" || step === "organisms" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  1
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${step === "form" ? "text-foreground" : "text-muted-foreground"}`}>
                  Search
                </span>
              </div>
              <div className={`h-px flex-1 mx-2 ${step === "results" || step === "organisms" ? "bg-primary" : "bg-border"}`} />
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  step === "results" ? "bg-primary text-primary-foreground" : step === "organisms" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  2
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${step === "results" ? "text-foreground" : "text-muted-foreground"}`}>
                  Select
                </span>
              </div>
              <div className={`h-px flex-1 mx-2 ${step === "organisms" ? "bg-primary" : "bg-border"}`} />
              <div className="flex items-center gap-2">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  step === "organisms" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  3
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${step === "organisms" ? "text-foreground" : "text-muted-foreground"}`}>
                  Organisms
                </span>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="px-6 py-6">
            {/* Step 1: Search Form */}
            {step === "form" && (
            <div className="space-y-6">
              {/* Search Query Input */}
              <div className="space-y-2">
                <Label htmlFor="search-query" className="text-sm font-semibold">Search Query</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search-query"
                    placeholder="Enter scientific name or taxonomy ID..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10 h-10"
                    disabled={isSearching}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isButtonDisabled) {
                        handleSearch()
                      }
                    }}
                  />
                </div>
              </div>

              {/* Field Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="field-type-select" className="text-sm font-semibold">Search By</Label>
                <Select 
                  value={fieldType} 
                  onValueChange={(value: FieldType) => setFieldType(value)}
                  disabled={isSearching}
                >
                  <SelectTrigger id="field-type-select" className="h-10">
                    <SelectValue placeholder="Select field type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scientific_name">Scientific Name</SelectItem>
                    <SelectItem value="taxid">Taxonomy ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Info Message */}
              <div className="text-xs text-muted-foreground bg-muted/50 p-4 rounded-md">
                <p className="font-semibold mb-2">How it works:</p>
                <ul className="list-disc list-inside space-y-1.5">
                  <li>Enter a scientific name or taxonomy ID</li>
                  <li>We'll search NCBI and ENA databases</li>
                  <li>Select a result to find similar organisms in our database</li>
                  <li>Navigate through the lineage to find the closest match</li>
                </ul>
              </div>
            </div>
            )}

            {/* Step 2: Search Results & Selection */}
            {step === "results" && (
            <div className="space-y-6">
          {/* Search Progress */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label>Search Progress</Label>
              <div className="space-y-2 bg-muted/30 p-3 rounded-md">
                {searchResults.map((result, index) => (
                  <div 
                    key={result.database} 
                    className="flex items-center justify-between p-2 bg-background rounded border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="font-medium text-sm">{result.database}</span>
                    </div>
                    <span className={`text-xs ${
                      result.status === "success" ? "text-green-600" :
                      result.status === "error" ? "text-red-600" :
                      "text-blue-600"
                    }`}>
                      {getStatusText(result.status)}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Show error message if all searches failed */}
              {searchResults.length > 0 && 
               searchResults.every(r => r.status === "error") && 
               !isSearching && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    No results found in any database. Please check your search term and try again.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Taxonomy Results */}
          {taxonomyResults.length > 0 && !isSearching && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Found {taxonomyResults.length} Result{taxonomyResults.length !== 1 ? 's' : ''}</Label>
                {selectedTaxonomy && (
                  <Badge variant="secondary" className="text-xs">
                    1 Selected
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {taxonomyResults.map((taxonomy, index) => (
                  <Card
                    key={`${taxonomy.database}-${taxonomy.taxId}-${index}`}
                    className={`p-4 transition-all cursor-pointer group bg-background ${
                      selectedTaxonomy?.taxId === taxonomy.taxId && selectedTaxonomy?.database === taxonomy.database
                        ? "border-primary shadow-md"
                        : "hover:shadow-md hover:border-primary/50"
                    }`}
                    onClick={() => handleSelectTaxonomy(taxonomy)}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Dna className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {taxonomy.scientificName}
                          </h4>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {taxonomy.database}
                        </Badge>
                      </div>

                      {/* Info */}
                      <div className="space-y-1.5 text-xs">
                        {taxonomy.commonName && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Common Name:</span>
                            <span className="font-medium text-foreground">{taxonomy.commonName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Taxonomy ID:</span>
                          <span className="font-mono font-medium text-foreground">{taxonomy.taxId}</span>
                        </div>
                        {taxonomy.rank && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Rank:</span>
                            <span className="font-medium text-foreground capitalize">{taxonomy.rank.toLowerCase()}</span>
                          </div>
                        )}
                        {taxonomy.lineage && (
                          <div className="mt-2 pt-2 border-t border-border/50">
                            <p className="text-muted-foreground mb-1">Lineage:</p>
                            <p className="text-foreground/80 text-xs leading-relaxed line-clamp-2" title={taxonomy.lineage}>
                              {taxonomy.lineage}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Selection indicator */}
                      {selectedTaxonomy?.taxId === taxonomy.taxId && selectedTaxonomy?.database === taxonomy.database && (
                        <div className="flex items-center gap-1 text-xs text-primary font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Selected</span>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

            </div>
          )}

          {/* Step 3: Show Matched Taxon and Organisms */}
          {step === "organisms" && (
            <div className="space-y-6">
              {/* Loading State */}
              {isMatching && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="relative">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-pulse" />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-semibold text-foreground">Finding Closest Match</p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Searching through taxonomy lineage to find a match in our database...
                    </p>
                  </div>
                </div>
              )}
              {/* Ancestor Breadcrumbs */}
              {!isMatching && matchedTaxon && ancestors.length > 0 && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
                  <Label className="text-sm font-semibold">Taxonomic Lineage</Label>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {ancestors.map((ancestor, index) => (
                      <div key={ancestor.taxid} className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSelectAncestor(ancestor)}
                          className="px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors hover:underline"
                        >
                          {ancestor.scientific_name || `TaxID ${ancestor.taxid}`}
                        </button>
                        {index < ancestors.length - 1 && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                    {/* Add the matched taxon at the end */}
                    <div className="flex items-center gap-1.5">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      <span className="px-2 py-1 rounded-md text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20">
                        {matchedTaxon.scientific_name || `TaxID ${matchedTaxon.taxid}`}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {/* Matched Taxon Info */}
              {!isMatching && matchedTaxon && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <Label className="text-sm font-semibold">Matched Taxonomy Node</Label>
                  <Card 
                    className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 cursor-pointer hover:shadow-md transition-all group hover:border-green-300 dark:hover:border-green-700"
                    onClick={handleViewTaxonDetails}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <h4 className="font-semibold text-foreground">
                          {matchedTaxon.scientific_name}
                        </h4>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Taxonomy ID:</span>
                          <span className="font-mono font-medium text-foreground">{matchedTaxon.taxid}</span>
                        </div>
                        {matchedTaxon.rank && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Rank:</span>
                            <span className="font-medium text-foreground capitalize">{matchedTaxon.rank.toLowerCase()}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Counts with icons matching taxon-card.tsx */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs items-center pt-1">
                        {matchedTaxon.organisms_count !== undefined && matchedTaxon.organisms_count > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap" title={`Organisms: ${matchedTaxon.organisms_count}`}>
                            <Dna className="w-3 h-3 text-green-500" />
                            <span className="font-semibold text-foreground">{matchedTaxon.organisms_count.toLocaleString()}</span>
                          </div>
                        )}
                        {matchedTaxon.assemblies_count !== undefined && matchedTaxon.assemblies_count > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap" title={`Assemblies: ${matchedTaxon.assemblies_count}`}>
                            <Database className="w-3 h-3 text-purple-500" />
                            <span className="font-semibold text-foreground">{matchedTaxon.assemblies_count.toLocaleString()}</span>
                          </div>
                        )}
                        {matchedTaxon.annotations_count !== undefined && matchedTaxon.annotations_count > 0 && (
                          <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap" title={`Annotations: ${matchedTaxon.annotations_count}`}>
                            <FileText className="w-3 h-3 text-blue-500" />
                            <span className="font-semibold text-foreground">{matchedTaxon.annotations_count.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              )}



              {/* No match found in lineage */}
              {!isMatching && !matchedTaxon && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md animate-in fade-in duration-500">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                    No Match Found
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Could not find this taxonomy node or any of its ancestors in our database. 
                    Please try a different search term or a more general taxonomic level.
                  </p>
                </div>
              )}

            </div>
          )}
          </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t bg-background">
          {step === "form" && (
            <div className="flex gap-3">
              <Button
                onClick={handleSearch}
                disabled={isButtonDisabled}
                className="flex-1 gap-2"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching...
                  </>
                ) : cooldownTime > 0 ? (
                  <>Wait {cooldownTime}s</>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Search INSDC
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isSearching}
              >
                Cancel
              </Button>
            </div>
          )}

          {step === "results" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              {selectedTaxonomy ? (
                <Button
                  onClick={handleFindClosestOrganism}
                  disabled={isMatching}
                  className="flex-1 gap-2"
                >
                  {isMatching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    <>
                      Find cloreser taxon
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                >
                  Close
                </Button>
              )}
            </div>
          )}

          {step === "organisms" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleBack}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}


