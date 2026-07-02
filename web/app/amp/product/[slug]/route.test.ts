import { describe, it, expect, beforeEach, vi } from 'vitest'

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
}))

import { GET } from './route'
import { ApiError, getPublishedProduct } from '@/lib/api'

const req = new Request('https://new.ximi4ka.ru/amp/product/kit')

describe('GET /amp/product/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AMP HTML for a published product', async () => {
    vi.mocked(getPublishedProduct).mockResolvedValue({
      id: 'p1',
      slug: 'kit',
      sku: null,
      name: 'Kit',
      shortDescription: 'Desc',
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

    const res = await GET(req, { params: Promise.resolve({ slug: 'kit' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    const body = await res.text()
    expect(body).toContain('<html amp lang="ru">')
    expect(body).toContain(
      '<link rel="canonical" href="https://new.ximi4ka.ru/product/kit">',
    )
  })

  it('returns 404 when the product is not found', async () => {
    vi.mocked(getPublishedProduct).mockRejectedValue(
      new ApiError(404, 'product_not_found', 'nope'),
    )
    const res = await GET(req, { params: Promise.resolve({ slug: 'x' }) })
    expect(res.status).toBe(404)
  })
})
