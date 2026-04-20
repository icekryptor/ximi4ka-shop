import { ADMIN_API_URL_SERVER } from '@/lib/adminAuth'

// Serve admin-edited llms.txt at the site root. Mirrors the robots.txt handler
// but returns an empty body on failure (llms.txt is opt-in; there is no
// sensible "default" content to serve).
export const revalidate = 300

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(
      `${ADMIN_API_URL_SERVER}/api/public/settings/llms.txt`,
      { next: { revalidate: 300 } },
    )
    if (!res.ok) {
      return new Response('', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    const text = await res.text()
    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return new Response('', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}
