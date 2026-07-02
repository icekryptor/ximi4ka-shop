import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminCreateBlogPost,
  adminCreateCategory,
  adminCreatePage,
  adminCreateProduct,
  adminCreateRedirect,
  adminDeleteBlogPost,
  adminDeleteCategory,
  adminDeleteMedia,
  adminDeletePage,
  adminDeleteRedirect,
  adminGetBlogPost,
  adminGetPage,
  adminGetSettings,
  adminImportRedirectsCsv,
  adminListBlogPosts,
  adminListCategories,
  adminListMedia,
  adminListPages,
  adminListProducts,
  adminListRedirects,
  adminListRevisions,
  adminPublishBlogPost,
  adminPublishPage,
  adminRestoreRevision,
  adminUnpublishBlogPost,
  adminUnpublishPage,
  adminUpdateBlogPost,
  adminUpdateCategory,
  adminUpdatePage,
  adminUpdateRedirect,
  adminUpdateSettings,
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

  it('blog: list forwards q + pagination, sends credentials, no CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
    )
    await adminListBlogPosts({ limit: 10, offset: 20, q: 'химия' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/blog?')
    expect(String(url)).toContain('limit=10')
    expect(String(url)).toContain('offset=20')
    expect(String(url)).toContain('q=')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('blog: get by id returns unwrapped data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'b1', slug: 'post', title: 'Пост' } }),
    )
    const post = await adminGetBlogPost('b1')
    expect(post.id).toBe('b1')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/blog/b1')
  })

  it('blog: create sends POST with CSRF + JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        data: { id: 'b1', slug: 'post', title: 'Пост' },
      }),
    )
    const result = await adminCreateBlogPost({
      slug: 'post',
      title: 'Пост',
      rubric: 'Эксперименты',
    })
    expect(result.id).toBe('b1')
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(init?.body).toBe(
      JSON.stringify({ slug: 'post', title: 'Пост', rubric: 'Эксперименты' }),
    )
  })

  it('blog: update sends PATCH with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'b1', slug: 'post', title: 'Новый' } }),
    )
    await adminUpdateBlogPost('b1', { title: 'Новый' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/blog/b1')
    expect(init?.method).toBe('PATCH')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('blog: publish/unpublish POST with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'b1', isPublished: true } }),
    )
    await adminPublishBlogPost('b1')
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/admin/blog/b1/publish',
    )
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { id: 'b1', isPublished: false } }),
    )
    await adminUnpublishBlogPost('b1')
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/admin/blog/b1/unpublish',
    )
  })

  it('blog: delete sends DELETE and resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(adminDeleteBlogPost('b1')).resolves.toBeUndefined()
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('DELETE')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('blog: surfaces 409 slug_conflict', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'slug_conflict', message: 'dup' } }),
    )
    try {
      await adminCreateBlogPost({ slug: 'post', title: 'X' })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe('slug_conflict')
      expect((err as ApiError).status).toBe(409)
    }
  })

  it('blog: surfaces 404 on get', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        error: { code: 'blog_post_not_found', message: 'nope' },
      }),
    )
    try {
      await adminGetBlogPost('missing')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).code).toBe('blog_post_not_found')
    }
  })

  it('blog: revisions list accepts blog_post entity type', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
    )
    await adminListRevisions('blog_post', 'b1')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/revisions/entity/blog_post/b1')
  })

  it('media: list forwards q + mimePrefix, sends credentials, no CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 40, offset: 0, total: 0 },
      }),
    )
    await adminListMedia({ limit: 20, offset: 40, q: 'cat', mimePrefix: 'image/' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/media?')
    expect(String(url)).toContain('limit=20')
    expect(String(url)).toContain('offset=40')
    expect(String(url)).toContain('q=cat')
    expect(String(url)).toContain('mimePrefix=image')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('media: delete sends DELETE with CSRF and resolves on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(adminDeleteMedia('m1')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/media/m1')
    expect(init?.method).toBe('DELETE')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('media: delete surfaces 404 media_not_found', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        error: { code: 'media_not_found', message: 'gone' },
      }),
    )
    try {
      await adminDeleteMedia('missing')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).code).toBe('media_not_found')
    }
  })

  it('redirects: list sends sort + q as query params', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 50, offset: 0, total: 0 },
      }),
    )
    await adminListRedirects({ sort: 'hits_desc', q: '/old', limit: 50 })
    const [url] = fetchMock.mock.calls[0]
    const href = String(url)
    expect(href).toContain('/api/admin/redirects')
    expect(href).toContain('sort=hits_desc')
    expect(href).toContain('q=%2Fold')
    expect(href).toContain('limit=50')
  })

  it('redirects: create POSTs JSON and parses 409 from_path_conflict', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: {
          code: 'from_path_conflict',
          message: 'duplicate',
        },
      }),
    )
    try {
      await adminCreateRedirect({ fromPath: '/a', toPath: '/b', statusCode: 301 })
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe('from_path_conflict')
      expect((err as ApiError).status).toBe(409)
    }
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(headers['content-type']).toBe('application/json')
  })

  it('redirects: update PATCHes JSON with correct id encoding', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          id: 'abc',
          fromPath: '/a',
          toPath: '/new',
          statusCode: 302,
          hitCount: 0,
        },
      }),
    )
    await adminUpdateRedirect('abc', { toPath: '/new', statusCode: 302 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/redirects/abc')
    expect(init?.method).toBe('PATCH')
  })

  it('redirects: delete returns void on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await adminDeleteRedirect('abc')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/redirects/abc')
    expect(init?.method).toBe('DELETE')
  })

  it('redirects: import CSV sends FormData with file and CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { inserted: 2, updated: 1, skipped: 0, errors: [] },
      }),
    )
    const file = new File(['from_path,to_path\n/a,/b\n'], 'r.csv', {
      type: 'text/csv',
    })
    const summary = await adminImportRedirectsCsv(file)
    expect(summary).toEqual({
      inserted: 2,
      updated: 1,
      skipped: 0,
      errors: [],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/redirects/import-csv')
    expect(init?.body).toBeInstanceOf(FormData)
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(headers['content-type']).toBeUndefined()
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

  it('revisions: list hits the entity-scoped endpoint (GET, no CSRF)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }),
    )
    await adminListRevisions('product', 'p1', { limit: 10, offset: 5 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/revisions/entity/product/p1?')
    expect(String(url)).toContain('limit=10')
    expect(String(url)).toContain('offset=5')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('revisions: restore sends POST with CSRF', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { data: { entityType: 'product', entityId: 'p1' } }),
    )
    await adminRestoreRevision('rev-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/revisions/rev-1/restore')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('settings: get returns the singleton via GET', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          id: 'default',
          metrikaId: null,
          ga4Id: null,
          robotsTxt: 'User-agent: *\nAllow: /',
          llmsTxt: '',
          yandexWebmasterVerification: null,
          googleSiteVerification: null,
          ymlShopName: null,
          ymlCompany: null,
          ymlUrl: null,
          yandexPayEnabled: false,
          yandexPayMode: 'sandbox',
          updatedAt: '2026-04-20T00:00:00Z',
        },
      }),
    )
    const settings = await adminGetSettings()
    expect(settings.id).toBe('default')
    expect(settings.yandexPayMode).toBe('sandbox')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/settings')
    expect(init?.credentials).toBe('include')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
  })

  it('settings: update sends PATCH with CSRF and JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: {
          id: 'default',
          metrikaId: '99999',
          ga4Id: null,
          robotsTxt: 'User-agent: *\nAllow: /',
          llmsTxt: '',
          yandexWebmasterVerification: null,
          googleSiteVerification: null,
          ymlShopName: null,
          ymlCompany: null,
          ymlUrl: null,
          yandexPayEnabled: true,
          yandexPayMode: 'production',
          updatedAt: '2026-04-20T00:00:00Z',
        },
      }),
    )
    const result = await adminUpdateSettings({
      metrikaId: '99999',
      yandexPayEnabled: true,
      yandexPayMode: 'production',
    })
    expect(result.metrikaId).toBe('99999')
    expect(result.yandexPayEnabled).toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/admin/settings')
    expect(init?.method).toBe('PATCH')
    const headers = init?.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('csrf-token-123')
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(init?.body as string)).toEqual({
      metrikaId: '99999',
      yandexPayEnabled: true,
      yandexPayMode: 'production',
    })
  })
})
