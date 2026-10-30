import {
  cellBackground,
  cellTextIsDark,
  heatmapColumnLayout,
  heatmapHeaderHeight,
  HEATMAP_COUNT_MIN_CELL_W,
  type NodeNameCounts,
} from "@/lib/genes/heatmap"

const TAXON_COL_W = 260
const ROW_H = 36
const TILE_H = 28
const GAP = 3
const HEADER_PAD = 8
/** Soft cap on PNG raster pixels (width×height×scale²) to avoid OOM. */
const MAX_PNG_PIXELS = 16_000_000

export type HeatmapExportFormat = "svg" | "png" | "tsv"

export interface HeatmapExportColumn {
  name: string
  id: string
}

export interface HeatmapExportRow {
  id: string
  label: string
  rank: string | null
}

export interface RenderHeatmapSvgInput {
  columns: HeatmapExportColumn[]
  activeColumnCount: number
  rows: HeatmapExportRow[]
  rowCounts: NodeNameCounts[]
  title?: string
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function truncateLabel(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function heatmapExportFilename(format: HeatmapExportFormat): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `genes-heatmap-${stamp}.${format}`
}

/**
 * Build an SVG string of the heatmap for all provided rows (typically every
 * taxon at the current view rank).
 */
export function renderHeatmapSvg({
  columns,
  activeColumnCount,
  rows,
  rowCounts,
  title,
}: RenderHeatmapSvgInput): string {
  const layout = heatmapColumnLayout(columns.length)
  const cellW = layout.cellW
  const rotateHeaders = layout.rotateHeaders || columns.length > 6
  const headerH = heatmapHeaderHeight(
    rotateHeaders,
    columns.map((c) => c.name),
    cellW,
  )
  const showCounts = cellW >= HEATMAP_COUNT_MIN_CELL_W
  const width =
    TAXON_COL_W + columns.length * cellW + GAP * (columns.length + 1)
  const height = headerH + rows.length * (ROW_H + GAP) + GAP

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  )
  parts.push(
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  )
  if (title) {
    parts.push(
      `<title>${escapeXml(title)}</title>`,
    )
  }

  // Corner label
  parts.push(
    `<text x="${HEADER_PAD}" y="${headerH - 10}" font-family="system-ui,sans-serif" font-size="11" fill="#64748b">${escapeXml(
      `${rows.length.toLocaleString()} taxa · ${activeColumnCount} names`,
    )}</text>`,
  )

  // Column headers
  columns.forEach((col, ci) => {
    const x = TAXON_COL_W + GAP + ci * (cellW + GAP) + cellW / 2
    const y = headerH - 8
    const label = truncateLabel(col.name, rotateHeaders ? 18 : 10)
    if (rotateHeaders) {
      parts.push(
        `<text x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="10" font-weight="600" fill="#0f172a" text-anchor="start" transform="rotate(-90 ${x} ${y})">${escapeXml(label)}</text>`,
      )
    } else {
      parts.push(
        `<text x="${x}" y="${y}" font-family="ui-monospace,monospace" font-size="10" font-weight="600" fill="#0f172a" text-anchor="middle">${escapeXml(label)}</text>`,
      )
    }
  })

  // Separator under header
  parts.push(
    `<line x1="0" y1="${headerH}" x2="${width}" y2="${headerH}" stroke="#e2e8f0" stroke-width="1"/>`,
  )

