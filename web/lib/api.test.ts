import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ApiError,
  listPublishedProducts,
  getPublishedProduct,
  listCategories,
  getCategory,
  listProductsByCategory,
  getPage,
} from './api'

function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

function nonJsonResponse(status: number, text = 'Internal Server Error') {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error('not json')
    },
    text: async () => text,
  } as unknown as Response
}

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('listPublishedProducts', () => {
    it('calls /api/public/products without query string when no args', async () => {
      const mockResponse = {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, mockResponse))
      vi.stubGlobal('fetch', fetchMock)

      const result = await listPublishedProducts()

      expect(result).toEqual(mockResponse)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/products')
      expect(init.headers).toEqual(
        expect.objectContaining({ 'content-type': 'application/json' }),
      )
    })

    it('serializes limit and offset as a query string', async () => {
      const mockResponse = {
        data: [],
        pagination: { limit: 10, offset: 5, total: 0 },
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, mockResponse))
      vi.stubGlobal('fetch', fetchMock)

      await listPublishedProducts({ limit: 10, offset: 5 })

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/products?limit=10&offset=5')
    })

    it('allows passing only limit', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, { data: [], pagination: { limit: 3, offset: 0, total: 0 } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await listPublishedProducts({ limit: 3 })

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/products?limit=3')
    })
  })

  describe('getPublishedProduct', () => {
    it('calls /api/public/products/:slug and unwraps data', async () => {
      const product = {
        id: 'p1',
        slug: 'kit',
        sku: null,
        name: 'Kit',
        shortDescription: null,
        priceRub: 100,
        compareAtPriceRub: null,
        stockStatus: 'in_stock',
        isPublished: true,
        sortOrder: 0,
        images: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: product }))
      vi.stubGlobal('fetch', fetchMock)

      const result = await getPublishedProduct('kit')

      expect(result).toEqual(product)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/products/kit')
    })

    it('URL-encodes slugs with special characters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, { data: { id: 'p' } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await getPublishedProduct('slug with spaces')

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/products/slug%20with%20spaces')
    })

    it('throws ApiError on 404 with envelope', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            404,
            { error: { code: 'product_not_found', message: 'Not found' } },
            false,
          ),
        ),
      )

      await expect(getPublishedProduct('nope')).rejects.toBeInstanceOf(ApiError)
      await expect(getPublishedProduct('nope')).rejects.toMatchObject({
        status: 404,
        code: 'product_not_found',
        message: 'Not found',
      })
    })

    it('throws ApiError with fallback message on non-JSON 500', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nonJsonResponse(500)))

      const err: unknown = await getPublishedProduct('boom').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.status).toBe(500)
      expect(apiErr.code).toBe('unknown')
      expect(apiErr.message).toContain('500')
    })

    it('passes error details through when present', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            422,
            {
              error: {
                code: 'validation_error',
                message: 'Bad',
                details: { field: 'slug' },
              },
            },
            false,
          ),
        ),
      )

      const err: unknown = await getPublishedProduct('bad').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).details).toEqual({ field: 'slug' })
    })
  })

  describe('listCategories', () => {
    it('calls /api/public/categories and returns paginated envelope', async () => {
      const mockResponse = {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, mockResponse))
      vi.stubGlobal('fetch', fetchMock)

      const result = await listCategories()

      expect(result).toEqual(mockResponse)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/categories')
    })
  })

  describe('getCategory', () => {
    it('calls /api/public/categories/:slug and unwraps data', async () => {
      const category = {
        id: 'c1',
        slug: 'kits',
        name: 'Kits',
        parentId: null,
        metaTitle: null,
        metaDescription: null,
        sortOrder: 0,
        translations: {},
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: category }))
      vi.stubGlobal('fetch', fetchMock)

      const result = await getCategory('kits')

      expect(result).toEqual(category)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/categories/kits')
    })
  })

  describe('listProductsByCategory', () => {
    it('calls /api/public/categories/:slug/products with no query when no opts', async () => {
      const mockResponse = {
        data: [],
        pagination: { limit: 20, offset: 0, total: 0 },
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, mockResponse))
      vi.stubGlobal('fetch', fetchMock)

      const result = await listProductsByCategory('kits')

      expect(result).toEqual(mockResponse)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/categories/kits/products')
    })

    it('serializes limit and offset as a query string', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, { data: [], pagination: { limit: 10, offset: 5, total: 0 } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await listProductsByCategory('kits', { limit: 10, offset: 5 })

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/categories/kits/products?limit=10&offset=5')
    })

    it('URL-encodes slugs with special characters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, { data: [], pagination: { limit: 20, offset: 0, total: 0 } }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await listProductsByCategory('slug with spaces')

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/categories/slug%20with%20spaces/products')
    })

    it('throws ApiError on 404', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            404,
            { error: { code: 'category_not_found', message: 'Not found' } },
            false,
          ),
        ),
      )

      await expect(listProductsByCategory('nope')).rejects.toMatchObject({
        status: 404,
        code: 'category_not_found',
      })
    })
  })

  describe('getPage', () => {
    it('calls /api/public/pages/:slug and unwraps data', async () => {
      const page = {
        id: 'pg1',
        slug: 'about',
        title: 'About',
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
      }
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: page }))
      vi.stubGlobal('fetch', fetchMock)

      const result = await getPage('about')

      expect(result).toEqual(page)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/pages/about')
    })

    it('URL-encodes page slug', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }))
      vi.stubGlobal('fetch', fetchMock)

      await getPage('o nas')

      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe('http://localhost:3001/api/public/pages/o%20nas')
    })
  })
})
