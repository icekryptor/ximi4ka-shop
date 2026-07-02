import { describe, it, expect } from 'vitest'
import type { ProductCategory } from '@ximi4ka-shop/shared'
import {
  escapeXml,
  formatYmlDate,
  generateYmlXml,
  type ProductWithCategoryIds,
} from './ymlFeed'

const baseSettings = {
  ymlShopName: 'Ximi4ka',
  ymlCompany: 'Ximi4ka LLC',
  ymlUrl: 'https://ximi4ka.ru',
  ymlCurrency: 'RUB' as const,
  ymlDeliveryNote: null,
}

function makeProduct(overrides: Partial<ProductWithCategoryIds> = {}): ProductWithCategoryIds {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'nabor',
    sku: null,
    name: 'Набор',
    shortDescription: null,
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
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    categoryIds: [],
    ...overrides,
  }
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return {
    id: 'cat-1',
    slug: 'kits',
    name: 'Наборы',
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
    ...overrides,
  }
}

describe('escapeXml', () => {
  it('escapes the five predefined XML entities', () => {
    expect(escapeXml('<a href="x">&y</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;',
    )
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('leaves non-special characters untouched', () => {
    expect(escapeXml('Набор Юного Химика — 2 490 ₽')).toBe(
      'Набор Юного Химика — 2 490 ₽',
    )
  })
})

describe('formatYmlDate', () => {
  it('produces YYYY-MM-DD HH:mm in UTC', () => {
    const d = new Date('2026-04-20T09:07:00Z')
    expect(formatYmlDate(d)).toBe('2026-04-20 09:07')
  })
})

describe('generateYmlXml — structure', () => {
  it('includes the required yml_catalog, shop, currencies, categories, offers tags', () => {
    const xml = generateYmlXml({
      products: [makeProduct({ categoryIds: ['cat-1'] })],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
      now: new Date('2026-04-20T09:07:00Z'),
    })
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">')
    expect(xml).toContain('<yml_catalog date="2026-04-20 09:07">')
    expect(xml).toContain('<shop>')
    expect(xml).toContain('<name>Ximi4ka</name>')
    expect(xml).toContain('<company>Ximi4ka LLC</company>')
    expect(xml).toContain('<url>https://ximi4ka.ru</url>')
    expect(xml).toContain('<currencies>')
    expect(xml).toContain('<currency id="RUB" rate="1"/>')
    expect(xml).toContain('<categories>')
    expect(xml).toContain('<offers>')
    expect(xml).toMatch(/<\/yml_catalog>\s*$/)
  })

  it('falls back to default shop name and siteUrl when settings are missing', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: {
        ymlShopName: null,
        ymlCompany: null,
        ymlUrl: null,
        ymlCurrency: 'RUB',
        ymlDeliveryNote: null,
      },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<name>Ximi4ka</name>')
    expect(xml).toContain('<url>https://new.ximi4ka.ru</url>')
  })

  it('emits delivery-options when ymlDeliveryNote is set', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [],
      settings: { ...baseSettings, ymlDeliveryNote: 'Доставка 3-7 дней' },
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<delivery-options>')
    expect(xml).toContain('description="Доставка 3-7 дней"')
  })
})

describe('generateYmlXml — category mapping', () => {
  it('assigns sequential integer ids starting at 1', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [
        makeCategory({ id: 'uuid-a', name: 'A' }),
        makeCategory({ id: 'uuid-b', name: 'B' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<category id="1">A</category>')
    expect(xml).toContain('<category id="2">B</category>')
  })

  it('emits parentId attribute for nested categories', () => {
    const xml = generateYmlXml({
      products: [],
      categories: [
        makeCategory({ id: 'parent-uuid', name: 'Parent' }),
        makeCategory({ id: 'child-uuid', name: 'Child', parentId: 'parent-uuid' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<category id="1">Parent</category>')
    expect(xml).toContain('<category id="2" parentId="1">Child</category>')
  })
})

describe('generateYmlXml — offers', () => {
  it('maps the first product category uuid to the correct integer id', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({ id: 'p1', slug: 'p', categoryIds: ['cat-2', 'cat-1'] }),
      ],
      categories: [
        makeCategory({ id: 'cat-1', name: 'A' }),
        makeCategory({ id: 'cat-2', name: 'B' }),
      ],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    // cat-2 was the first linked category; should map to id=2.
    expect(xml).toContain('<categoryId>2</categoryId>')
  })

  it('marks in_stock as available="true" and out_of_stock as "false"', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-in',
          slug: 'p-in',
          stockStatus: 'in_stock',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-out',
          slug: 'p-out',
          stockStatus: 'out_of_stock',
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<offer id="p-in" available="true">')
    expect(xml).toContain('<offer id="p-out" available="false">')
  })

  it('skips products without a linked category', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({ id: 'p-orphan', slug: 'orphan', categoryIds: [] }),
        makeProduct({ id: 'p-ok', slug: 'ok', categoryIds: ['cat-1'] }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).not.toContain('id="p-orphan"')
    expect(xml).toContain('id="p-ok"')
  })

  it('uses canonicalUrl when present, falls back to siteUrl/product/slug', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-canon',
          slug: 'slug-a',
          canonicalUrl: 'https://ximi4ka.ru/special/a',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-fall',
          slug: 'slug-b',
          canonicalUrl: null,
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<url>https://ximi4ka.ru/special/a</url>')
    expect(xml).toContain('<url>https://new.ximi4ka.ru/product/slug-b</url>')
  })

  it('escapes product names with XML special chars', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          name: 'Rock & Roll <Edition>',
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<name>Rock &amp; Roll &lt;Edition&gt;</name>')
    expect(xml).not.toContain('<name>Rock & Roll <Edition></name>')
  })

  it('emits up to 10 pictures per offer', () => {
    const images = Array.from({ length: 12 }, (_, i) => ({
      id: `img-${i}`,
      productId: 'p',
      url: `https://cdn.example.com/${i}.jpg`,
      alt: `image ${i}`,
      sortOrder: i,
    }))
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          images,
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    const matches = xml.match(/<picture>/g) ?? []
    expect(matches.length).toBe(10)
    expect(xml).toContain('<picture>https://cdn.example.com/9.jpg</picture>')
    expect(xml).not.toContain('<picture>https://cdn.example.com/10.jpg</picture>')
  })

  it('uses shortDescription when available, else first paragraph plaintext', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p-short',
          slug: 'p-short',
          shortDescription: 'Краткое описание',
          categoryIds: ['cat-1'],
        }),
        makeProduct({
          id: 'p-para',
          slug: 'p-para',
          shortDescription: null,
          longDescriptionBlocks: [
            { type: 'paragraph', html: '<p>First <strong>para</strong></p>' },
            { type: 'paragraph', html: '<p>Second</p>' },
          ],
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    expect(xml).toContain('<description>Краткое описание</description>')
    expect(xml).toContain('<description>First para</description>')
  })

  it('omits description element when no text source is available', () => {
    const xml = generateYmlXml({
      products: [
        makeProduct({
          id: 'p',
          slug: 'p',
          shortDescription: null,
          longDescriptionBlocks: [],
          categoryIds: ['cat-1'],
        }),
      ],
      categories: [makeCategory()],
      settings: baseSettings,
      siteUrl: 'https://new.ximi4ka.ru',
    })
    // No <description> tag at all — legal YML, Yandex tolerates absence.
    expect(xml).not.toMatch(/<description>/)
  })
})
