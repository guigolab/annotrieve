"use client"

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
// @ts-ignore - js-yaml types may not be available
import * as yaml from 'js-yaml'

// Dynamically import Redoc to avoid SSR issues
const RedocStandalone = dynamic(
  () => 
    import('redoc')
      .then((mod) => {
        console.log('Redoc module loaded:', mod)
        return { default: mod.RedocStandalone }
      })
      .catch((error) => {
        console.error('Failed to load Redoc:', error)
        throw error
      }),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16 min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading API documentation...</p>
        </div>
      </div>
    ),
  }
)

// Dark theme colors for Redoc
const COLORS = {
  primary: '#06b6d4', // Cyan-500 - brighter for dark mode
  foreground: '#fafafa', // Nearly white - better contrast
  mutedForeground: '#cbd5e1', // Slate-300 - lighter gray for better readability
  background: '#1e293b', // Slate-800 - slightly lighter dark background
  muted: '#334155', // Slate-700 - lighter for better contrast
  border: '#475569', // Slate-600 - visible borders
}

export default function ApiDocsPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [spec, setSpec] = useState<any>(null)
  const definitionUrl = "/annotrieve/annotrieve-api-specs.yaml"

  useEffect(() => {
    // Fetch and parse the spec file
    fetch(definitionUrl)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`)
        }
        const text = await res.text()
        
        try {
          // Parse YAML to JSON object
          const parsed = yaml.load(text) as any
          setSpec(parsed)
          setIsLoaded(true)
        } catch (e) {
          console.error('Error parsing YAML:', e)
          setError(`Failed to parse API specification: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      .catch((err) => {
        console.error('Error fetching spec file:', err)
        setError(`Failed to load API specification: ${err.message}`)
      })
  }, [definitionUrl])

  // Use error boundary pattern - must be called before any conditional returns
  useEffect(() => {
    // Add a timeout to detect if Redoc is stuck
    const timeout = setTimeout(() => {
      console.warn('Redoc has been loading for a while. Check if there are any errors.')
    }, 10000) // 10 seconds

    return () => clearTimeout(timeout)
  }, [])

  // Build dark theme configuration
  const redocTheme = {
    colors: {
      primary: {
        main: COLORS.primary,
      },
      success: {
        main: COLORS.primary,
      },
      text: {
        primary: COLORS.foreground,
        secondary: COLORS.mutedForeground,
      },
      http: {
        get: COLORS.primary,
        post: '#16a34a',
        put: '#f59e0b',
        delete: '#ef4444',
      },
      responses: {
        success: {
          color: COLORS.primary,
        },
      },
      border: {
        dark: COLORS.border,
        light: COLORS.border,
      },
    },
    typography: {
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontWeightRegular: '400',
      fontWeightBold: '600',
      fontWeightLight: '300',
      lineHeight: '1.5em',
      headings: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: '600',
        lineHeight: '1.3em',
      },
      code: {
        fontFamily: 'monospace',
        fontSize: '13px',
        backgroundColor: COLORS.muted,
        color: COLORS.foreground,
        wrap: false,
      },
      links: {
        color: COLORS.primary,
        visited: COLORS.primary,
      },
    },
    sidebar: {
      backgroundColor: COLORS.background,
      textColor: COLORS.foreground,
      activeTextColor: COLORS.primary,
      groupItems: {
        activeBackgroundColor: COLORS.muted,
        activeTextColor: COLORS.primary,
        textColor: COLORS.foreground,
      },
    },
    rightPanel: {
      backgroundColor: COLORS.background,
      textColor: COLORS.foreground,
    },
    schema: {
      linesColor: COLORS.border,
      defaultDetailsWidth: '75%',
      typeNameColor: COLORS.primary,
      typeTitleColor: COLORS.foreground,
      requireLabelColor: COLORS.primary,
      labelsTextSize: '0.9em',
      nestingSpacing: '1em',
      nestedBackground: COLORS.muted,
      arrow: {
        size: '1.1em',
        color: COLORS.foreground,
      },
    },
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading API Documentation</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Please check that the spec file exists at: <code className="bg-muted px-2 py-1 rounded">{definitionUrl}</code>
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="w-full py-8 px-4">
        <div className="flex items-center justify-center py-16 min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading API documentation...</p>
          </div>
        </div>
      </div>
    )
  }

  // Use spec object if available, otherwise fallback to URL
  if (!spec) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-16 min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading API specification...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-full overflow-y-auto">
      <header>
        <h1 className="sr-only">API Documentation</h1>
      </header>
      <div className="overflow-hidden" style={{ minHeight: '600px', backgroundColor: COLORS.background, borderColor: COLORS.border }}>
        <RedocStandalone
          spec={spec}
          options={{
            nativeScrollbars: true,
            scrollYOffset: 0,
            hideDownloadButton: false,
            disableSearch: false,
            theme: redocTheme,
          } as any}
        />
      </div>
    </div>
  )
}