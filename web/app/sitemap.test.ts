import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listCategories: vi.fn(),
  listPages: vi.fn(),
  listBlogPosts: vi.fn(),
}))

import sitemap from './sitemap'
import {
  listBlogPosts,
  listCategories,
  listPages,
  listPublishedProducts,
} from '@/lib/api'

function emptyBlogResponse() {
  return {
    data: [],
    pagination: { limit: 100, offset: 0, page: 1, total: 0 },
  }
}

describe('sitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  })

  it('emits homepage + categories + products + CMS pages and skips home page', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [
        {
          id: 'p1',
          slug: 'nabor-yunogo-himika',
          sku: null,
          name: 'N',
          shortDescription: null,
          longDescriptionBlocks: [],
          priceRub: 100,
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
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      pagination: { limit: 1000, offset: 0, total: 1 },
    })
    vi.mocked(listCategories).mockResolvedValue({
      data: [
        {
          id: 'c1',
          slug: 'himicheskie-nabory',
          name: 'Kits',
          parentId: null,
          metaTitle: null,
          metaDescription: null,
          sortOrder: 0,
          translations: {},
        },
      ],
      pagination: { limit: 1000, offset: 0, total: 1 },
    })
    vi.mocked(listPages).mockResolvedValue({
      data: [
        {
          id: 'pg0',
          slug: 'home',
          title: 'Home',
          blocks: [],
          metaTitle: null,
          metaDescription: null,
          ogImage: null,
          canonicalUrl: null,
          noindex: false,
          translations: {},
          isPublished: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'pg1',
          slug: 'o-nas',
          title: 'About',
          blocks: [],
          metaTitle: null,
          metaDescription: null,
          ogImage: null,
          canonicalUrl: null,
          noindex: false,
          translations: {},
          isPublished: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
        },
      ],
      pagination: { limit: 1000, offset: 0, total: 2 },
    })
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [
        {
          id: 'bp1',
          slug: 'pochemu-plamya-sinee',
          title: 'Почему пламя синее',
          excerpt: null,
          coverImageUrl: null,
          rubric: null,
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
        },
      ],
      pagination: { limit: 100, offset: 0, page: 1, total: 1 },
    })

    const out = await sitemap()
    const urls = out.map((e) => e.url)

    expect(urls).toContain('https://new.ximi4ka.ru/')
    expect(urls).toContain('https://new.ximi4ka.ru/categories')
    expect(urls).toContain('https://new.ximi4ka.ru/categories/himicheskie-nabory')
    expect(urls).toContain('https://new.ximi4ka.ru/product/nabor-yunogo-himika')
    expect(urls).toContain('https://new.ximi4ka.ru/o-nas')
    // Blog: static listing entry + one per published post.
    expect(urls).toContain('https://new.ximi4ka.ru/blog')
    expect(urls).toContain('https://new.ximi4ka.ru/blog/pochemu-plamya-sinee')
    const post = out.find(
      (e) => e.url === 'https://new.ximi4ka.ru/blog/pochemu-plamya-sinee',
    )
    expect(post?.lastModified).toBe('2026-06-02T00:00:00.000Z')
    // `home` CMS slug is NOT emitted as /home — it lives at `/`.
    expect(urls).not.toContain('https://new.ximi4ka.ru/home')
  })

  it('emits hreflang alternates on every entry for ru + en', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [
        {
          id: 'p1',
          slug: 'kit',
          sku: null,
          name: 'N',
          shortDescription: null,
          longDescriptionBlocks: [],
          priceRub: 100,
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
          updatedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      pagination: { limit: 1000, offset: 0, total: 1 },
    })
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listPages).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listBlogPosts).mockResolvedValue(emptyBlogResponse())

    const out = await sitemap()
    // Home entry.
    const home = out.find((e) => e.url === 'https://new.ximi4ka.ru/')
    expect(home?.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/',
      en: 'https://new.ximi4ka.ru/en',
    })
    // Product entry.
    const product = out.find(
      (e) => e.url === 'https://new.ximi4ka.ru/product/kit',
    )
    expect(product?.alternates?.languages).toEqual({
      ru: 'https://new.ximi4ka.ru/product/kit',
      en: 'https://new.ximi4ka.ru/en/product/kit',
    })
  })

  it('degrades to an empty-but-valid sitemap when the API is down', async () => {
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listCategories).mockRejectedValue(new Error('down'))
    vi.mocked(listPages).mockRejectedValue(new Error('down'))
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))

    const out = await sitemap()
    const urls = out.map((e) => e.url)
    // Homepage + catalog + categories + blog landings always ship, even without data.
    expect(urls).toContain('https://new.ximi4ka.ru/')
    expect(urls).toContain('https://new.ximi4ka.ru/catalog')
    expect(urls).toContain('https://new.ximi4ka.ru/categories')
    expect(urls).toContain('https://new.ximi4ka.ru/blog')
    expect(out.length).toBe(4)
  })

  it('respects NEXT_PUBLIC_SITE_URL when set', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listCategories).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listPages).mockResolvedValue({
      data: [],
      pagination: { limit: 1000, offset: 0, total: 0 },
    })
    vi.mocked(listBlogPosts).mockResolvedValue(emptyBlogResponse())
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example.com'
    const out = await sitemap()
    expect(out[0].url).toBe('https://preview.example.com/')
  })
})
