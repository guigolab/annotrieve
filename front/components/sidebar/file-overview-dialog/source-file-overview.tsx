"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database } from "lucide-react"
import type { PortalAnnotation } from "@/lib/types"
import { COMMUNITY_PROVIDERS } from "@/lib/community-providers"

interface SourceFileOverviewProps {
  annotation: PortalAnnotation
}

export function SourceFileOverview({ annotation }: SourceFileOverviewProps) {
  const isCommunity =
    annotation.source_file_info?.source_database === "CommunityRegistry" ||
    annotation.source_file_info?.database === "CommunityRegistry"

  const communityProvider = isCommunity
    ? COMMUNITY_PROVIDERS.find(
        (p) => p.filterProvider === annotation.source_file_info?.provider
      )
    : undefined

  const pipelineName = annotation.source_file_info?.pipeline?.name || "Unknown"

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Database className="h-5 w-5 text-primary" />
        <h4 className="text-sm font-semibold">Source & File Overview</h4>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Information */}
        <div className="space-y-3">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source Information</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Database</span>
              <Badge variant={annotation.source_file_info?.database === "GenBank" ? "default" : "secondary"}>
                {annotation.source_file_info?.database || "Unknown"}
              </Badge>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-mono text-xs">{annotation.source_file_info?.provider || "Unknown"}</span>
            </div>
            <div className="flex justify-between py-2 border-b gap-2">
              <span className="text-muted-foreground shrink-0">Pipeline</span>
              {communityProvider ? (
                <Link
                  href={`/community?provider=${communityProvider.id}`}
                  className="font-mono text-xs text-primary underline-offset-4 hover:underline text-right truncate"
                  title={pipelineName}
                >
                  {pipelineName}
                </Link>
              ) : (
                <span className="font-mono text-xs text-right truncate" title={pipelineName}>
                  {pipelineName}
                </span>
              )}
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Release Date</span>
              <span className="text-xs">
                {annotation.source_file_info?.release_date ? 
                  new Date(annotation.source_file_info.release_date).toLocaleDateString() : 
                  "Unknown"
                }
              </span>
            </div>
          </div>
        </div>

        {/* File Information */}
        <div className="space-y-3">
          <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">File Information</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">File Size</span>
              <span className="font-mono text-xs">
                {annotation.indexed_file_info?.file_size ? 
                  `${(annotation.indexed_file_info.file_size / 1024 / 1024).toFixed(2)} MB` : 
                  "Unknown"
                }
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Index Size</span>
              <span className="font-mono text-xs">
                {annotation.indexed_file_info?.csi_path ? 
                  "CSI Index Available" : 
                  "Unknown"
                }
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Format</span>
              <span className="font-mono text-xs">GFF3 (gzipped, tabix indexed)</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Processed At</span>
              <span className="text-xs">
                {annotation.indexed_file_info?.processed_at ? 
                  new Date(annotation.indexed_file_info.processed_at).toLocaleDateString() : 
                  "Unknown"
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
