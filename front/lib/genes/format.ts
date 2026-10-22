/** Format a genomic locus as `seqid:start-end (strand)`. */
export function formatLocus(
  seqid: string,
  start: number,
  end: number,
  strand?: string | null,
): string {
  const coords = `${seqid}:${start.toLocaleString()}-${end.toLocaleString()}`
  if (strand === "+" || strand === "-") return `${coords} (${strand})`
  return coords
}

/** Format a base-pair length as bp / kb / Mb. */
export function formatBp(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const mb = abs / 1_000_000
    return `${mb >= 10 ? mb.toFixed(1) : mb.toFixed(2)} Mb`
  }
  if (abs >= 1_000) {
    const kb = abs / 1_000
    return `${kb >= 10 ? kb.toFixed(1) : kb.toFixed(2)} kb`
  }
  return `${abs.toLocaleString()} bp`
}

/** Inclusive locus length in bp. */
export function locusLength(start: number, end: number): number {
  return Math.max(0, Math.abs(end - start) + 1)
}

function niceStep(span: number, targetTicks: number): number {
  const rough = span / Math.max(1, targetTicks)
  if (rough <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / power
  let step: number
  if (normalized <= 1) step = 1
  else if (normalized <= 2) step = 2
  else if (normalized <= 5) step = 5
  else step = 10
  return step * power
}

/** Evenly spaced, rounded tick positions for a genomic ruler. */
export function niceTicks(
  start: number,
  end: number,
  n = 5,
): number[] {
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  const span = hi - lo
  if (span <= 0) return [lo]
  const step = niceStep(span, Math.max(2, n - 1))
  const first = Math.ceil(lo / step) * step
  const ticks: number[] = []
  for (let t = first; t <= hi + step * 1e-9; t += step) {
    ticks.push(Math.round(t))
    if (ticks.length > 20) break
  }
  if (!ticks.length || ticks[0] !== lo) ticks.unshift(lo)
  if (ticks[ticks.length - 1] !== hi) ticks.push(hi)
  return [...new Set(ticks)].sort((a, b) => a - b)
}

/** Compact genomic position label for ruler ticks. */
export function formatTick(pos: number, span: number): string {
  if (span >= 1_000_000) return `${(pos / 1_000_000).toFixed(2)} Mb`
  if (span >= 1_000) return `${(pos / 1_000).toFixed(1)} kb`
  return pos.toLocaleString()
}
