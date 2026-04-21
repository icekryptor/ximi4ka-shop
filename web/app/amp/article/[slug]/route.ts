import { ApiError, getPage } from '@/lib/api'
import { renderAmpArticle } from '@/lib/amp'
import { siteUrl } from '@/lib/metadata'

// AMP CMS page view. Mirrors the canonical /[slug] CMS page route.
export const revalidate = 60

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  // The `home` slug is reserved for `/` — don't expose an AMP variant at
  // /amp/article/home. Mirrors the sitemap's omission.
  if (slug === 'home') return new Response('Not found', { status: 404 })
  try {
    const page = await getPage(slug)
    const html = renderAmpArticle(page, siteUrl())
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return new Response('Not found', { status: 404 })
    }
    throw err
  }
}
