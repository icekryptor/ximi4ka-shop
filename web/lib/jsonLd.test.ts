import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Page, Product } from '@ximi4ka-shop/shared'
import {
  articleJsonLd,
  breadcrumbJsonLd,
  itemListJsonLd,
  organizationJsonLd,
  productJsonLd,
  websiteJsonLd,
} from './jsonLd'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'kit',
    sku: 'SKU-1',
    name: 'Kit',
    shortDescription: 'A cool kit',
    longDescriptionBlocks: [],
    priceRub: 1000,
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
    images: [
      { id: 'i1', productId: 'p1', url: 'https://cdn.example.com/a.jpg', alt: '', sortOrder: 0 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('JSON-LD helpers', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL
  })
  afterEach(() => {
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  })

  it('organizationJsonLd has schema.org context + Organization type', () => {
    const out = organizationJsonLd()
    expect(out['@context']).toBe('https://schema.org')
    expect(out['@type']).toBe('Organization')
    expect(out.name).toBe('Химичка')
    expect(out.alternateName).toBe('Ximi4ka')
    expect(out.url).toBe('https://new.ximi4ka.ru')
    // Файл логотипа должен существовать в web/public.
    expect(out.logo).toBe('https://new.ximi4ka.ru/logo-himichka.svg')
    expect(out.sameAs).toContain('https://t.me/ximi4kapublic')
  })

  it('websiteJsonLd has no SearchAction (there is no /search page)', () => {
    const out = websiteJsonLd()
    expect(out['@context']).toBe('https://schema.org')
    expect(out['@type']).toBe('WebSite')
    expect(out.name).toBe('Химичка')
    expect(out).not.toHaveProperty('potentialAction')
    expect(out.publisher).toEqual({ '@id': 'https://new.ximi4ka.ru/#organization' })
  })

  describe('breadcrumbJsonLd', () => {
    it('positions items starting at 1 and preserves absolute URLs', () => {
      const out = breadcrumbJsonLd([
        { name: 'Главная', href: '/' },
        { name: 'Каталог', href: '/catalog' },
        { name: 'Set', href: 'https://external.example.com/x' },
      ])
      expect(out['@context']).toBe('https://schema.org')
      expect(out['@type']).toBe('BreadcrumbList')
      expect(out.itemListElement).toHaveLength(3)
      expect(out.itemListElement[0]).toMatchObject({
        '@type': 'ListItem',
        position: 1,
        name: 'Главная',
        item: 'https://new.ximi4ka.ru/',
      })
      expect(out.itemListElement[1]).toMatchObject({
        position: 2,
        item: 'https://new.ximi4ka.ru/catalog',
      })
      // Already-absolute URLs passed through unchanged
      expect(out.itemListElement[2]).toMatchObject({
        position: 3,
        item: 'https://external.example.com/x',
      })
    })

    it('omits `item` for an element without href', () => {
      const out = breadcrumbJsonLd([{ name: 'Главная', href: '/' }, { name: 'Страница' }])
      expect(out.itemListElement[1]).toEqual({
        '@type': 'ListItem',
        position: 2,
        name: 'Страница',
      })
    })
  })

  describe('productJsonLd', () => {
    it('maps in_stock → InStock', () => {
      const out = productJsonLd(makeProduct({ stockStatus: 'in_stock' }))
      expect(out['@context']).toBe('https://schema.org')
      expect(out['@type']).toBe('Product')
      expect(out.offers).toMatchObject({
        '@type': 'Offer',
        priceCurrency: 'RUB',
        price: 1000,
        availability: 'https://schema.org/InStock',
      })
    })
    it('maps preorder → PreOrder', () => {
      const out = productJsonLd(makeProduct({ stockStatus: 'preorder' }))
      expect(out.offers.availability).toBe('https://schema.org/PreOrder')
    })
    it('maps out_of_stock → OutOfStock', () => {
      const out = productJsonLd(makeProduct({ stockStatus: 'out_of_stock' }))
      expect(out.offers.availability).toBe('https://schema.org/OutOfStock')
    })
    it('includes sku, description, image URLs and product canonical URL on the offer', () => {
      const out = productJsonLd(makeProduct())
      expect(out.name).toBe('Kit')
      expect(out.description).toBe('A cool kit')
      expect(out.sku).toBe('SKU-1')
      expect(out.image).toEqual(['https://cdn.example.com/a.jpg'])
      expect(out.offers.url).toBe('https://new.ximi4ka.ru/product/kit')
      expect(out.brand).toEqual({ '@type': 'Brand', name: 'Химичка' })
      expect(out.offers.itemCondition).toBe('https://schema.org/NewCondition')
    })
    it('turns root-relative upload paths into absolute image URLs', () => {
      const p = makeProduct()
      const out = productJsonLd({
        ...p,
        images: [{ ...p.images[0], url: '/uploads/kit.jpg' }],
      })
      expect(out.image).toEqual(['https://new.ximi4ka.ru/uploads/kit.jpg'])
    })
  })

  describe('itemListJsonLd', () => {
    it('gives each entry a 1-based position and absolute product URL', () => {
      const out = itemListJsonLd([
        makeProduct({ id: 'a', slug: 'a', name: 'A' }),
        makeProduct({ id: 'b', slug: 'b', name: 'B' }),
      ])
      expect(out['@context']).toBe('https://schema.org')
      expect(out['@type']).toBe('ItemList')
      expect(out.itemListElement).toEqual([
        {
          '@type': 'ListItem',
          position: 1,
          url: 'https://new.ximi4ka.ru/product/a',
          name: 'A',
        },
        {
          '@type': 'ListItem',
          position: 2,
          url: 'https://new.ximi4ka.ru/product/b',
          name: 'B',
        },
      ])
    })
  })

  describe('articleJsonLd', () => {
    it('emits Article with headline, dates, author + publisher', () => {
      const page: Page = {
        id: 'pg1',
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
        updatedAt: '2026-01-02T00:00:00.000Z',
      }
      const out = articleJsonLd(page)
      expect(out).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'О нас',
        datePublished: '2026-01-01T00:00:00.000Z',
        dateModified: '2026-01-02T00:00:00.000Z',
        author: { '@type': 'Organization', name: 'Химичка' },
        publisher: {
          '@type': 'Organization',
          name: 'Химичка',
          logo: { '@type': 'ImageObject', url: 'https://new.ximi4ka.ru/logo-himichka.svg' },
        },
      })
    })

    it('emits BlogPosting with description, absolute image and mainEntityOfPage', () => {
      const out = articleJsonLd(
        {
          title: 'Опыты для детей',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-02T00:00:00.000Z',
          description: 'Десять простых опытов',
          image: '/uploads/cover.jpg',
          url: '/blog/opyty',
        },
        'BlogPosting',
      )
      expect(out['@type']).toBe('BlogPosting')
      expect(out.description).toBe('Десять простых опытов')
      expect(out.image).toEqual(['https://new.ximi4ka.ru/uploads/cover.jpg'])
      expect(out.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': 'https://new.ximi4ka.ru/blog/opyty',
      })
    })

    it('prefers publishedAt over createdAt when set (blog posts)', () => {
      const out = articleJsonLd({
        title: 'Почему пламя синее',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z',
        publishedAt: '2026-06-01T00:00:00.000Z',
      })
      expect(out.headline).toBe('Почему пламя синее')
      expect(out.datePublished).toBe('2026-06-01T00:00:00.000Z')
      expect(out.dateModified).toBe('2026-06-02T00:00:00.000Z')
    })

    it('falls back to createdAt when publishedAt is null', () => {
      const out = articleJsonLd({
        title: 'Черновик',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        publishedAt: null,
      })
      expect(out.datePublished).toBe('2026-05-01T00:00:00.000Z')
    })
  })
})
