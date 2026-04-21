import { describe, it, expect, beforeAll } from 'vitest'
import type { Page, Product } from '@ximi4ka-shop/shared'
import amphtmlValidator from 'amphtml-validator'
import { renderAmpArticle, renderAmpProduct } from './amp'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    slug: 'nabor',
    sku: null,
    name: 'Набор Юного Химика',
    shortDescription: 'Опыты для детей от 8 лет',
    longDescriptionBlocks: [
      { type: 'paragraph', html: '<p>Первый параграф.</p>' },
      {
        type: 'faq',
        items: [{ question: 'Безопасно?', answer: 'Да, под присмотром взрослого.' }],
      },
    ],
    priceRub: 2490,
    compareAtPriceRub: 2990,
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
      { id: 'i1', productId: 'p-1', url: 'https://cdn.example.com/a.jpg', alt: 'A', sortOrder: 0 },
      { id: 'i2', productId: 'p-1', url: 'https://cdn.example.com/b.jpg', alt: 'B', sortOrder: 1 },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...overrides,
  }
}

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'pg',
    slug: 'o-nas',
    title: 'О нас',
    blocks: [{ type: 'paragraph', html: '<p>Добро пожаловать.</p>' }],
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

// The amphtml-validator instance is expensive to load (downloads the
// spec). Share a single instance across every test in this file.
let validator: Awaited<ReturnType<typeof amphtmlValidator.getInstance>>

beforeAll(async () => {
  validator = await amphtmlValidator.getInstance()
}, 60_000)

describe('renderAmpProduct', () => {
  it('produces AMP-valid HTML for a typical product', () => {
    const html = renderAmpProduct(makeProduct(), 'https://shop.ximi4ka.ru')
    const result = validator.validateString(html)
    if (result.status !== 'PASS') {
      // Surface actual error lines when this fails so future breakage is
      // obvious in CI output instead of "status !== PASS".
      const msg = result.errors
        .map((e) => `${e.severity}: ${e.code} ${e.params?.join(' ') ?? ''}`)
        .join('\n')
      throw new Error(`AMP validation failed:\n${msg}`)
    }
    expect(result.status).toBe('PASS')
  })

  it('includes canonical link back to the non-AMP URL', () => {
    const html = renderAmpProduct(makeProduct(), 'https://shop.ximi4ka.ru')
    expect(html).toContain(
      '<link rel="canonical" href="https://shop.ximi4ka.ru/product/nabor">',
    )
  })

  it('emits the AMP runtime script and no other <script> except application/ld+json', () => {
    const html = renderAmpProduct(makeProduct(), 'https://shop.ximi4ka.ru')
    expect(html).toContain(
      '<script async src="https://cdn.ampproject.org/v0.js"></script>',
    )
    // No inline module scripts, no event handlers, no extra <script>.
    const scriptMatches = html.match(/<script/g) ?? []
    // Expect one runtime script and optionally the ld+json block (only
    // emitted when jsonLd is passed — currently not, so 1).
    expect(scriptMatches.length).toBeLessThanOrEqual(2)
  })

  it('uses <amp-img> and not <img> for product gallery', () => {
    const html = renderAmpProduct(makeProduct(), 'https://shop.ximi4ka.ru')
    expect(html).toContain('<amp-img')
    expect(html).not.toMatch(/<img\s/i)
  })
})

describe('renderAmpArticle', () => {
  it('produces AMP-valid HTML for a CMS page', () => {
    const html = renderAmpArticle(makePage(), 'https://shop.ximi4ka.ru')
    const result = validator.validateString(html)
    if (result.status !== 'PASS') {
      const msg = result.errors
        .map((e) => `${e.severity}: ${e.code} ${e.params?.join(' ') ?? ''}`)
        .join('\n')
      throw new Error(`AMP validation failed:\n${msg}`)
    }
    expect(result.status).toBe('PASS')
  })

  it('links canonical back to the CMS slug', () => {
    const html = renderAmpArticle(makePage(), 'https://shop.ximi4ka.ru')
    expect(html).toContain(
      '<link rel="canonical" href="https://shop.ximi4ka.ru/o-nas">',
    )
  })
})
