"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AnnotationsCompareRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/annotations/analytics")
  }, [router])

  return null
}
