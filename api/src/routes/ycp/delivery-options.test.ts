import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setCdekClientForTests } from '../../lib/cdek/index.js'
import { clearCdekLocationCache } from '../../lib/cdek/locations.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import { applyYcpTestEnv, makePickupEntry, seedYcpProduct, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/delivery/options'

function stubCdek(post: () => Promise<unknown>, cities: unknown[] = []) {
  const get = vi.fn(async () => cities)
  const postFn = vi.fn(post)
  setCdekClientForTests({ get, post: postFn, raw: vi.fn() } as never)
  return { get, post: postFn }
}

const pvzTarget = { delivery_method: 'pickup_point', address: { pickup_point_id: 'MSK1' } }
const courierTarget = {
  delivery_method: 'courier',
  address: { locality: 'Новосибирск', address: 'ул. Ленина, 1' },
}

describe('POST /api/v1/checkout/delivery/options', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE products, product_categories RESTART IDENTITY CASCADE')
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T09:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    setCdekClientForTests(null)
    clearCdekLocationCache()
    setPickupPointsForTests(null)
  })

  it('пункт выдачи: цена и срок СДЭК, оба ключа ответа с одним массивом', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const cdek = stubCdek(async () => ({ total_sum: 412.4, period_min: 2, period_max: 4 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.status).toBe(200)
    const option = {
      id: 'pvz-136-44',
      cost: 413,
      delivery_date_interval: {
        start_interval: { date: '2026-10-14' },
        end_interval: { date: '2026-10-16' },
        time_zone: 3,
      },
    }
    expect(res.body).toEqual({ options: [option], delivery_options: [option] })
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({ tariff_code: 136, to_location: { code: 44 } }),
    )
  })

  it('от 3000 ₽ за товары до ПВЗ — бесплатно', async () => {
    const p = await seedYcpProduct({ priceRub: 3500 })
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    stubCdek(async () => ({ total_sum: 412, period_min: 2, period_max: 4 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.body.options[0]).toMatchObject({ id: 'pvz-136-44', cost: 0 })
  })

  it('курьер: город по подсказке СДЭК, адрес целиком в калькулятор', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(
      async () => ({ total_sum: 650, period_min: 3, period_max: 5 }),
      [{ code: 270, full_name: 'Новосибирск, Новосибирская обл., Россия' }],
    )
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: courierTarget })
    expect(res.status).toBe(200)
    expect(res.body.options[0]).toEqual({
      id: 'courier-137-270',
      cost: 650,
      delivery_date_interval: {
        start_interval: { date: '2026-10-15' },
        end_interval: { date: '2026-10-17' },
        time_zone: 3,
      },
    })
    expect(cdek.get).toHaveBeenCalledWith('/location/suggest/cities', {
      name: 'Новосибирск',
      country_code: 'RU',
    })
    expect(cdek.post).toHaveBeenCalledWith(
      '/calculator/tariff',
      expect.objectContaining({
        tariff_code: 137,
        to_location: { code: 270, address: 'Новосибирск, ул. Ленина, 1' },
      }),
    )
  })

  it('курьер без locality — 400, СДЭК не вызывается', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(async () => ({ total_sum: 650 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'courier', address: { address: 'ул. Ленина, 1' } },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('locality')
    expect(cdek.post).not.toHaveBeenCalled()
  })

  it('ПВЗ без pickup_point_id — 400', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: {} },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('pickup_point_id')
  })

  it('неизвестный пункт при собранном кеше — 400', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: { pickup_point_id: 'NOPE' } },
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Unknown pickup point' })
  })

  it('кеш пунктов не собран — фиксированная ставка и ориентировочный срок', async () => {
    const p = await seedYcpProduct()
    const cdek = stubCdek(async () => ({ total_sum: 412 }))
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(res.body.options[0]).toEqual({
      id: 'pvz-136-0',
      cost: 350,
      delivery_date_interval: {
        start_interval: { date: '2026-10-15' },
        end_interval: { date: '2026-10-19' },
        time_zone: 3,
      },
    })
    expect(cdek.post).not.toHaveBeenCalled()
  })

  it('СДЭК молчит — ответ по запасному тарифу задолго до 5 секунд', async () => {
    vi.stubEnv('YCP_CDEK_TIMEOUT_MS', '50')
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    stubCdek(() => new Promise(() => undefined))
    const started = performance.now()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: pvzTarget })
    expect(performance.now() - started).toBeLessThan(1000)
    expect(res.status).toBe(200)
    expect(res.body.options[0]).toMatchObject({ id: 'pvz-136-44', cost: 350 })
  })

  it('курьер: подсказка города съела срок — запасная ставка, вызов калькулятора не уходит и необработанных отказов нет', async () => {
    vi.stubEnv('YCP_CDEK_TIMEOUT_MS', '50')
    const p = await seedYcpProduct()
    // Подсказка города зависает дольше общего срока, калькулятор потом отвечал бы отказом.
    const get = vi.fn(() => new Promise(() => undefined))
    const post = vi.fn(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('СДЭК лежит')), 100)),
    )
    setCdekClientForTests({ get, post, raw: vi.fn() } as never)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const res = await request(app)
        .post(URL)
        .set(ycpAuth)
        .send({ items: [{ id: p.id, quantity: 1 }], delivery_target: courierTarget })
      expect(res.status).toBe(200)
      expect(res.body.options[0]).toMatchObject({ id: 'courier-137-0', cost: 500 })
      // Даём позднему отказу, если бы вызов ушёл, дойти до обработчика.
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(post).not.toHaveBeenCalled()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('ни одного доступного товара — 400', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send({
        items: [{ id: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
        delivery_target: pvzTarget,
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Products not found' })
  })
})
