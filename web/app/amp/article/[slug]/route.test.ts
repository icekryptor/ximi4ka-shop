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
  getPage: vi.fn(),
}))

import { GET } from './route'
import { ApiError, getPage } from '@/lib/api'

const req = new Request('https://shop.ximi4ka.ru/amp/article/o-nas')

describe('GET /amp/article/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns AMP HTML for a CMS page', async () => {
    vi.mocked(getPage).mockResolvedValue({
      id: 'pg',
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
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const res = await GET(req, { params: Promise.resolve({ slug: 'o-nas' }) })
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<html amp lang="ru">')
    expect(body).toContain(
      '<link rel="canonical" href="https://shop.ximi4ka.ru/o-nas">',
    )
  })

  it('returns 404 for the reserved `home` slug', async () => {
    const res = await GET(req, { params: Promise.resolve({ slug: 'home' }) })
    expect(res.status).toBe(404)
    expect(getPage).not.toHaveBeenCalled()
  })

  it('returns 404 when the page is missing', async () => {
    vi.mocked(getPage).mockRejectedValue(
      new ApiError(404, 'page_not_found', 'nope'),
    )
    const res = await GET(req, { params: Promise.resolve({ slug: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
