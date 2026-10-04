import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, within } from '@testing-library/react'
import type { Product, ProductCategory } from '@ximi4ka-shop/shared'

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
  listCategories: vi.fn(),
}))

import ProductPage, { generateMetadata, generateStaticParams, revalidate } from './page'
import { getPublishedProduct, listCategories, listPublishedProducts } from '@/lib/api'

describe('ProductPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    cleanup()
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
        params: Promise.resolve({ locale: 'ru', slug: 'kit' }),
      })

      expect(meta.title).toBe('Custom SEO Title — Химичка')
      expect(meta.description).toBe('Custom SEO description')
      expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/product/kit')
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
        params: Promise.resolve({ locale: 'ru', slug: 'kit' }),
      })
      expect(meta.title).toBe('Kit — Химичка')
    })

    it('режет длинный shortDescription до 160 символов без HTML', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Kit',
        shortDescription: `<p>${Array.from({ length: 60 }, () => 'слово').join(' ')}</p>`,
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
        params: Promise.resolve({ locale: 'ru', slug: 'kit' }),
      })
      expect(meta.description).toMatch(/^(слово )+слово…$/)
      expect(meta.description!.length).toBeLessThanOrEqual(160)
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
        params: Promise.resolve({ locale: 'ru', slug: 'kit' }),
      })
      expect(meta.other).toEqual({
        amphtml: 'https://new.ximi4ka.ru/amp/product/kit',
      })
    })

    it('returns a safe fallback when the product fetch fails', async () => {
      vi.mocked(getPublishedProduct).mockRejectedValue(new Error('down'))
      const meta = await generateMetadata({
        params: Promise.resolve({ locale: 'ru', slug: 'missing' }),
      })
      expect(meta.title).toBe('Товар — Химичка')
    })

    it('uses the EN translation for title + meta when locale=en', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Набор',
        shortDescription: 'Короткое описание',
        longDescriptionBlocks: [],
        priceRub: 100,
        compareAtPriceRub: null,
        stockStatus: 'in_stock',
        isPublished: true,
        sortOrder: 0,
        metaTitle: 'RU meta',
        metaDescription: null,
        ogImage: null,
        canonicalUrl: null,
        noindex: false,
        translations: {
          en: { name: 'Kit', metaTitle: 'EN meta', metaDescription: 'EN desc' },
        },
        images: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      const meta = await generateMetadata({
        params: Promise.resolve({ locale: 'en', slug: 'kit' }),
      })
      expect(meta.title).toBe('EN meta — Химичка')
      expect(meta.description).toBe('EN desc')
      // Canonical for the EN variant is the /en-prefixed URL.
      expect(meta.alternates?.canonical).toBe('https://new.ximi4ka.ru/en/product/kit')
      // hreflang alternates include RU unprefixed, EN prefixed, x-default=RU.
      expect(meta.alternates?.languages).toEqual({
        ru: 'https://new.ximi4ka.ru/product/kit',
        en: 'https://new.ximi4ka.ru/en/product/kit',
        'x-default': 'https://new.ximi4ka.ru/product/kit',
      })
    })

    it('falls back to RU content when EN translation is missing', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue({
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Набор',
        shortDescription: 'Короткое',
        longDescriptionBlocks: [],
        priceRub: 100,
        compareAtPriceRub: null,
        stockStatus: 'in_stock',
        isPublished: true,
        sortOrder: 0,
        metaTitle: 'RU meta',
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
        params: Promise.resolve({ locale: 'en', slug: 'kit' }),
      })
      expect(meta.title).toBe('RU meta — Химичка')
    })
  })

  describe('breadcrumbs', () => {
    const product: Product = {
      id: 'p1',
      slug: 'kit',
      sku: 'K-1',
      name: 'Набор Кит',
      shortDescription: 'Короткое',
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
    }
    const category: ProductCategory = {
      id: 'c1',
      slug: 'nabory',
      name: 'Наборы',
      parentId: null,
      metaTitle: null,
      metaDescription: null,
      sortOrder: 0,
      translations: {},
    }
    const props = { params: Promise.resolve({ locale: 'ru', slug: 'kit' }) }

    function chain(container: HTMLElement) {
      const nav = within(container).getByRole('navigation', { name: 'breadcrumbs' })
      const visible = Array.from(nav.querySelectorAll('li')).map((li) =>
        (li.textContent ?? '').replace(/\/$/, '').trim(),
      )
      const ld = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => JSON.parse(s.textContent ?? '{}'))
        .find((d) => d['@type'] === 'BreadcrumbList')
      return { nav, visible, ld }
    }

    it('includes the primary category: Главная → Каталог → Категория → Товар', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue(product)
      vi.mocked(listPublishedProducts).mockResolvedValue({
        data: [{ ...product, categoryIds: ['c1'] } as Product],
        pagination: { limit: 100, offset: 0, total: 1 },
      })
      vi.mocked(listCategories).mockResolvedValue({
        data: [category],
        pagination: { limit: 100, offset: 0, total: 1 },
      })

      const { container } = render(await ProductPage(props))
      const { nav, visible, ld } = chain(container)

      expect(visible).toEqual(['Главная', 'Каталог', 'Наборы', 'Набор Кит'])
      expect(
        within(nav)
          .getAllByRole('link')
          .map((a) => a.getAttribute('href')),
      ).toEqual(['/', '/catalog', '/categories/nabory'])
      expect(ld.itemListElement.map((e: { name: string }) => e.name)).toEqual(visible)
      expect(ld.itemListElement[2].item).toBe('https://new.ximi4ka.ru/categories/nabory')
    })

    it('falls back to Главная → Каталог → Товар when the product has no category', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue(product)
      vi.mocked(listPublishedProducts).mockResolvedValue({
        data: [{ ...product, categoryIds: [] } as Product],
        pagination: { limit: 100, offset: 0, total: 1 },
      })
      vi.mocked(listCategories).mockResolvedValue({
        data: [category],
        pagination: { limit: 100, offset: 0, total: 1 },
      })

      const { container } = render(await ProductPage(props))
      const { visible, ld } = chain(container)

      expect(visible).toEqual(['Главная', 'Каталог', 'Набор Кит'])
      expect(ld.itemListElement.map((e: { name: string }) => e.name)).toEqual(visible)
    })

    it('falls back to the category-less chain when the category lookup fails', async () => {
      vi.mocked(getPublishedProduct).mockResolvedValue(product)
      vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
      vi.mocked(listCategories).mockRejectedValue(new Error('down'))

      const { container } = render(await ProductPage(props))

      expect(chain(container).visible).toEqual(['Главная', 'Каталог', 'Набор Кит'])
    })
  })
})
