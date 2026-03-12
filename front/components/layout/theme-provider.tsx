'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/lib/stores/ui'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((state) => state.theme)

  // Initialize theme on mount and when it changes
  useEffect(() => {
    // Apply theme to document
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  return <>{children}</>
}

