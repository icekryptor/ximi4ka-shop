import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listPages: vi.fn(),
  listBlogPosts: vi.fn(),
}))

import { GET } from './route'
import { listPublishedProducts, listPages, listBlogPosts } from '@/lib/api'

describe('GET /turbo.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns RSS 2.0 with Turbo namespace and one item per product + CMS page + blog post', async () => {
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [
        {
          id: 'p1',
          slug: 'nabor',
          sku: null,
          name: 'Набор',
          shortDescription: 'Описание',
          longDescriptionBlocks: [],
          priceRub: 2490,
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
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
      ],
      pagination: { limit: 5000, offset: 0, total: 1 },
    })
    vi.mocked(listPages).mockResolvedValue({
      data: [
        {
          id: 'pg1',
          slug: 'o-nas',
          title: 'О нас',
          blocks: [{ type: 'paragraph', html: '<p>Hello</p>' }],
          metaTitle: null,
          metaDescription: null,
          ogImage: null,
          canonicalUrl: null,
          noindex: false,
          translations: {},
          isPublished: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
      ],
      pagination: { limit: 500, offset: 0, total: 1 },
    })
    vi.mocked(listBlogPosts).mockResolvedValue({
      data: [
        {
          id: 'bp1',
          slug: 'pochemu-plamya-sinee',
          title: 'Почему пламя синее',
          excerpt: 'Разбираем химию горения.',
          coverImageUrl: null,
          rubric: null,
          blocks: [],
          metaTitle: null,
          metaDescription: null,
          ogImage: null,
          canonicalUrl: null,
          noindex: false,
          translations: {},
          isPublished: true,
          publishedAt: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      ],
      pagination: { limit: 100, offset: 0, page: 1, total: 1 },
    })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/rss/)
    const body = await res.text()
    expect(body).toContain('<rss version="2.0"')
    expect(body).toContain('xmlns:turbo="http://turbo.yandex.ru"')
    expect(body).toContain('/product/nabor')
    expect(body).toContain('/o-nas')
    expect(body).toContain('/blog/pochemu-plamya-sinee')
  })

  it('degrades to empty RSS when the API throws', async () => {
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listPages).mockRejectedValue(new Error('down'))
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<rss version="2.0"')
    expect(body).not.toContain('<item ')
  })
})
