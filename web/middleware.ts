import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n'

// Public-site middleware.
//
// Two jobs, in this order:
//
//   1. Locale routing. Public routes live under `app/[locale]/(public)/…`.
//      Requests for unprefixed URLs (`/product/foo`) are rewritten
//      internally to `/${DEFAULT_LOCALE}/product/foo` so the user's
//      address bar stays prefix-free for Russian (launch language).
//      Prefixed URLs (`/en/product/foo`) are left alone for Next to
//      match the `[locale]` segment directly.
//
//   2. Admin-defined redirects. Fetches the redirect table from the
//      API (cached 60s in module scope) and issues Location redirects
//      with the configured status code. A fire-and-forget hit ping is
//      dispatched for analytics.
//
// Redirects run first, BEFORE locale rewriting, so that an editor who
// sets up `/old-slug → /new-slug` still works regardless of language
// prefix. Locale-aware redirects (`/en/old-slug`) are out of scope for
// Phase 8 — admins can always add `/en/old → /en/new` explicitly.
//
// Deliberately light-weight:
//   * No DB access from the edge runtime; we proxy through the API.
//   * No per-request auth; the list and hit endpoints are public.
//   * The matcher config below excludes /_next, /api, /admin, /uploads,
//     static feeds (robots, sitemap, yml, turbo, amp) — those paths
//     must stay unprefixed and untouched.

interface Redirect {
  id: string
  fromPath: string
  toPath: string
  statusCode: number
}

interface Cache {
  fetchedAt: number
  items: Redirect[]
}

let cache: Cache = { fetchedAt: 0, items: [] }
const CACHE_TTL_MS = 60_000

async function getRedirects(baseUrl: string): Promise<Redirect[]> {
  const now = Date.now()
  // Empty-items warm-up is NOT treated as a hit — the first request after
  // boot should always attempt a fetch even if it was <60s ago (e.g. cache
  // initialized to `{fetchedAt: 0, items: []}`).
  if (now - cache.fetchedAt < CACHE_TTL_MS && cache.items.length > 0) {
    return cache.items
  }
  try {
    const res = await fetch(`${baseUrl}/api/public/redirects`, {
      cache: 'no-store',
    })
    if (!res.ok) {
      // Fall back to stale cache if the API is momentarily down, so a
      // broken API doesn't take down all redirects.
      return cache.items
    }
    const body = (await res.json()) as
      | { data: Redirect[] }
      | Redirect[]
    const items = Array.isArray(body)
      ? (body as Redirect[])
      : (body.data ?? [])
    cache = { fetchedAt: now, items }
    return items
  } catch {
    return cache.items
  }
}

// Paths that must never be redirected OR locale-rewritten. Matches the
// API validation to guarantee consistency — if a row somehow made it into
// the DB (e.g. via a lax migration or direct SQL), we still won't apply it.
// Also covers feed/route-handler paths that ship XML/plain-text and have
// no locale concept.
const EXCLUDED_PREFIXES = ['/_next', '/api', '/admin', '/fonts', '/uploads', '/amp', '/v3-preview', '/v3-preview-b', '/v3-preview-c']

const EXCLUDED_EXACT = new Set([
  '/favicon.ico',
  '/robots.txt',
  '/llms.txt',
  '/sitemap.xml',
  '/yml.xml',
  '/turbo.xml',
])

function isExcluded(path: string): boolean {
  if (EXCLUDED_EXACT.has(path)) return true
  return EXCLUDED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  )
}

function firstSegment(pathname: string): string {
  // `/foo/bar` -> 'foo'; `/` -> ''
  const idx = pathname.indexOf('/', 1)
  return idx === -1 ? pathname.slice(1) : pathname.slice(1, idx)
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname
  if (isExcluded(path)) {
    return NextResponse.next()
  }

  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001'
  const redirects = await getRedirects(base)
  const match = redirects.find((r) => r.fromPath === path)
  if (match) {
    // Fire-and-forget. We intentionally don't await — the redirect response
    // should ship with minimal TTFB; the counter POST is best-effort.
    fetch(`${base}/api/public/redirects/${match.id}/hit`, {
      method: 'POST',
    }).catch(() => {
      // swallow: counters are a soft signal, not correctness
    })

    const targetUrl = /^https?:\/\//i.test(match.toPath)
      ? match.toPath
      : new URL(match.toPath, req.nextUrl.origin).toString()
    return NextResponse.redirect(targetUrl, match.statusCode)
  }

  // Locale routing. If the URL already starts with a supported locale
  // segment, let Next's [locale] route match it directly. Otherwise
  // rewrite internally to the default locale so the user's address bar
  // stays clean for RU.
  const seg = firstSegment(path)
  if (isLocale(seg)) {
    return NextResponse.next()
  }

  const url = req.nextUrl.clone()
  url.pathname = `/${DEFAULT_LOCALE}${path === '/' ? '' : path}` || `/${DEFAULT_LOCALE}`
  if (url.pathname === '') url.pathname = `/${DEFAULT_LOCALE}`
  return NextResponse.rewrite(url)
}

export const config = {
  // Exclude Next internals, API proxying, admin panel, uploaded static
  // files, bundled font assets, AMP variant routes, and root-level feeds
  // (robots/sitemap/yml/turbo/llms). Everything else is public,
  // localizable, and potentially redirect-targeted.
  matcher: [
    '/((?!_next|api|admin|fonts|uploads|amp|v3-preview-c|v3-preview-b|v3-preview|favicon\\.ico|robots\\.txt|llms\\.txt|sitemap\\.xml|yml\\.xml|turbo\\.xml).*)',
  ],
}

// Exported for tests — lets them reset the module cache between cases.
export function __resetCache() {
  cache = { fetchedAt: 0, items: [] }
}
