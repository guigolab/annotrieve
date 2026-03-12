"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tag, ChevronDown, ChevronUp } from "lucide-react"
import type { Annotation } from "@/lib/types"
import { useState } from "react"

interface FeaturesSummaryProps {
  annotation: Annotation
}

export function FeaturesSummary({ annotation }: FeaturesSummaryProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const renderValue = (value: any): string => {
    if (typeof value === 'object' && value !== null) {
      if (value.parsedValue !== undefined) {
        return value.parsedValue.toString()
      }
      if (value.source !== undefined) {
        return value.source.toString()
      }
      return value.toString()
    }
    return value?.toString() || '0'
  }

  const renderBadges = (items: Record<string, any>, section: string, maxItems: number = 8) => {
    const entries = Object.entries(items)
    const isExpanded = expandedSections[section] || false
    const displayItems = isExpanded ? entries : entries.slice(0, maxItems)
    const hasMore = entries.length > maxItems

    return (
      <div className="flex flex-wrap gap-1">
        {displayItems
          .sort(([,a], [,b]) => Number(renderValue(b)) - Number(renderValue(a)))
          .map(([key, value]) => (
            <Badge key={key} variant="secondary" className="text-xs">
              {key} ({renderValue(value)})
            </Badge>
          ))}
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-6 px-2"
            onClick={() => toggleSection(section)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                +{entries.length - maxItems} more
              </>
            )}
          </Button>
        )}
      </div>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold">Features Summary</h4>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Biotypes */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Biotypes</h5>
            <p className="text-xs text-muted-foreground mt-1">
              Biotype attribute from the 9th column (attributes) of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.biotypes && annotation.features_summary.biotypes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(expandedSections['biotypes'] 
                ? annotation.features_summary.biotypes 
                : annotation.features_summary.biotypes.slice(0, 10)
              ).map((biotype) => (
                <Badge key={biotype} variant="outline" className="text-xs">
                  {biotype}
                </Badge>
              ))}
              {annotation.features_summary.biotypes.length > 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => toggleSection('biotypes')}
                >
                  {expandedSections['biotypes'] ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{annotation.features_summary.biotypes.length - 10} more
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No biotypes available</span>
          )}
        </div>

        {/* Types */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Feature Types</h5>
            <p className="text-xs text-muted-foreground mt-1">
              Feature type from the 3rd column (type) of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.types && annotation.features_summary.types.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(expandedSections['types'] 
                ? annotation.features_summary.types 
                : annotation.features_summary.types.slice(0, 10)
              ).map((type) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
              {annotation.features_summary.types.length > 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => toggleSection('types')}
                >
                  {expandedSections['types'] ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{annotation.features_summary.types.length - 10} more
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No types available</span>
          )}
        </div>

        {/* Sources */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sources</h5>
            <p className="text-xs text-muted-foreground mt-1">
              Source from the 2nd column (source) of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.sources && annotation.features_summary.sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(expandedSections['sources'] 
                ? annotation.features_summary.sources 
                : annotation.features_summary.sources.slice(0, 10)
              ).map((source) => (
                <Badge key={source} variant="outline" className="text-xs">
                  {source}
                </Badge>
              ))}
              {annotation.features_summary.sources.length > 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => toggleSection('sources')}
                >
                  {expandedSections['sources'] ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{annotation.features_summary.sources.length - 10} more
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No sources available</span>
          )}
        </div>

        {/* Missing IDs */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Missing IDs</h5>
            <p className="text-xs text-muted-foreground mt-1">
              Feature types that are missing the ID attribute in the 9th column (attributes) of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.types_missing_id && annotation.features_summary.types_missing_id.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(expandedSections['types_missing_id'] 
                ? annotation.features_summary.types_missing_id 
                : annotation.features_summary.types_missing_id.slice(0, 10)
              ).map((type) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
              {annotation.features_summary.types_missing_id.length > 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => toggleSection('types_missing_id')}
                >
                  {expandedSections['types_missing_id'] ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{annotation.features_summary.types_missing_id.length - 10} more
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No missing IDs</span>
          )}
        </div>

        {/* Root Type Counts */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Root Type Counts</h5>
            <p className="text-xs text-muted-foreground mt-1">
              Feature types that lack of the Parent attribute in the 9th column of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.root_type_counts && Object.keys(annotation.features_summary.root_type_counts).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(() => {
                const entries = Object.entries(annotation.features_summary.root_type_counts)
                  .sort(([,a], [,b]) => Number(b) - Number(a))
                const isExpanded = expandedSections['root_type_counts'] || false
                const displayItems = isExpanded ? entries : entries.slice(0, 10)
                const hasMore = entries.length > 10

                return (
                  <>
                    {displayItems.map(([type, count]) => (
                      <Badge key={type} variant="secondary" className="text-xs">
                        {type} ({count.toLocaleString()})
                      </Badge>
                    ))}
                    {hasMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => toggleSection('root_type_counts')}
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Show Less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            +{entries.length - 10} more
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )
              })()}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No root types available</span>
          )}
        </div>

        {/* Attribute Keys */}
        <div className="space-y-3">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Attribute Keys</h5>
            <p className="text-xs text-muted-foreground mt-1">
              List of all attribute keys found in the 9th column (attributes) of the GFF file.
            </p>
          </div>
          {annotation.features_summary?.attribute_keys && annotation.features_summary.attribute_keys.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(expandedSections['attribute_keys'] 
                ? annotation.features_summary.attribute_keys 
                : annotation.features_summary.attribute_keys.slice(0, 10)
              ).map((key) => (
                <Badge key={key} variant="outline" className="text-xs font-mono">
                  {key}
                </Badge>
              ))}
              {annotation.features_summary.attribute_keys.length > 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => toggleSection('attribute_keys')}
                >
                  {expandedSections['attribute_keys'] ? (
                    <>
                      <ChevronUp className="h-3 w-3 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" />
                      +{annotation.features_summary.attribute_keys.length - 10} more
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No attribute keys available</span>
          )}
        </div>
      </div>
    </Card>
  )
}

