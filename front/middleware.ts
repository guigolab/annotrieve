import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const EUKARYOTA_TAXID = "2759"

/**
 * Ensure /taxonomy always has ?taxon=<taxid> so the client never sees a missing param.
 * Redirects /taxonomy or /taxonomy?view=... to /taxonomy?taxon=2759 (and preserves view if present).
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (pathname !== "/taxonomy") return NextResponse.next()

  const taxon = searchParams.get("taxon")
  if (taxon != null && taxon !== "") return NextResponse.next()

  const next = request.nextUrl.clone()
  searchParams.set("taxon", EUKARYOTA_TAXID)
  next.search = searchParams.toString()
  return NextResponse.redirect(next)
}
