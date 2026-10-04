import { describe, it, expect } from 'vitest'
import type { BlogPost, Page, Product, ProductCategory } from '@ximi4ka-shop/shared'
import { generateLlmsTxt } from './llmsTxt'

const BASE = 'https://example.test'

function product(over: Partial<Product>): Product {
  return {
    id: 'p',
    slug: 'p',
    sku: null,
    name: 'Товар',
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
    ...over,
  }
}

function category(over: Partial<ProductCategory>): ProductCategory {
  return {
    id: 'c',
    slug: 'c',
    name: 'Категория',
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
    ...over,
  }
}

function post(over: Partial<BlogPost>): BlogPost {
  return {
    id: 'b',
    slug: 'b',
    title: 'Статья',
    excerpt: null,
    coverImageUrl: null,
    rubric: null,
    authorName: null,
    authorJobTitle: null,
    authorBio: null,
    authorUrl: null,
    authorPhotoUrl: null,
    blocks: [],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: true,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function page(over: Partial<Page>): Page {
  return {
    id: 'g',
    slug: 'g',
    title: 'Страница',
    blocks: [],
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noindex: false,
    translations: {},
    isPublished: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const empty = { categories: [], products: [], posts: [], pages: [] }

describe('generateLlmsTxt', () => {
  it('starts with H1 and blockquote with the default site description', () => {
    const out = generateLlmsTxt({ siteUrl: BASE, ...empty })
    expect(out.startsWith('# Химичка\n\n> ')).toBe(true)
    expect(out).toContain('Химические наборы для детей и подростков. Научные эксперименты дома.')
  })

  it('omits sections without entries', () => {
    const out = generateLlmsTxt({ siteUrl: BASE, ...empty })
    expect(out).not.toContain('## ')
  })

  it('lists categories and products under "Каталог" with absolute links', () => {
    const out = generateLlmsTxt({
      siteUrl: BASE,
      ...empty,
      categories: [category({ slug: 'nabory', name: 'Наборы', metaDescription: 'Готовые наборы' })],
      products: [
        product({ slug: 'kit-1', name: 'Набор 1', shortDescription: 'Для\n  начинающих' }),
        product({ slug: 'kit-2', name: 'Набор 2' }),
      ],
    })
    expect(out).toContain('## Каталог')
    expect(out).toContain(`- [Наборы](${BASE}/categories/nabory): Готовые наборы`)
    expect(out).toContain(`- [Набор 1](${BASE}/product/kit-1): Для начинающих`)
    expect(out).toContain(`- [Набор 2](${BASE}/product/kit-2)\n`)
  })

  it('lists posts under "Блог" with excerpt', () => {
    const out = generateLlmsTxt({
      siteUrl: BASE,
      ...empty,
      posts: [post({ slug: 'a', title: 'Про кислоты', excerpt: 'Коротко' })],
    })
    expect(out).toContain('## Блог')
    expect(out).toContain(`- [Про кислоты](${BASE}/blog/a): Коротко`)
  })

  it('lists CMS pages under "Информация" except home', () => {
    const out = generateLlmsTxt({
      siteUrl: BASE,
      ...empty,
      pages: [
        page({ slug: 'home', title: 'Главная' }),
        page({ slug: 'oferta', title: 'Оферта', metaDescription: 'Условия' }),
      ],
    })
    expect(out).toContain('## Информация')
    expect(out).toContain(`- [Оферта](${BASE}/oferta): Условия`)
    expect(out).not.toContain('Главная')
  })

  it('skips noindex entries', () => {
    const out = generateLlmsTxt({
      siteUrl: BASE,
      ...empty,
      products: [product({ slug: 'x', name: 'Скрытый', noindex: true })],
      posts: [post({ slug: 'y', title: 'Скрытая', noindex: true })],
      pages: [page({ slug: 'z', title: 'Служебная', noindex: true })],
    })
    expect(out).not.toContain('Скрытый')
    expect(out).not.toContain('Скрытая')
    expect(out).not.toContain('Служебная')
    expect(out).not.toContain('## ')
  })

  it('caps products at 200 and posts at 100', () => {
    const products = Array.from({ length: 250 }, (_, i) =>
      product({ id: `p${i}`, slug: `p${i}`, name: `P${i}` }),
    )
    const posts = Array.from({ length: 150 }, (_, i) =>
      post({ id: `b${i}`, slug: `b${i}`, title: `B${i}` }),
    )
    const out = generateLlmsTxt({ siteUrl: BASE, ...empty, products, posts })
    expect(out.match(/\/product\//g)).toHaveLength(200)
    expect(out.match(/\/blog\//g)).toHaveLength(100)
  })

  it('escapes square brackets in link text and truncates long descriptions', () => {
    const out = generateLlmsTxt({
      siteUrl: BASE,
      ...empty,
      products: [product({ slug: 'a', name: 'Набор [мини]', shortDescription: 'я'.repeat(500) })],
    })
    expect(out).toContain('- [Набор \\[мини\\]](')
    const line = out.split('\n').find((l) => l.includes('/product/a')) ?? ''
    expect(line.length).toBeLessThan(300)
    expect(line.endsWith('…')).toBe(true)
  })
})
