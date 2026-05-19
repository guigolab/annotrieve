/** Chrome above track rows in the embedded LGV (ViewTitle + Paper padding/margin). */
const EMBEDDED_VIEW_CHROME_PX = 56

const MIN_TRACK_HEIGHT_PX = 48

type JBrowseViewLike = {
  tracks: Array<{
    displays: Array<{
      setHeight?: (height: number) => number
    }>
  }>
  headerHeight: number
  scaleBarHeight: number
}

/**
 * Distribute available vertical space across tracks so the embedded view
 * fills the measured container (see TrackHeightMixin.setHeight in JBrowse).
 */
export function distributeEmbeddedTrackHeights(
  view: JBrowseViewLike,
  containerHeightPx: number,
): void {
  const trackCount = view.tracks.length
  if (trackCount === 0 || containerHeightPx <= 0) return

  const chrome =
    view.headerHeight + view.scaleBarHeight + EMBEDDED_VIEW_CHROME_PX
  const available = Math.max(MIN_TRACK_HEIGHT_PX * trackCount, containerHeightPx - chrome)
  const perTrack = Math.max(
    MIN_TRACK_HEIGHT_PX,
    Math.floor(available / trackCount),
  )

  for (const track of view.tracks) {
    const display = track.displays[0]
    display?.setHeight?.(perTrack)
  }
}
