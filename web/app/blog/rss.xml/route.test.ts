import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listBlogPosts: vi.fn(),
}))

import { GET } from './route'
import { listBlogPosts } from '@/lib/api'

describe('GET /blog/rss.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid RSS 2.0 with one item per published post', async () => {
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
    expect(body).toContain('<rss version="2.0">')
    expect(body).toContain('/blog/pochemu-plamya-sinee')
    expect(body).toContain('<description>Разбираем химию горения.</description>')

    // Well-formed XML — Yandex/Google reject feeds that don't parse.
    const doc = new DOMParser().parseFromString(body, 'application/xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('item')).toHaveLength(1)
  })

  it('degrades to an empty feed when the API throws', async () => {
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<rss version="2.0">')
    expect(body).not.toContain('<item>')
  })
})
