import { listPages, listPublishedProducts } from '@/lib/api'
import { siteUrl } from '@/lib/metadata'
import { generateTurboRss } from '@/lib/turbo'

// Yandex Turbo RSS. Polled on a similar cadence to YML — an hour of
// staleness is acceptable and saves us from regenerating full-text HTML
// on every crawl hit.
export const revalidate = 3600

export async function GET(): Promise<Response> {
  try {
    const [productsResp, pagesResp] = await Promise.all([
      listPublishedProducts({ limit: 5000 }),
      listPages({ limit: 500 }),
    ])

    const xml = generateTurboRss({
      products: productsResp.data,
      pages: pagesResp.data,
      siteUrl: siteUrl(),
    })

    return new Response(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch {
    // Same degrade behavior as /yml.xml — a valid-but-empty feed is better
    // than a 500 when the API is momentarily unreachable.
    const xml = generateTurboRss({
      products: [],
      pages: [],
      siteUrl: siteUrl(),
    })
    return new Response(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    })
  }
}
