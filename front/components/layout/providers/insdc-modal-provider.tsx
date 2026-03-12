"use client"

import { INSDCSearchModal } from "@/components/search/insdc-search-sidebar"
import { useUIStore } from "@/lib/stores/ui"

export function InsdcModalProvider() {
  const insdcSearchModal = useUIStore((state) => state.insdcSearchModal)
  const closeInsdcSearchModal = useUIStore((state) => state.closeInsdcSearchModal)

  return (
    <INSDCSearchModal
      open={insdcSearchModal.isOpen}
      initialQuery={insdcSearchModal.initialQuery}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeInsdcSearchModal()
        }
      }}
    />
  )
}


