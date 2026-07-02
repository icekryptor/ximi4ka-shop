import { listBlogPosts } from '@/lib/api'
import { siteUrl } from '@/lib/metadata'
import { generateBlogRss } from '@/lib/blogRss'

// Blog RSS 2.0. Polled by readers/aggregators — an hour of staleness is
// fine, mirroring /turbo.xml. NOTE: this path is excluded from the locale
// middleware (see middleware.ts) so it's served unprefixed like the other
// XML feeds.
export const revalidate = 3600

export async function GET(): Promise<Response> {
  try {
    // Public blog endpoint caps limit at 100 — plenty for a feed.
    const postsResp = await listBlogPosts({ limit: 100 })

    const xml = generateBlogRss({
      posts: postsResp.data,
      siteUrl: siteUrl(),
    })

    return new Response(xml, {
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  } catch {
    // Same degrade behavior as /turbo.xml — a valid-but-empty feed is
    // better than a 500 when the API is momentarily unreachable.
    const xml = generateBlogRss({
      posts: [],
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
