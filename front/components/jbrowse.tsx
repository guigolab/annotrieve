'use client'
import { useState, useEffect, useMemo, memo, useRef } from 'react'
import RefGetPlugin from 'jbrowse-plugin-refget-api'
import {
  createViewState,
  JBrowseLinearGenomeView,
  ViewModel,
} from '@jbrowse/react-linear-genome-view2'
import { getAssembly } from '@/lib/api/assemblies'
import { fetchChromosomesFromFiles, resolveChrAliasesFileUrl } from '@/lib/api/files'
import { getFilesBase, joinUrl } from '@/lib/config/env'
import type { AnnotationRecord } from '@/lib/api/types'
import { distributeEmbeddedTrackHeights } from '@/lib/jbrowse-viewport'
import { AlertCircle } from 'lucide-react'

interface JBrowseLinearGenomeViewComponentProps {
  accession: string
  annotations: AnnotationRecord[]
  taxid?: string
  pairedAssemblyAccession?: string | null
}
const filesBaseURL = getFilesBase()
const configuration = {
  theme: {
    palette: {
      mode: 'dark',
      // UI Colors - Muted and harmonious with dark background
      primary: {
        main: '#64748b', // Slate-500 - Muted gray-blue for primary actions
        light: '#94a3b8', // Slate-400 - Lighter variant
        dark: '#475569', // Slate-600 - Darker variant
        contrastText: '#ffffff', // White text on muted gray
      },
      secondary: {
        main: '#6b7280', // Gray-500 - Neutral gray for secondary actions
        light: '#9ca3af', // Gray-400 - Lighter variant
        dark: '#4b5563', // Gray-600 - Darker variant
        contrastText: '#ffffff', // White text on gray
      },
      tertiary: {
        main: '#7c2d12', // Red-800 - Dark red for tertiary elements
        light: '#991b1b', // Red-800 - Slightly lighter
        dark: '#5c1a1a', // Custom dark red
        contrastText: '#ffffff', // White text on dark red
      },
      quaternary: {
        main: '#1e3a8a', // Blue-800 - Dark blue for quaternary elements
        light: '#1e40af', // Blue-700 - Lighter variant
        dark: '#1e293b', // Slate-800 - Darker variant
        contrastText: '#ffffff', // White text on dark blue
      },
    },
  },
}

