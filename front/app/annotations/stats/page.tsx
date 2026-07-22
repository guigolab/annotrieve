"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { navigateToAnnotationsAnalytics } from "@/lib/navigate-to-annotations-analytics"

export default function AnnotationsStatsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    navigateToAnnotationsAnalytics(router, "replace")
  }, [router])

  return null
}
