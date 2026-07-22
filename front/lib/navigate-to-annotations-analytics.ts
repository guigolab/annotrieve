import { useAnnotationsFiltersStore } from "@/lib/stores/annotations-filters"
import {
  pickFiltersState,
  useAnalyticsCurrentFiltersStore,
} from "@/lib/stores/analytics-current-filters"

type RouterLike = {
  push: (href: string) => void
  replace: (href: string) => void
}

/**
 * Snapshot current list filters, then open Analytics.
 * Analytics reads the snapshot for the virtual "Current filters" set.
 */
export function navigateToAnnotationsAnalytics(
  router: RouterLike,
  method: "push" | "replace" = "push"
) {
  const state = useAnnotationsFiltersStore.getState()
  useAnalyticsCurrentFiltersStore.getState().setSnapshot(pickFiltersState(state))
  router[method]("/annotations/analytics")
}
