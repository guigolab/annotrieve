"use client"

import { useCallback, useEffect, useMemo, useState, type RefObject } from "react"

export interface VirtualWindow {
  start: number
  end: number
  offsetY: number
  totalHeight: number
  visibleIndexes: number[]
}

/**
 * Fixed-row-height virtual window over a scroll parent.
 * Renders ``overscan`` extra rows above/below the viewport.
 */
export function useVirtualWindow(
  scrollRef: RefObject<HTMLElement | null>,
  itemCount: number,
  rowHeight: number,
  overscan = 6,
): VirtualWindow {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setViewportHeight(el.clientHeight)
      setScrollTop(el.scrollTop)
    }
    measure()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [scrollRef, onScroll, itemCount])

  return useMemo(() => {
    const totalHeight = Math.max(0, itemCount * rowHeight)
    if (itemCount === 0 || rowHeight <= 0) {
      return {
        start: 0,
        end: 0,
        offsetY: 0,
        totalHeight: 0,
        visibleIndexes: [],
      }
    }
    const visible = Math.max(1, Math.ceil(viewportHeight / rowHeight))
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(itemCount, start + visible + overscan * 2)
    const visibleIndexes: number[] = []
    for (let i = start; i < end; i++) visibleIndexes.push(i)
    return {
      start,
      end,
      offsetY: start * rowHeight,
      totalHeight,
      visibleIndexes,
    }
  }, [itemCount, rowHeight, scrollTop, viewportHeight, overscan])
}

export function scrollIndexIntoView(
  scrollRef: RefObject<HTMLElement | null>,
  index: number,
  rowHeight: number,
) {
  const el = scrollRef.current
  if (!el || index < 0) return
  const top = index * rowHeight
  const bottom = top + rowHeight
  if (top < el.scrollTop) {
    el.scrollTop = top
  } else if (bottom > el.scrollTop + el.clientHeight) {
    el.scrollTop = bottom - el.clientHeight
  }
}

export interface VariableVirtualWindow {
  start: number
  end: number
  offsetY: number
  totalHeight: number
  visibleIndexes: number[]
  /** Absolute top offset for each visible index. */
  offsetForIndex: (index: number) => number
}

/**
 * Variable-row-height virtual window. ``getHeight(i)`` must be stable
 * for a given item identity while that item is mounted.
 */
export function useVariableVirtualWindow(
  scrollRef: RefObject<HTMLElement | null>,
  itemCount: number,
  getHeight: (index: number) => number,
  overscan = 6,
): VariableVirtualWindow {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setViewportHeight(el.clientHeight)
      setScrollTop(el.scrollTop)
    }
    measure()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [scrollRef, onScroll, itemCount])

  return useMemo(() => {
    const offsets: number[] = new Array(itemCount + 1)
    offsets[0] = 0
    for (let i = 0; i < itemCount; i++) {
      offsets[i + 1] = offsets[i] + Math.max(0, getHeight(i))
    }
    const totalHeight = offsets[itemCount] ?? 0
    if (itemCount === 0) {
      return {
        start: 0,
        end: 0,
        offsetY: 0,
        totalHeight: 0,
        visibleIndexes: [],
        offsetForIndex: () => 0,
      }
    }

    let start = 0
    while (start < itemCount && offsets[start + 1] <= scrollTop) start++
    start = Math.max(0, start - overscan)

    let end = start
    const bottom = scrollTop + viewportHeight
    while (end < itemCount && offsets[end] < bottom) end++
    end = Math.min(itemCount, end + overscan)

    const visibleIndexes: number[] = []
    for (let i = start; i < end; i++) visibleIndexes.push(i)

    return {
      start,
      end,
      offsetY: offsets[start] ?? 0,
      totalHeight,
      visibleIndexes,
      offsetForIndex: (index: number) => offsets[index] ?? 0,
    }
  }, [itemCount, getHeight, scrollTop, viewportHeight, overscan])
}

export interface VirtualColumnWindow {
  start: number
  end: number
  offsetX: number
  totalWidth: number
  visibleIndexes: number[]
}

/** Fixed-column-width virtual window (horizontal scroll). */
export function useVirtualColumns(
  scrollRef: RefObject<HTMLElement | null>,
  columnCount: number,
  columnWidth: number,
  labelWidth: number,
  overscan = 4,
): VirtualColumnWindow {
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollLeft(el.scrollLeft)
  }, [scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      setViewportWidth(el.clientWidth)
      setScrollLeft(el.scrollLeft)
    }
    measure()
    el.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [scrollRef, onScroll, columnCount])

  return useMemo(() => {
    const totalWidth = Math.max(0, columnCount * columnWidth)
    if (columnCount === 0 || columnWidth <= 0) {
      return {
        start: 0,
        end: 0,
        offsetX: 0,
        totalWidth: 0,
        visibleIndexes: [],
      }
    }
    const contentLeft = Math.max(0, scrollLeft - labelWidth)
    const visible = Math.max(
      1,
      Math.ceil((viewportWidth - labelWidth) / columnWidth) + 1,
    )
    const start = Math.max(0, Math.floor(contentLeft / columnWidth) - overscan)
    const end = Math.min(columnCount, start + visible + overscan * 2)
    const visibleIndexes: number[] = []
    for (let i = start; i < end; i++) visibleIndexes.push(i)
    return {
      start,
      end,
      offsetX: start * columnWidth,
      totalWidth,
      visibleIndexes,
    }
  }, [
    columnCount,
    columnWidth,
    labelWidth,
    scrollLeft,
    viewportWidth,
    overscan,
  ])
}
