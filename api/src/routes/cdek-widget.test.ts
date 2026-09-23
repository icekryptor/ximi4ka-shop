import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { setCdekClientForTests } from '../lib/cdek/index.js'

const PATH = '/api/public/cdek/widget'

function stubRaw(response: { status?: number; headers?: Record<string, string>; text: string }) {
  const raw = vi.fn().mockResolvedValue({ status: 200, headers: {}, ...response })
  setCdekClientForTests({ raw, get: vi.fn(), post: vi.fn() })
  return raw
}

describe('прокси виджета СДЭК', () => {
  let app: ReturnType<typeof createApp>
  beforeAll(() => {
    app = createApp()
  })
  afterEach(() => setCdekClientForTests(null))

  it('offices → GET /deliverypoints, отдаёт тело, X-Total-Elements и версию сервиса', async () => {
    const raw = stubRaw({ headers: { 'x-total-elements': '1234' }, text: '[{"code":"NSK1"}]' })
    const res = await request(app)
      .get(PATH)
      .query({ action: 'offices', city_code: 270, page: 0, size: 500 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ code: 'NSK1' }])
    expect(res.headers['x-total-elements']).toBe('1234')
    // Виджет сверяет старшую версию и отказывается работать с чужим сервисом.
    expect(res.headers['x-service-version']).toBe('4.0.0')
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Total-Elements/)
    expect(raw).toHaveBeenCalledWith('GET', '/deliverypoints', {
      query: { city_code: '270', page: '0', size: '500' },
    })
  })

  it('byCoordinate → GET /deliverypoints/byPolygons', async () => {
    const raw = stubRaw({ text: '[]' })
    await request(app).get(PATH).query({ action: 'byCoordinate', is_handout: 'true' })
    expect(raw).toHaveBeenCalledWith('GET', '/deliverypoints/byPolygons', {
      query: { is_handout: 'true' },
    })
  })

  it('не пропускает в СДЭК параметры с посторонними именами', async () => {
    const raw = stubRaw({ text: '[]' })
    await request(app)
      .get(PATH)
      .query({ action: 'offices', city_code: 44, 'evil-key': 'x', subtotal: 5000 })
    expect(raw.mock.calls[0][2].query).toEqual({ city_code: '44' })
  })

  it('calculate → POST /calculator/tarifflist: отправитель — наш склад, только нужные поля', async () => {
    const raw = stubRaw({ text: JSON.stringify({ tariff_codes: [] }) })
    await request(app)
      .post(PATH)
      .send({
        action: 'calculate',
        currency: 1,
        lang: 'rus',
        from_location: { code: 999 },
        to_location: { code: 270 },
        packages: [{ weight: 180, length: 10, width: 10, height: 4 }],
        services: [{ code: 'INSURANCE' }],
      })
    expect(raw).toHaveBeenCalledWith('POST', '/calculator/tarifflist', {
      body: {
        currency: 1,
        lang: 'rus',
        from_location: { code: 44 },
        to_location: { code: 270 },
        packages: [{ weight: 180, length: 10, width: 10, height: 4 }],
      },
    })
  })

  it('calculate: оставляет наши тарифы и показывает 0 ₽ от порога бесплатной доставки', async () => {
    stubRaw({
      text: JSON.stringify({
        tariff_codes: [
          { tariff_code: 136, delivery_sum: 350 },
          { tariff_code: 137, delivery_sum: 600 },
          { tariff_code: 482, delivery_sum: 900 },
        ],
      }),
    })
    const res = await request(app)
      .post(`${PATH}?subtotal=4000`)
      .send({ action: 'calculate', to_location: { code: 270 }, packages: [] })
    expect(res.body.tariff_codes).toEqual([
      { tariff_code: 136, delivery_sum: 0 }, // ПВЗ от 3000 ₽ — бесплатно
      { tariff_code: 137, delivery_sum: 600 }, // курьер — только от 5000 ₽
    ])
  })

  it('400 на неизвестное действие', async () => {
    stubRaw({ text: '[]' })
    const res = await request(app).get(PATH).query({ action: 'orders' })
    expect(res.status).toBe(400)
  })

  it('СДЭК недоступен — 502, а не падение', async () => {
    setCdekClientForTests({
      raw: vi.fn().mockRejectedValue(new Error('timeout')),
      get: vi.fn(),
      post: vi.fn(),
    })
    const res = await request(app).get(PATH).query({ action: 'offices' })
    expect(res.status).toBe(502)
  })
})
