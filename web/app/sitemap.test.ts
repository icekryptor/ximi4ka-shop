import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listCategories: vi.fn(),
  listPages: vi.fn(),
}))

import sitemap from './sitemap'
import { listCategories, listPages, listPublishedProducts } from '@/lib/api'

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

    const out = await sitemap()
    const urls = out.map((e) => e.url)

    expect(urls).toContain('https://shop.ximi4ka.ru/')
    expect(urls).toContain('https://shop.ximi4ka.ru/categories')
    expect(urls).toContain('https://shop.ximi4ka.ru/categories/himicheskie-nabory')
    expect(urls).toContain('https://shop.ximi4ka.ru/product/nabor-yunogo-himika')
    expect(urls).toContain('https://shop.ximi4ka.ru/o-nas')
    // `home` CMS slug is NOT emitted as /home — it lives at `/`.
    expect(urls).not.toContain('https://shop.ximi4ka.ru/home')
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

    const out = await sitemap()
    // Home entry.
    const home = out.find((e) => e.url === 'https://shop.ximi4ka.ru/')
    expect(home?.alternates?.languages).toEqual({
      ru: 'https://shop.ximi4ka.ru/',
      en: 'https://shop.ximi4ka.ru/en',
    })
    // Product entry.
    const product = out.find(
      (e) => e.url === 'https://shop.ximi4ka.ru/product/kit',
    )
    expect(product?.alternates?.languages).toEqual({
      ru: 'https://shop.ximi4ka.ru/product/kit',
      en: 'https://shop.ximi4ka.ru/en/product/kit',
    })
  })

  it('degrades to an empty-but-valid sitemap when the API is down', async () => {
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listCategories).mockRejectedValue(new Error('down'))
    vi.mocked(listPages).mockRejectedValue(new Error('down'))

    const out = await sitemap()
    const urls = out.map((e) => e.url)
    // Homepage + categories landing always ship, even if no data sourced.
    expect(urls).toContain('https://shop.ximi4ka.ru/')
    expect(urls).toContain('https://shop.ximi4ka.ru/categories')
    expect(out.length).toBe(2)
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
    process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.example.com'
    const out = await sitemap()
    expect(out[0].url).toBe('https://preview.example.com/')
  })
})
