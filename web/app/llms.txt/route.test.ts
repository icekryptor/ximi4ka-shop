import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listCategories: vi.fn(),
  listPages: vi.fn(),
  listBlogPosts: vi.fn(),
}))

import { GET } from './route'
import { listBlogPosts, listCategories, listPages, listPublishedProducts } from '@/lib/api'

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
const fetchMock = vi.fn()

function settingsText(text: string) {
  fetchMock.mockResolvedValue(new Response(text, { status: 200 }))
}

function catalogOk() {
  vi.mocked(listCategories).mockResolvedValue({
    data: [
      {
        id: 'c',
        slug: 'nabory',
        name: 'Наборы',
        parentId: null,
        metaTitle: null,
        metaDescription: null,
        sortOrder: 0,
        translations: {},
      },
    ],
    pagination: { limit: 100, offset: 0, total: 1 },
  })
  vi.mocked(listPublishedProducts).mockResolvedValue({
    data: [],
    pagination: { limit: 200, offset: 0, total: 0 },
  })
  vi.mocked(listPages).mockResolvedValue({
    data: [],
    pagination: { limit: 1000, offset: 0, total: 0 },
  })
  vi.mocked(listBlogPosts).mockResolvedValue({
    data: [],
    pagination: { limit: 100, offset: 0, page: 1, total: 0 },
  })
}

describe('GET /llms.txt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test'
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (ORIGINAL_SITE_URL != null) process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
    else delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('serves manual text as is and does not touch the catalog', async () => {
    settingsText('# Вручную\n\nТекст из админки')
    const res = await GET()
    expect(await res.text()).toBe('# Вручную\n\nТекст из админки')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(listPublishedProducts).not.toHaveBeenCalled()
  })

  it('generates the file when the manual text is empty', async () => {
    settingsText('  \n')
    catalogOk()
    const res = await GET()
    const body = await res.text()
    expect(body.startsWith('# Химичка\n\n> ')).toBe(true)
    expect(body).toContain('- [Наборы](https://example.test/categories/nabory)')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600')
  })

  it('caps the catalog requests', async () => {
    settingsText('')
    catalogOk()
    await GET()
    expect(listPublishedProducts).toHaveBeenCalledWith({ limit: 200 })
    expect(listBlogPosts).toHaveBeenCalledWith({ limit: 100 })
  })

  it('falls back to the minimal file when the API is down', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    vi.mocked(listCategories).mockRejectedValue(new Error('down'))
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listPages).mockRejectedValue(new Error('down'))
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body.startsWith('# Химичка\n\n> ')).toBe(true)
    expect(body).toContain('https://example.test')
    expect(body).not.toContain('## ')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
  })

  it('keeps sections that loaded when one request fails', async () => {
    settingsText('')
    catalogOk()
    vi.mocked(listBlogPosts).mockRejectedValue(new Error('down'))
    const res = await GET()
    const body = await res.text()
    expect(body).toContain('## Каталог')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=60')
  })
})
