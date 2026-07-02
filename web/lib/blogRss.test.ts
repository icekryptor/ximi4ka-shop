import { describe, it, expect } from 'vitest'
import type { BlogPost } from '@ximi4ka-shop/shared'
import { generateBlogRss } from './blogRss'

function makePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'bp-1',
    slug: 'pochemu-plamya-sinee',
    title: 'Почему пламя синее',
    excerpt: 'Разбираем химию горения.',
    coverImageUrl: null,
    rubric: 'Опыты',
    blocks: [],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: true,
    publishedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('generateBlogRss', () => {
  it('emits an RSS 2.0 channel with the blog link', () => {
    const xml = generateBlogRss({ posts: [], siteUrl: 'https://new.ximi4ka.ru' })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('<title>Блог Ximi4ka</title>')
    expect(xml).toContain('<link>https://new.ximi4ka.ru/blog</link>')
    expect(xml).toContain('<language>ru</language>')
  })

  it('emits one <item> per post with title/link/description/pubDate/guid', () => {
    const xml = generateBlogRss({
      posts: [makePost()],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<item>')
    expect(xml).toContain('<title>Почему пламя синее</title>')
    expect(xml).toContain(
      '<link>https://new.ximi4ka.ru/blog/pochemu-plamya-sinee</link>',
    )
    expect(xml).toContain('<description>Разбираем химию горения.</description>')
    expect(xml).toContain(
      `<pubDate>${new Date('2026-06-01T00:00:00.000Z').toUTCString()}</pubDate>`,
    )
    expect(xml).toContain(
      '<guid>https://new.ximi4ka.ru/blog/pochemu-plamya-sinee</guid>',
    )
  })

  it('falls back to createdAt when publishedAt is missing and omits empty description', () => {
    const xml = generateBlogRss({
      posts: [makePost({ publishedAt: null, excerpt: null })],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain(
      `<pubDate>${new Date('2026-05-01T00:00:00.000Z').toUTCString()}</pubDate>`,
    )
    // The channel keeps its description; the excerpt-less item omits its own.
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelector('item > description')).toBeNull()
  })

  it('escapes XML special characters in titles and excerpts', () => {
    const xml = generateBlogRss({
      posts: [makePost({ title: 'Foo & <Bar>', excerpt: 'A "b" & c' })],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<title>Foo &amp; &lt;Bar&gt;</title>')
    expect(xml).toContain('A &quot;b&quot; &amp; c')
  })

  it('produces well-formed XML parseable by DOMParser', () => {
    const xml = generateBlogRss({
      posts: [makePost(), makePost({ id: 'bp-2', slug: 'kristally', title: 'Кристаллы & соль' })],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('item')).toHaveLength(2)
    expect(doc.querySelector('channel > title')?.textContent).toBe(
      'Блог Ximi4ka',
    )
  })
})
