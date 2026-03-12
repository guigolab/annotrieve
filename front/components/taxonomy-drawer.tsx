"use client"

import {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react"
import { useRouter } from "next/navigation"
import {
  X,
  ExternalLink,
  Dna,
  Database,
  FileText,
  PinOff,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getTaxon, getTaxonAncestors } from "@/lib/api/taxons"
import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import { buildEntityDetailsUrl } from "@/lib/utils"
import { WikiSummary } from "@/components/wiki-summary"
import type { TaxonRecord } from "@/lib/api/types"
import {
  FEATURE_COLORS,
  FEATURE_LABELS,
  TAXONOMY_ICON_BTN,
  TAXONOMY_LINK_MUTED,
  type FeatureType,
  type TaxonomyPayload,
} from "@/components/taxonomy/taxonomy-types"
import { cn } from "@/lib/utils"

const MIN_W = 240
const MAX_W = 420
const DEFAULT_W = 300

const GENE_FEATURES: FeatureType[] = ["coding", "non_coding", "pseudogene"]
const CELLULAR_TAXID = "131567"

interface TaxonomyDrawerProps {
  open: boolean
  taxon: TaxonomyPayload
  pinnedNode: TaxonomyPayload | null
  onClose: () => void
  onUnpin: () => void
  onSelectSubgroup: (taxid: string) => void
}

export function TaxonomyDrawer({
  open,
  taxon,
  pinnedNode,
  onClose,
  onUnpin,
  onSelectSubgroup,
}: TaxonomyDrawerProps) {
  const router = useRouter()
  const setSelectedTaxons = useAnnotationsFiltersStore((s) => s.setSelectedTaxons)

  const [details, setDetails] = useState<TaxonRecord | null>(null)
  const [ancestors, setAncestors] = useState<TaxonRecord[]>([])
  const [loading, setLoading] = useState(false)

  const [width, setWidth] = useState(DEFAULT_W)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, width: DEFAULT_W })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setDetails(null)
    Promise.all([getTaxon(taxon.taxid), getTaxonAncestors(taxon.taxid)])
      .then(([det, anc]) => {
        if (cancelled) return
        setDetails(det)
        setAncestors(
          (anc.results ?? []).filter(
            (a) =>
              a.taxid !== taxon.taxid &&
              a.taxid !== CELLULAR_TAXID &&
              a.scientific_name?.toLowerCase() !== "cellular organisms"
          )
        )
      })
      .catch(() => { if (!cancelled) setDetails(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taxon.taxid, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  const startDrag = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { x: e.clientX, width }
    e.preventDefault()
  }, [width])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStart.current.x - e.clientX
      setWidth(Math.min(MAX_W, Math.max(MIN_W, dragStart.current.width + delta)))
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    return () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
  }, [])

  const geneStats = useMemo(() => {
    const raw = taxon.taxon as any
    const stats = raw?.stats?.genes ?? {}
    return GENE_FEATURES.map((feat) => {
      const s = feat === "coding"
        ? stats.coding?.count
        : feat === "non_coding"
        ? stats.non_coding?.count
        : stats.pseudogene?.count
      return { feat, mean: s?.mean ?? 0 }
    })
  }, [taxon])

  const totalMean = geneStats.reduce((s, g) => s + g.mean, 0)

  const pinnedStats = useMemo(() => {
    if (!pinnedNode) return null
    const raw = pinnedNode.taxon as any
    const stats = raw?.stats?.genes ?? {}
    return GENE_FEATURES.map((feat) => {
      const s = feat === "coding"
        ? stats.coding?.count
        : feat === "non_coding"
        ? stats.non_coding?.count
        : stats.pseudogene?.count
      return { feat, mean: s?.mean ?? 0 }
    })
  }, [pinnedNode])

  const pinnedTotal = pinnedStats?.reduce((s, g) => s + g.mean, 0) ?? 0

  if (!open) return null

  const children = (details?.children ?? []) as TaxonRecord[]
  const childrenSorted = [...children]
    .sort((a, b) => (b.annotations_count ?? 0) - (a.annotations_count ?? 0))
    .slice(0, 8)

  return (
    <div
      className="taxonomy-drawer fixed top-0 right-0 h-full z-50 flex"
      style={{ width, animation: "drawer-in 200ms ease-out" }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={startDrag}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/30 transition-colors self-stretch"
        aria-hidden
      />

      {/* Drawer body */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background border-l border-border">

        {/* Header */}
        <div className="flex items-start gap-2 px-5 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-foreground truncate">
              {taxon.taxon.scientific_name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {taxon.taxon.rank && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  {taxon.taxon.rank}
                </span>
              )}
              <a
                href={`https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${taxon.taxid}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(TAXONOMY_LINK_MUTED, "flex items-center gap-1 text-xs")}
              >
                TaxID {taxon.taxid}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className={cn(TAXONOMY_ICON_BTN, "mt-1")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6">

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading details…</p>
              </div>
            </div>
          )}

          {/* Stats row */}
          {details && !loading && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Dna,      label: "Organisms",   val: details.organisms_count },
                { icon: Database, label: "Assemblies",  val: details.assemblies_count },
                { icon: FileText, label: "Annotations", val: details.annotations_count },
              ].map(({ icon: Icon, label, val }) => (
                <Card key={label} className="p-3 text-center">
                  <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums">
                    {(val ?? 0).toLocaleString()}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Feature breakdown */}
          {totalMean > 0 && !loading && (
            <section>
              <SectionTitle>Feature Breakdown</SectionTitle>
              <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-muted">
                {geneStats.map(({ feat, mean }) =>
                  mean > 0 ? (
                    <div
                      key={feat}
                      style={{
                        width: `${(mean / totalMean) * 100}%`,
                        backgroundColor: FEATURE_COLORS[feat],
                      }}
                      title={`${FEATURE_LABELS[feat]}: ${mean.toFixed(1)}`}
                    />
                  ) : null
                )}
              </div>
              <div className="space-y-1.5">
                {geneStats.map(({ feat, mean }) => (
                  <div key={feat} className="flex items-center gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: FEATURE_COLORS[feat] }}
                    />
                    <span className="text-xs text-muted-foreground flex-1">{FEATURE_LABELS[feat]}</span>
                    <div className="flex-1 mx-1 h-[3px] rounded-full overflow-hidden bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: totalMean > 0 ? `${(mean / totalMean) * 100}%` : "0%",
                          backgroundColor: FEATURE_COLORS[feat],
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                      {totalMean > 0 ? `${((mean / totalMean) * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pinned comparison */}
          {pinnedNode && pinnedStats && !loading && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <SectionTitle className="mb-0">Compare vs Pinned</SectionTitle>
                <button
                  type="button"
                  onClick={onUnpin}
                  className={cn(TAXONOMY_ICON_BTN, "flex items-center gap-1 text-xs")}
                >
                  <PinOff className="h-3 w-3" />
                  Unpin
                </button>
              </div>
              <Card className="p-3 space-y-2">
                <p className="text-xs font-medium text-foreground truncate" title={pinnedNode.taxon.scientific_name}>
                  {pinnedNode.taxon.scientific_name}
                </p>
                <div className="space-y-1">
                  {geneStats.map(({ feat, mean }, i) => {
                    const pinnedMean = pinnedStats[i]?.mean ?? 0
                    const delta = totalMean > 0 && pinnedTotal > 0
                      ? ((mean / totalMean) - (pinnedMean / pinnedTotal)) * 100
                      : 0
                    return (
                      <div key={feat} className="flex items-center gap-2 text-xs">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: FEATURE_COLORS[feat] }}
                        />
                        <span className="text-muted-foreground flex-1">{FEATURE_LABELS[feat]}</span>
                        {Math.abs(delta) >= 0.5 ? (
                          <span className={cn("flex items-center gap-0.5 font-medium text-xs",
                            delta > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                          )}>
                            {delta > 0
                              ? <ArrowUp className="h-2.5 w-2.5" />
                              : <ArrowDown className="h-2.5 w-2.5" />}
                            {Math.abs(delta).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">≈</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            </section>
          )}

          {/* Subgroups */}
          {childrenSorted.length > 0 && !loading && (
            <section>
              <SectionTitle>Subgroups</SectionTitle>
              <div className="space-y-0.5">
                {childrenSorted.map((child) => (
                  <button
                    key={child.taxid}
                    type="button"
                    onClick={() => { onSelectSubgroup(child.taxid); onClose() }}
                    className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-xs hover:bg-muted transition-colors group text-left"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: FEATURE_COLORS.coding }}
                    />
                    <span className="flex-1 text-muted-foreground group-hover:text-foreground truncate transition-colors">
                      {child.scientific_name}
                    </span>
                    <span className="text-muted-foreground tabular-nums text-[10px]">
                      {(child.annotations_count ?? 0).toLocaleString()}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Position in tree */}
          {ancestors.length > 0 && !loading && (
            <section>
              <SectionTitle>Position in Tree</SectionTitle>
              <div className="flex flex-wrap items-center gap-1">
                {ancestors.map((a) => (
                  <span key={a.taxid} className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => { onSelectSubgroup(a.taxid); onClose() }}
                      className={cn(TAXONOMY_LINK_MUTED, "truncate max-w-[100px]")}
                      title={a.scientific_name}
                    >
                      {a.scientific_name}
                    </button>
                    <span className="text-muted-foreground/50">›</span>
                  </span>
                ))}
                <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                  {taxon.taxon.scientific_name}
                </span>
              </div>
            </section>
          )}

          {/* Wikipedia */}
          {details?.scientific_name && !loading && (
            <section>
              <SectionTitle>Wikipedia</SectionTitle>
              <WikiSummary searchTerm={details.scientific_name} hideImage />
            </section>
          )}

          {/* Actions */}
          {!loading && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => router.push(buildEntityDetailsUrl("taxon", taxon.taxid))}
              >
                Full details
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => {
                  if (details) setSelectedTaxons([details])
                  router.push("/annotations")
                }}
              >
                Annotations
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h3
      className={cn(
        "text-[9px] uppercase tracking-[0.12em] font-semibold text-muted-foreground mb-2.5",
        className
      )}
    >
      {children}
    </h3>
  )
}
