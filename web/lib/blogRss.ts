import type { BlogPost } from '@ximi4ka-shop/shared'
import { escapeXml } from './ymlFeed'

// Plain RSS 2.0 feed for the blog (readers + aggregators; the Yandex Turbo
// variant lives in turbo.ts). One <item> per published post: title, link,
// description = excerpt, RFC 822 pubDate, guid = canonical URL.

interface BlogRssInput {
  posts: BlogPost[]
  siteUrl: string
  channel?: {
    title?: string
    description?: string
    language?: string
  }
}

// RFC 822 date for RSS 2.0. Date.toUTCString() already emits that format.
function rfc822(date: Date): string {
  return date.toUTCString()
}

export function generateBlogRss(input: BlogRssInput): string {
  const {
    posts,
    siteUrl,
    channel = {
      title: 'Блог Ximi4ka',
      description: 'Статьи о химии, опытах и наборах Ximi4ka',
      language: 'ru',
    },
  } = input

  const items = posts.map((post) => {
    const url = `${siteUrl}/blog/${post.slug}`
    // publishedAt is the editorial publish date; createdAt only covers
    // legacy rows that predate the field.
    const pubDate = rfc822(new Date(post.publishedAt ?? post.createdAt))
    const excerpt = post.excerpt?.trim() ?? ''
    return [
      `    <item>`,
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      excerpt ? `      <description>${escapeXml(excerpt)}</description>` : '',
      `      <pubDate>${pubDate}</pubDate>`,
      `      <guid>${escapeXml(url)}</guid>`,
      `    </item>`,
    ]
      .filter(Boolean)
      .join('\n')
  })

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0">`,
    `  <channel>`,
    `    <title>${escapeXml(channel.title ?? 'Блог Ximi4ka')}</title>`,
    `    <link>${escapeXml(`${siteUrl}/blog`)}</link>`,
    `    <description>${escapeXml(channel.description ?? '')}</description>`,
    `    <language>${escapeXml(channel.language ?? 'ru')}</language>`,
    ...items,
    `  </channel>`,
    `</rss>`,
  ].join('\n')
}
