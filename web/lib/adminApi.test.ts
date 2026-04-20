import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminCreateCategory,
  adminCreatePage,
  adminCreateProduct,
  adminDeleteCategory,
  adminDeletePage,
  adminGetPage,
  adminListCategories,
  adminListPages,
  adminListProducts,
  adminPublishPage,
  adminUnpublishPage,
  adminUpdateCategory,
  adminUpdatePage,
  adminUploadImage,
  ApiError,
} from './adminApi'

// Tiny helper to make a Response-like object that fetch would produce.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('adminApi', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const origFetch = global.fetch

  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch
    // Seed a CSRF cookie so the client adds X-CSRF-Token on mutations.
    document.cookie = 'ximi4ka_shop_csrf=csrf-token-123'
    fetchMock.mockReset()
  })

  afterEach(() => {
    global.fetch = origFetch
    // Expire the cookie between tests; jsdom persists document.cookie
    // across tests otherwise.
    document.cookie = 'ximi4ka_shop_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('GET requests: no CSRF header, credentials: include', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
    )
    await adminListProducts()
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('mutations include X-CSRF-Token and credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { data: { id: 'x', slug: 'x', name: 'X', priceRub: 1 } }),
    )
    await adminCreateProduct({ slug: 'x', name: 'X', priceRub: 1 })
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(headers['content-type']).toBe('application/json')
  })

  it('parses a 400 error envelope into ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          code: 'validation_error',
          message: 'bad slug',
          details: [{ path: 'slug' }],
        },
      }),
    )
    await expect(adminCreateProduct({ slug: 'Bad', name: 'X', priceRub: 1 })).rejects.toMatchObject(
      {
        status: 400,
        code: 'validation_error',
        message: 'bad slug',
      },
    )
  })

  it('parses 409 slug_conflict', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'slug_conflict', message: 'dup' },
      }),
    )
    try {
      await adminCreateProduct({ slug: 'dup', name: 'X', priceRub: 1 })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe('slug_conflict')
    }
  })

  it('categories: list uses limit=200 and no CSRF header (GET)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 200, offset: 0, total: 0 },
      }),
    )
    await adminListCategories()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories?limit=200')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('categories: create sends POST with CSRF + JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        data: { id: 'c1', slug: 'c1', name: 'C1', parentId: null, sortOrder: 0 },
      }),
    )
    const result = await adminCreateCategory({ slug: 'c1', name: 'C1' })
    expect(result.id).toBe('c1')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(init?.body).toBe(JSON.stringify({ slug: 'c1', name: 'C1' }))
  })

  it('categories: update sends PATCH with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'c1', slug: 'c1', name: 'Renamed' } }),
    )
    await adminUpdateCategory('c1', { name: 'Renamed' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/categories/c1')
    expect(init?.method).toBe('PATCH')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('categories: delete surfaces 409 category_has_products', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'category_has_products', message: 'blocked' },
      }),
    )
    try {
      await adminDeleteCategory('c1')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe('category_has_products')
      expect((err as ApiError).status).toBe(409)
    }
  })

  it('pages: list forwards q + pagination, sends credentials, no CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
    )
    await adminListPages({ limit: 10, offset: 20, q: 'о нас' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/pages?')
    expect(String(url)).toContain('limit=10')
    expect(String(url)).toContain('offset=20')
    // URLSearchParams encodes Cyrillic as percent-escaped utf-8
    expect(String(url)).toContain('q=')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('pages: get by id returns unwrapped data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'p1', slug: 'home', title: 'Home' } }),
    )
    const page = await adminGetPage('p1')
    expect(page.id).toBe('p1')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/pages/p1')
  })

  it('pages: create sends POST with CSRF + JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        data: { id: 'p1', slug: 'home', title: 'Home' },
      }),
    )
    const result = await adminCreatePage({ slug: 'home', title: 'Home' })
    expect(result.id).toBe('p1')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(init?.body).toBe(JSON.stringify({ slug: 'home', title: 'Home' }))
  })

  it('pages: update sends PATCH with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'p1', slug: 'home', title: 'Renamed' } }),
    )
    await adminUpdatePage('p1', { title: 'Renamed' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/pages/p1')
    expect(init?.method).toBe('PATCH')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('pages: publish/unpublish POST with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'p1', isPublished: true } }),
    )
    await adminPublishPage('p1')
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/admin/pages/p1/publish',
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'p1', isPublished: false } }),
    )
    await adminUnpublishPage('p1')
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/admin/pages/p1/unpublish',
    )
  })

  it('pages: delete sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(adminDeletePage('p1')).resolves.toBeUndefined()
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('DELETE')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('pages: surfaces 409 slug_conflict', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'slug_conflict', message: 'dup' } }),
    )
    try {
      await adminCreatePage({ slug: 'home', title: 'X' })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe('slug_conflict')
      expect((err as ApiError).status).toBe(409)
    }
  })

  it('pages: surfaces 404 on get', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: { code: 'page_not_found', message: 'nope' } }),
    )
    try {
      await adminGetPage('missing')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).code).toBe('page_not_found')
    }
  })

  it('upload: sends FormData, omits content-type override, includes CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          url: '/uploads/2026/04/x.jpg',
          filename: 'x.jpg',
          size: 123,
          mimeType: 'image/jpeg',
        },
      }),
    )
    const file = new File([new Uint8Array([1, 2, 3])], 'x.jpg', {
      type: 'image/jpeg',
    })
    await adminUploadImage(file)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    // No content-type explicitly set — let the browser generate the boundary.
    expect(headers['content-type']).toBeUndefined()
  })
})
