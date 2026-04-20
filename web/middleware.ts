import { NextResponse, type NextRequest } from 'next/server'

// Public redirect middleware.
//
// Fetches the full redirect table from the API at the first request, caches
// it in module scope for 60s, and on each match issues a Location redirect
// with the configured status code. A fire-and-forget POST to the hit-counter
// endpoint is dispatched so we can see which redirects are active without
// instrumenting every edge invocation.
//
// Deliberately light-weight:
//   * No DB access from the edge runtime; we proxy through the API.
//   * No per-request auth; the list and hit endpoints are public.
//   * The matcher config below excludes /_next, /api, /admin, /uploads —
//     redirecting those would either never fire or break the admin panel.
//     We ALSO re-check inside the function body, because matchers use
//     lookahead regex that can behave slightly differently across Next
//     versions, and we'd rather be safe than route an admin page into a
//     user-created loop.

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

// Paths that must never be redirected, regardless of any DB row. Matches the
// API validation to guarantee consistency — if a row somehow made it into
// the DB (e.g. via a lax migration or direct SQL), we still won't apply it.
const EXCLUDED_PREFIXES = ['/_next', '/api', '/admin', '/uploads']

function isExcluded(path: string): boolean {
  if (path === '/favicon.ico') return true
  return EXCLUDED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  )
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
  if (!match) return NextResponse.next()

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

export const config = {
  // Exclude Next internals, API proxying, admin panel, and uploaded static
  // files from middleware processing.
  matcher: ['/((?!_next|api|admin|uploads|favicon.ico).*)'],
}

// Exported for tests — lets them reset the module cache between cases.
export function __resetCache() {
  cache = { fetchedAt: 0, items: [] }
}
