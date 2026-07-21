/**
 * CSV join/split for list query params.
 * Matches backend helpers.parameters.split_string_param / normalize_to_list:
 * values containing commas or quotes must be double-quoted; "" escapes quotes.
 */

function needsCsvQuotes(value: string): boolean {
  return value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')
}

function escapeCsvField(value: string): string {
  if (!needsCsvQuotes(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** Join list values for a single query param (quote values that need it). */
export function joinCsv(values: Iterable<string>): string {
  return Array.from(values, (v) => escapeCsvField(String(v))).join(',')
}

/**
 * Parse a CSV list query param value.
 * Unquoted ``a,b`` → two values; quoted ``"a, b"`` → one value.
 */
export function splitCsv(value: string | null | undefined): string[] {
  if (value == null) return []
  const raw = String(value)
  if (!raw.trim()) return []

  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < raw.length) {
    const ch = raw[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < raw.length && raw[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      current += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (ch === ',') {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ''
      i += 1
      // skip spaces after comma (matches csv skipinitialspace)
      while (i < raw.length && raw[i] === ' ') i += 1
      continue
    }

    current += ch
    i += 1
  }

  const trimmed = current.trim()
  if (trimmed) result.push(trimmed)
  return result
}
