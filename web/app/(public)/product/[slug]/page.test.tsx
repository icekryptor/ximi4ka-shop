import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
  },
  getPublishedProduct: vi.fn(),
  listPublishedProducts: vi.fn(),
}))

import ProductPage, { generateMetadata, generateStaticParams, revalidate } from './page'
import { getPublishedProduct } from '@/lib/api'

describe('ProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  })

  it('is an async Server Component', () => {
    expect(ProductPage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })

  it('exports generateStaticParams as a function', () => {
    expect(typeof generateStaticParams).toBe('function')
  })

  describe('generateMetadata', () => {
    it('builds Metadata from admin-set SEO fields when present', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: 'K-1',
        name: 'Kit',
        shortDescription: 'Short',
        longDescriptionBlocks: [],
        priceRub: 100,
        compareAtPriceRub: null,
        stockStatus: 'in_stock',
        isPublished: true,
        sortOrder: 0,
        metaTitle: 'Custom SEO Title',
        metaDescription: 'Custom SEO description',
        ogImage: 'https://cdn.example.com/og.jpg',
        canonicalUrl: null,
        noindex: false,
        translations: {},
        images: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })

      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'kit' }),
      })

      expect(meta.title).toBe('Custom SEO Title')
      expect(meta.description).toBe('Custom SEO description')
      expect(meta.alternates?.canonical).toBe('https://shop.ximi4ka.ru/product/kit')
      expect(meta.openGraph?.images).toEqual([{ url: 'https://cdn.example.com/og.jpg' }])
    })

    it('falls back to product name when metaTitle is empty', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Kit',
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
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'kit' }),
      })
      expect(meta.title).toBe('Kit')
    })

    it('links the AMP variant via other.amphtml', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Kit',
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
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'kit' }),
      })
      expect(meta.other).toEqual({
        amphtml: 'https://shop.ximi4ka.ru/amp/product/kit',
      })
    })

    it('returns a safe fallback when the product fetch fails', async () => {
      vi.mocked(getPublishedProduct).mockRejectedValue(new Error('down'))
      const meta = await generateMetadata({
        params: Promise.resolve({ slug: 'missing' }),
      })
      expect(meta.title).toBe('Товар — Ximi4ka')
    })
  })
})
