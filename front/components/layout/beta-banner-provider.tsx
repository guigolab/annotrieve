"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { BetaBanner } from "./beta-banner"

interface BetaBannerContextType {
  isBannerVisible: boolean
  toggleBanner: () => void
  closeBanner: () => void
}

const BetaBannerContext = createContext<BetaBannerContextType | undefined>(undefined)

export function useBetaBanner() {
  const context = useContext(BetaBannerContext)
  if (context === undefined) {
    throw new Error("useBetaBanner must be used within a BetaBannerProvider")
  }
  return context
}

interface BetaBannerProviderProps {
  children: ReactNode
}

export function BetaBannerProvider({ children }: BetaBannerProviderProps) {
  const [isBannerVisible, setIsBannerVisible] = useState(false)

  useEffect(() => {
    // Check if user has seen the banner before
    const hasSeenBanner = localStorage.getItem("annotrieve-banner-seen")
    if (!hasSeenBanner) {
      setIsBannerVisible(true)
    }
  }, [])

  const toggleBanner = () => {
    setIsBannerVisible(prev => !prev)
  }

  const closeBanner = () => {
    setIsBannerVisible(false)
    localStorage.setItem("annotrieve-banner-seen", "true")
  }

  return (
    <BetaBannerContext.Provider value={{ isBannerVisible, toggleBanner, closeBanner }}>
      {children}
      <BetaBanner isVisible={isBannerVisible} onClose={closeBanner} />
    </BetaBannerContext.Provider>
  )
}
