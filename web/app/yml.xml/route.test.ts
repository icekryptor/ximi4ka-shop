import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  listPublishedProducts: vi.fn(),
  listCategories: vi.fn(),
  getPublicSettings: vi.fn(),
}))

import { GET } from './route'
import {
  listPublishedProducts,
  listCategories,
  getPublicSettings,
} from '@/lib/api'

describe('GET /yml.xml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a well-formed YML catalog with offers for a product linked to a category', async () => {
    vi.mocked(listCategories).mockResolvedValue({
      data: [
        {
          id: 'cat-uuid',
          slug: 'kits',
          name: 'Наборы',
          parentId: null,
          metaTitle: null,
          metaDescription: null,
          sortOrder: 0,
          translations: {},
        },
      ],
      pagination: { limit: 500, offset: 0, total: 1 },
    })
    vi.mocked(listPublishedProducts).mockResolvedValue({
      data: [
        {
          id: 'prod-uuid',
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
          // The augmented list endpoint injects categoryIds when
          // include=categories is passed. Mirror that here.
          categoryIds: ['cat-uuid'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      pagination: { limit: 5000, offset: 0, total: 1 },
    })
    vi.mocked(getPublicSettings).mockResolvedValue({
      metrikaId: null,
      ga4Id: null,
      robotsTxt: '',
      llmsTxt: '',
      yandexWebmasterVerification: null,
      googleSiteVerification: null,
      ymlShopName: 'Ximi4ka',
      ymlCompany: 'Ximi4ka LLC',
      ymlUrl: 'https://ximi4ka.ru',
      ymlCurrency: 'RUB',
      ymlDeliveryNote: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/xml/)
    expect(res.headers.get('cache-control')).toMatch(/max-age=3600/)
    const body = await res.text()
    expect(body).toContain('<yml_catalog')
    expect(body).toContain('<offer id="prod-uuid"')
    expect(body).toContain('<price>2490</price>')
    expect(body).toContain('<categoryId>1</categoryId>')
  })

  it('degrades to an empty-but-valid feed when the API throws', async () => {
    vi.mocked(listPublishedProducts).mockRejectedValue(new Error('down'))
    vi.mocked(listCategories).mockRejectedValue(new Error('down'))
    vi.mocked(getPublicSettings).mockRejectedValue(new Error('down'))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<yml_catalog')
    expect(body).toContain('<offers>')
    expect(body).not.toContain('<offer ')
  })
})
