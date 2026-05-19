"use client"

import { useState, useEffect, useCallback } from "react"

const DESKTOP_QUERY = "(min-width: 768px)"

/**
 * Sidebar open on desktop by default, closed on mobile.
 * Re-syncs when crossing the md breakpoint.
 */
export function useResponsiveSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const handler = () => {
      const desktop = mq.matches
      setIsDesktop(desktop)
      setSidebarOpen(desktop)
    }
    handler()
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => !v)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  return {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    closeSidebar,
    isDesktop,
  }
}