function JBrowseLinearGenomeViewComponent({
  accession,
  annotations,
  taxid: taxidProp,
  pairedAssemblyAccession: pairedProp,
}: JBrowseLinearGenomeViewComponentProps) {
  const [viewState, setViewState] = useState<ViewModel>()
  const [chromosomes, setChromosomes] = useState<any[]>([])
  const [chrAliasesUri, setChrAliasesUri] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const isRefSeqAssembly = accession.startsWith("GCF_")

  // Measure the flex viewport (must stay mounted during loading — no early return).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateHeight = () => {
      const next = el.clientHeight
      if (next > 0) setContainerHeight(next)
    }

    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(el)
    return () => observer.disconnect()
  }, [isRefSeqAssembly, isLoading, viewState])

  // JBrowse LGV height = sum of track heights (not CSS %). Resize tracks to fill viewport.
  useEffect(() => {
    if (!viewState || containerHeight <= 0) return
    try {
      const view = viewState.session.view as Parameters<typeof distributeEmbeddedTrackHeights>[0]
      distributeEmbeddedTrackHeights(view, containerHeight)
    } catch (error) {
      console.error("Failed to resize JBrowse tracks:", error)
    }
  }, [viewState, containerHeight, annotations.length])

  // Derive assembly name from annotations (memoized to prevent unnecessary updates)
  const assemblyName = useMemo(() => {
    return annotations.length > 0 ? (annotations[0]?.assembly_name ?? '') : ''
  }, [annotations])

  // Fetch chromosomes data (only depends on accession, not annotations)
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    async function fetchData() {
      try {
        const taxid = taxidProp ?? annotations[0]?.taxid
        if (!taxid) {
          setChromosomes([])
          return
        }
        let paired: string | null | undefined = pairedProp ?? undefined
        if (paired === undefined && !pairedProp) {
          try {
            const assembly = await getAssembly(accession)
            paired = assembly.paired_assembly_accession
          } catch {
            paired = undefined
          }
        }
        const rows = await fetchChromosomesFromFiles(taxid, accession, paired)
        if (cancelled) return
        const chromosomeResults = rows.map((row) => ({
          chr_name: row.chr_name,
          sequence_name: row.sequence_name,
          ucsc_style_name: row.ucsc_style_name,
          genbank_accession: row.genbank_accession,
          refseq_accession: row.refseq_accession,
          sequence_id: row.chr_name || row.sequence_name,
          length: row.length,
        }))
        setChromosomes(chromosomeResults)
        setChrAliasesUri(
          await resolveChrAliasesFileUrl(taxid, accession, paired ?? undefined),
        )
      } catch (error) {
        console.error('Error fetching JBrowse data:', error)
        setChrAliasesUri(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [accession, annotations, taxidProp, pairedProp])

  // Memoize tracks to prevent recreation on every render
  const tracks = useMemo(() => {
    if (!annotations || annotations.length === 0) return []
    return annotations.map((annotation) => ({
      type: 'FeatureTrack',
      trackId: annotation.annotation_id,
      name: annotation.source_file_info?.provider || `${annotation.source_file_info?.database} - ${annotation.assembly_name}`,
      assemblyNames: [annotation.assembly_name],
      category: [annotation.source_file_info?.database || 'Unknown'],
          adapter: {
            type: "Gff3TabixAdapter",
            gffGzLocation: {
              uri: joinUrl(filesBaseURL, (annotation.indexed_file_info as any)?.bgzipped_path || ''),
              locationType: "UriLocation",
            },
            index: {
              location: {
                uri: joinUrl(filesBaseURL, (annotation.indexed_file_info as any)?.csi_path || ''),
                locationType: "UriLocation",
              },
              indexType: "CSI"
            },
          },
      displays: [
        {
          type: "LinearBasicDisplay",
          displayId: `${annotation.annotation_id}_TrackDisplay`,
          renderer: {
            type: "SvgFeatureRenderer",
            showLabels: true,
            showDescriptions: true,
            labels: {
              descriptionColor: "#8b8b8b",    // <-- override this
            },
          }
        }
      ]

    }))
  }, [annotations])

  // Memoize sequence data to prevent recreation
  const sequenceData = useMemo(() => {
    return Object.fromEntries(
      chromosomes.map((chromosome) => {
        const refName =
          chromosome.chr_name ||
          chromosome.ucsc_style_name ||
          chromosome.sequence_name ||
          chromosome.sequence_id
        const key = chromosome.genbank_accession
          ? `insdc:${chromosome.genbank_accession}`
          : String(refName)
        return [
          key,
          {
            name: refName,
            size: Number(chromosome.length || 0),
          },
        ]
      })
    )
  }, [chromosomes])

  // Memoize assembly configuration
  const assembly = useMemo(() => ({
    name: assemblyName,
    refNameAliases: chrAliasesUri ? {
      adapter: {
        type: "RefNameAliasAdapter",
        location: {
          uri: chrAliasesUri,
          locationType: "UriLocation"
        }
      }
    } : undefined,
    sequence: {
      name: assemblyName,
      trackId: `${accession}-seq`,
      type: 'ReferenceSequenceTrack',
      adapter: {
        type: "RefGetAdapter",
        sequenceData
      }
    }
  }), [assemblyName, sequenceData, chrAliasesUri])

  // Create view state only when dependencies change
  useEffect(() => {
    if (!annotations.length || !chromosomes.length || !assemblyName || !tracks.length) {
      return
    }

    // Get the first chromosome for default location
    const firstChromosome = chromosomes[0]
    const defaultRefName =
      firstChromosome?.chr_name ||
      firstChromosome?.sequence_name ||
      firstChromosome?.sequence_id
    const defaultLocation = firstChromosome && defaultRefName
      ? `${defaultRefName}:1-${Math.min(100000, firstChromosome.length || 100000)}`
      : undefined

    // Create session tracks with all tracks visible by default
    const sessionTracks = tracks.map((track) => ({
      type: 'FeatureTrack',
      configuration: track.trackId,
      displays: [
        {
          type: 'LinearBasicDisplay',
          configuration: `${track.trackId}_TrackDisplay`,
        },
      ],
    }))

    // JBrowse needs to create multiple workers for its RPC system
    // Don't use a singleton - let JBrowse manage worker lifecycle
    const state = createViewState({
      assembly,
      tracks,
      plugins: [RefGetPlugin],
      configuration: {
        rpc: {
          defaultDriver: 'WebWorkerRpcDriver',
        },
        ...configuration,
      },
      defaultSession: {
        name: 'Annotrieve Session',
        view: {
          id: 'linearGenomeView',
          type: 'LinearGenomeView',
          ...(defaultLocation && firstChromosome && defaultRefName && {
            displayedRegions: [
              {
                refName: defaultRefName,
                start: 0,
                end: Math.min(100000, firstChromosome.length || 100000),
                assemblyName,
              }
            ]
          }),
          tracks: sessionTracks,
        },
      },
      makeWorkerInstance: () => {
        return new Worker(new URL('../app/rpcWorker.ts', import.meta.url))
      },
    })
    setViewState(state)
  }, [assembly, tracks, chromosomes, assemblyName])

  const showLoading = isLoading || !viewState

  return (
    <div className="relative flex h-full w-full flex-col min-h-0 overflow-hidden">
      {isRefSeqAssembly && !showLoading && (
        <div className="shrink-0 flex items-start gap-3 p-3 mx-3 mt-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              RefSeq assembly detected
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Some genome browser features do not work for RefSeq assemblies because FASTA is fetched via the GenBank (INSDC) plugin.
            </p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="relative flex-1 min-h-0 w-full">
        {viewState ? (
          <div
            className="jbrowse-embed h-full w-full"
            style={containerHeight > 0 ? { height: containerHeight } : undefined}
          >
            <JBrowseLinearGenomeView viewState={viewState} />
          </div>
        ) : null}
        {showLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">
                {isLoading ? "Loading genome data…" : "Initializing genome browser…"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Memoize the component to prevent rerenders when props haven't changed
export default memo(JBrowseLinearGenomeViewComponent)