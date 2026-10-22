"use client"

import { useEffect, useState } from "react"

/** Track the `.dark` class on <html> (theme toggles without next-themes). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains("dark"))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return dark
}

/** Primary selection highlight for canvas (indigo-ish, matches theme). */
export function selectionFill(dark: boolean): string {
  return dark ? "rgba(129,140,248,0.18)" : "rgba(99,102,241,0.12)"
}

export function selectionStroke(): string {
  return "rgb(99,102,241)"
}

export function crosshairFill(dark: boolean): string {
  return dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"
}
