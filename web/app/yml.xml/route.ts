import {
  getPublicSettings,
  listCategories,
  listPublishedProducts,
  type ProductWithCategories,
} from '@/lib/api'
import { siteUrl } from '@/lib/metadata'
import { generateYmlXml } from '@/lib/ymlFeed'

// Cache the feed for 1 hour. Yandex polls this endpoint; regenerating on
// every hit would hammer the API. Phase 9 will add admin-triggered
// invalidation; for now ISR is acceptable.
export const revalidate = 3600

export async function GET(): Promise<Response> {
  try {
    // Fetch products with category ids, the full category tree, and public
    // settings in parallel. The list cap matches the sitemap's generous
    // limit so catalog growth doesn't silently truncate the feed.
    const [productsResp, categoriesResp, settings] = await Promise.all([
      listPublishedProducts({ limit: 5000, include: 'categories' }),
      listCategories({ limit: 500 }),
      getPublicSettings(),
    ])

    const xml = generateYmlXml({
      // The augmented list endpoint returns products with `categoryIds`;
      // the generator type narrows on that optional field, so the cast
      // here is safe for any subset we retrieved.
      products: productsResp.data as ProductWithCategories[],
      categories: categoriesResp.data,
      settings,
      siteUrl: siteUrl(),
    })

    return new Response(xml, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch {
    // Degrade to a minimal but valid feed rather than a 500 — the crawler
    // retries hourly and a transient API outage shouldn't drop us from
    // search results.
    const fallback = generateYmlXml({
      products: [],
      categories: [],
      settings: {
        ymlShopName: null,
        ymlCompany: null,
        ymlUrl: null,
        ymlCurrency: 'RUB',
        ymlDeliveryNote: null,
      },
      siteUrl: siteUrl(),
    })
    return new Response(fallback, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    })
  }
}