  rows.forEach((row, ri) => {
    const counts = rowCounts[ri] ?? { n: 0, byName: [] }
    const y0 = headerH + GAP + ri * (ROW_H + GAP)
    const midY = y0 + ROW_H / 2

    // Alternating row tint
    if (ri % 2 === 1) {
      parts.push(
        `<rect x="0" y="${y0}" width="${width}" height="${ROW_H}" fill="#f8fafc"/>`,
      )
    }

    const name = truncateLabel(row.label, 28)
    parts.push(
      `<text x="${HEADER_PAD}" y="${midY - 4}" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="#0f172a">${escapeXml(name)}</text>`,
    )
    parts.push(
      `<text x="${HEADER_PAD}" y="${midY + 10}" font-family="ui-monospace,monospace" font-size="9" fill="#94a3b8">${escapeXml(row.id)}</text>`,
    )
    parts.push(
      `<text x="${TAXON_COL_W - HEADER_PAD}" y="${midY + 4}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="end">${counts.n.toLocaleString()}</text>`,
    )

    columns.forEach((col, ci) => {
      const activeIdx = ci < activeColumnCount ? ci : -1
      const k = activeIdx >= 0 ? (counts.byName[activeIdx] ?? 0) : 0
      const n = counts.n
      const hasValue = n > 0 && k > 0
      const isZero = n > 0 && k <= 0
      const tileW = Math.max(cellW - GAP * 2, 16)
      const x =
        TAXON_COL_W + GAP + ci * (cellW + GAP) + (cellW - tileW) / 2
      const y = y0 + (ROW_H - TILE_H) / 2
      const bg = hasValue
        ? cellBackground(k, n) ?? "#e2e8f0"
        : isZero
          ? "#f1f5f9"
          : "#e2e8f0"
      const textFill = hasValue
        ? cellTextIsDark(k, n)
          ? "#0f172a"
          : "#ffffff"
        : "#94a3b8"

      parts.push(
        `<rect x="${x}" y="${y}" width="${tileW}" height="${TILE_H}" rx="6" ry="6" fill="${bg}"/>`,
      )
      if (showCounts && (hasValue || isZero)) {
        parts.push(
          `<text x="${x + tileW / 2}" y="${y + TILE_H / 2 + 3.5}" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="${textFill}" text-anchor="middle">${k.toLocaleString()}</text>`,
        )
      }
    })
  })

  parts.push(`</svg>`)
  return parts.join("")
}

export function downloadHeatmapSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  triggerDownload(blob, filename)
}

/** Cap raster scale so huge heatmaps still export without OOM; SVG stays full-fidelity. */
export function heatmapPngExportScale(
  width: number,
  height: number,
  requested = 2,
): number {
  const area = Math.max(1, width) * Math.max(1, height)
  if (area >= MAX_PNG_PIXELS) return 1
  const maxScale = Math.sqrt(MAX_PNG_PIXELS / area)
  return Math.max(1, Math.min(requested, maxScale))
}

export async function downloadHeatmapPng(
  svg: string,
  filename: string,
  scale = 2,
): Promise<void> {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const width = match ? Number(match[1]) : 800
  const height = match ? Number(match[2]) : 600
  const effectiveScale = heatmapPngExportScale(width, height, scale)

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error("Failed to load heatmap SVG"))
      image.src = url
    })

    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * effectiveScale))
    canvas.height = Math.max(1, Math.round(height * effectiveScale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas unavailable")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
        "image/png",
      )
    })
    triggerDownload(pngBlob, filename)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * TSV matrix: taxon_id, taxon_label, then one column per gene (active unit values).
 */
export function renderHeatmapTsv(opts: {
  columns: { name: string }[]
  rows: HeatmapExportRow[]
  rowCounts: NodeNameCounts[]
}): string {
  const header = ["taxon_id", "taxon_label", ...opts.columns.map((c) => c.name)]
  const lines = [header.join("\t")]
  for (let i = 0; i < opts.rows.length; i++) {
    const row = opts.rows[i]!
    const counts = opts.rowCounts[i]
    const cells = opts.columns.map((_, j) =>
      String(counts?.byName[j] ?? 0),
    )
    lines.push([row.id, row.label, ...cells].join("\t"))
  }
  return `${lines.join("\n")}\n`
}

export function downloadHeatmapTsv(tsv: string, filename: string): void {
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" })
  triggerDownload(blob, filename)
}
