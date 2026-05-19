/**
 * JBrowse fills the viewport below the navbar; prevent #main-content from scrolling.
 */
export default function JBrowseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100vh-3.5rem)] min-h-0 overflow-hidden">{children}</div>
  )
}
