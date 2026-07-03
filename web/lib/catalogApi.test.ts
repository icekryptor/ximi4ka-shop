import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listCategories: vi.fn(),
}))

import { fetchCatalog, densityForSlug, COMPACT_SLUGS } from './catalogApi'
import { listCategories, listPublishedProducts } from '@/lib/api'

function product(id: string, categoryIds: string[]) {
  return {
    id,
    slug: `p-${id}`,
    sku: id,
    name: `Product ${id}`,
    shortDescription: null,
    longDescriptionBlocks: [],
    priceRub: 100,
    compareAtPriceRub: null,
    stockStatus: 'in_stock' as const,
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
    categoryIds,
  }
}

function category(id: string, slug: string) {
  return {
    id,
    slug,
    name: slug,
    parentId: null,
    metaTitle: null,
    metaDescription: null,
    sortOrder: 0,
    translations: {},
  }
}

describe('densityForSlug', () => {
  it('maps kits/combo to kit density', () => {
    expect(densityForSlug('kits')).toBe('kit')
    expect(densityForSlug('combo')).toBe('kit')
  })
  it('maps reagents/equipment/print to compact density', () => {
    expect(densityForSlug('reagents')).toBe('compact')
    expect(densityForSlug('equipment')).toBe('compact')
    expect(densityForSlug('print')).toBe('compact')
    expect(COMPACT_SLUGS.has('reagents')).toBe(true)
  })
  it('defaults unknown slugs to kit density', () => {
    expect(densityForSlug('mystery')).toBe('kit')
  })
})

describe('fetchCatalog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups products by category, counts them, and orders kits before reagents', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [
        product('1', ['ck']),
        product('2', ['ck']),
        product('3', ['cr']),
      ],
      pagination: { limit: 1000, offset: 0, total: 3 },
    } as never)
    vi.mocked(listCategories).mockResolvedValue({
      data: [category('cr', 'reagents'), category('ck', 'kits')],
      pagination: { limit: 100, offset: 0, total: 2 },
    } as never)

    const { groups, counts, totalProducts } = await fetchCatalog()

    expect(totalProducts).toBe(3)
    expect(counts).toEqual({ ck: 2, cr: 1 })
    // kits group first despite reagents coming first in the API list
    expect(groups.map((g) => g.category.slug)).toEqual(['kits', 'reagents'])
    expect(groups[0].products).toHaveLength(2)
  })

  it('drops empty categories from the groups', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [product('1', ['ck'])],
      pagination: { limit: 1000, offset: 0, total: 1 },
    } as never)
    vi.mocked(listCategories).mockResolvedValue({
      data: [category('ck', 'kits'), category('empty', 'print')],
      pagination: { limit: 100, offset: 0, total: 2 },
    } as never)

    const { groups } = await fetchCatalog()
    expect(groups.map((g) => g.category.slug)).toEqual(['kits'])
  })

  it('degrades to an empty catalog when the API is down', async () => {
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listCategories).mockRejectedValue(new Error('down'))

    const { groups, counts, totalProducts } = await fetchCatalog()
    expect(groups).toEqual([])
    expect(counts).toEqual({})
    expect(totalProducts).toBe(0)
  })
})
