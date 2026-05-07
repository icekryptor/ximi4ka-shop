import { describe, it, expect, vi } from 'vitest'

// Mock @/lib/api so the page module can be imported without a live API and
// so the drift test below has a deterministic "DB" to query. The `known` set
// mirrors the slugs we expect to exist in the production DB; if a flagship
// is added to SITE_CATALOG with a slug outside this set, the drift test
// fails — forcing the contributor to either fix the slug or update both
// this mirror AND the DB seed.
vi.mock('@/lib/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getPublishedProduct: vi.fn().mockImplementation((slug: string) => {
      const known = new Set([
        'himichka-30',
        'mini-himichka',
        'elektrohimichka',
      ])
      if (known.has(slug)) {
        return Promise.resolve({
          id: 'mock',
          slug,
          sku: 'X',
          name: 'X',
          shortDescription: null,
          longDescriptionBlocks: [],
          priceRub: 0,
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
          createdAt: '',
          updatedAt: '',
        })
      }
      return Promise.reject(new Error(`Slug "${slug}" not found in mock DB`))
    }),
  }
})

import HomePage, { revalidate } from './page'

describe('HomePage', () => {
  it('is an async Server Component', () => {
    // HomePage fetches data, so it must be declared `async`.
    expect(HomePage.constructor.name).toBe('AsyncFunction')
  })

  it('enables ISR with a 60-second revalidate window', () => {
    expect(revalidate).toBe(60)
  })
})

describe('SITE_CATALOG drift', () => {
  it('every flagship slug resolves to a published mock product', async () => {
    const { SITE_CATALOG } = await import('./page')
    const { getPublishedProduct } = await import('@/lib/api')
    for (const entry of SITE_CATALOG) {
      const product = await getPublishedProduct(entry.slug).catch(() => null)
      expect(
        product,
        `Slug "${entry.slug}" did not resolve in the mock DB — either fix the slug in SITE_CATALOG or update the \`known\` set in this test file (and seed the DB).`,
      ).not.toBeNull()
    }
  })
})
