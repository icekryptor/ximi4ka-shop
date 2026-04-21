import { ApiError, getPublishedProduct } from '@/lib/api'
import { renderAmpProduct } from '@/lib/amp'
import { siteUrl } from '@/lib/metadata'

// AMP product view. Mirrors the canonical /product/[slug] but serves the
// hand-authored AMP-valid HTML string instead of React output.
//
// revalidate matches the canonical page (60s) — Yandex/Google may crawl
// the AMP URL independently, so we want the two to stay in step.
export const revalidate = 60

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params
  try {
    const product = await getPublishedProduct(slug)
    const html = renderAmpProduct(product, siteUrl())
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
