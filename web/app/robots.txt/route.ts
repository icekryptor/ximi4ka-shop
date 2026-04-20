import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'

// Serve admin-edited robots.txt at the site root. Crawlers fetch /robots.txt
// directly (no /api prefix, no JSON envelope), so we proxy the plain-text
// endpoint on the API. Revalidated every 5 minutes — short enough that an
// admin edit propagates quickly, long enough that burst crawling doesn't hit
// the DB on every request.
export const revalidate = 300

// Safe fallback used if the API is unreachable. Keeps crawlers happy (returns
// 200 with a permissive default) rather than serving a 5xx that some bots
// interpret as "all disallowed".
const FALLBACK = 'User-agent: *\nAllow: /\n'

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(
      `${ADMIN_API_URL_SERVER}/api/public/settings/robots.txt`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) {
      return new Response(FALLBACK, {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    const text = await res.text()
    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return new Response(FALLBACK, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}
