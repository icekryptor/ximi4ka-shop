import { describe, it, expect } from 'vitest'
import type { BlogPost, Page, Product } from '@ximi4ka-shop/shared'
import { generateTurboRss } from './turbo'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    slug: 'nabor',
    sku: null,
    name: 'Набор',
    shortDescription: 'Короткое описание',
    longDescriptionBlocks: [],
    priceRub: 2490,
    compareAtPriceRub: null,
    stockStatus: 'in_stock',
    isPublished: true,
    sortOrder: 0,
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  }
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'pg-1',
    slug: 'o-nas',
    title: 'О нас',
    blocks: [],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  }
}

function makeBlogPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'bp-1',
    slug: 'pochemu-plamya-sinee',
    title: 'Почему пламя синее',
    excerpt: 'Разбираем химию горения.',
    coverImageUrl: null,
    rubric: 'Опыты',
    blocks: [{ type: 'paragraph', html: '<p>Ионы меди красят пламя.</p>' }],
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

describe('generateTurboRss', () => {
  it('emits RSS 2.0 with Turbo namespace', () => {
    const xml = generateTurboRss({
      products: [],
      pages: [],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('xmlns:turbo="http://turbo.yandex.ru"')
    expect(xml).toContain('xmlns:yandex="http://news.yandex.ru"')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('<title>Ximi4ka</title>')
    expect(xml).toContain('<link>https://new.ximi4ka.ru</link>')
    expect(xml).toContain('<language>ru</language>')
  })

  it('emits one <item> per product with turbo content wrapped in CDATA', () => {
    const xml = generateTurboRss({
      products: [makeProduct()],
      pages: [],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<item turbo="true">')
    expect(xml).toContain('<link>https://new.ximi4ka.ru/product/nabor</link>')
    expect(xml).toContain('<turbo:content><![CDATA[')
    expect(xml).toContain('<header><h1>Набор</h1></header>')
    expect(xml).toContain('2')
    expect(xml).toContain('₽')
    expect(xml).toContain('<p>Короткое описание</p>')
  })

  it('renders paragraph and FAQ blocks for CMS pages and skips unsupported block types', () => {
    const xml = generateTurboRss({
      products: [],
      pages: [
        makePage({
          slug: 'about',
          title: 'About',
          blocks: [
            { type: 'paragraph', html: '<p>Hello <strong>world</strong></p>' },
            {
              type: 'faq',
              items: [{ question: 'Q1?', answer: 'A1' }],
            },
            // Unsupported block types should be silently skipped.
            { type: 'video', provider: 'youtube', videoId: 'abc' },
            { type: 'gallery', images: [] },
          ],
        }),
      ],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<link>https://new.ximi4ka.ru/about</link>')
    expect(xml).toContain('<p>Hello world</p>')
    expect(xml).toContain('<details><summary>Q1?</summary>')
    expect(xml).toContain('<p>A1</p>')
  })

  it('skips the home CMS page (served at `/`, not `/home`)', () => {
    const xml = generateTurboRss({
      products: [],
      pages: [makePage({ slug: 'home' }), makePage({ slug: 'dostavka' })],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).not.toContain('new.ximi4ka.ru/home')
    expect(xml).toContain('new.ximi4ka.ru/dostavka')
  })

  it('emits one <item> per blog post with excerpt + paragraph blocks', () => {
    const xml = generateTurboRss({
      products: [],
      pages: [],
      posts: [makeBlogPost()],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain(
      '<link>https://new.ximi4ka.ru/blog/pochemu-plamya-sinee</link>',
    )
    expect(xml).toContain('<title>Почему пламя синее</title>')
    expect(xml).toContain('<header><h1>Почему пламя синее</h1></header>')
    expect(xml).toContain('<p>Разбираем химию горения.</p>')
    expect(xml).toContain('<p>Ионы меди красят пламя.</p>')
    // pubDate comes from publishedAt (RFC 822).
    expect(xml).toContain(
      `<pubDate>${new Date('2026-06-01T00:00:00.000Z').toUTCString()}</pubDate>`,
    )
  })

  it('stays backward-compatible when posts are omitted', () => {
    const xml = generateTurboRss({
      products: [makeProduct()],
      pages: [makePage()],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('/product/nabor')
    expect(xml).toContain('/o-nas')
  })

  it('escapes product titles with XML special chars', () => {
    const xml = generateTurboRss({
      products: [makeProduct({ name: 'Foo & <Bar>' })],
      pages: [],
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<title>Foo &amp; &lt;Bar&gt;</title>')
    // And inside the turbo content block:
    expect(xml).toContain('<h1>Foo &amp; &lt;Bar&gt;</h1>')
  })
})
