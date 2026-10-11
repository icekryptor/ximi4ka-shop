import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import AjvModule from 'ajv'
import addFormatsModule from 'ajv-formats'
import { AppDataSource } from '../../config/dataSource.js'
import { createApp } from '../../app.js'
import { setCdekClientForTests } from '../../lib/cdek/index.js'
import { clearCdekLocationCache } from '../../lib/cdek/locations.js'
import { setPickupPointsForTests } from '../../lib/ycp/pickupPoints.js'
import {
  applyYcpTestEnv,
  createYcpCheckout,
  makePickupEntry,
  seedYcpProduct,
  ycpAuth,
  ycpCheckoutBody,
} from './testHelpers.js'

// CJS-пакеты под ESM: default — сам класс или модуль с .default, смотря кто грузит.
const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule
const addFormats =
  (addFormatsModule as unknown as { default?: typeof addFormatsModule }).default ?? addFormatsModule

const SPEC = JSON.parse(
  readFileSync(new URL('../../../../docs/ycp/ycp-openapi-0.0.14.json', import.meta.url), 'utf8'),
) as { info: { version: string } }

// strict: false — в OpenAPI есть example и deprecated, которых нет в JSON Schema.
const ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false })
addFormats(ajv)
// Форматы OpenAPI без аналога в JSON Schema: числа и так проверяет type.
ajv.addFormat('float', true)
ajv.addFormat('uint32', true)
ajv.addSchema(SPEC, 'ycp')

const esc = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1')

// Схема Яндекса почти ничего не помечает required у Error и разрешает пустые
// массивы, поэтому одной валидации мало: для ошибок дополнительно проверяем
// наш контракт — тело ровно {error: string}, плюс actual_inventory и
// checkout_canceled только у 409 на /checkout.
function expectErrorShape(body: unknown, path: string, status: number): void {
  expect(body).toBeTypeOf('object')
  const rec = body as Record<string, unknown>
  expect(rec.error).toBeTypeOf('string')
  const extra =
    path === '/checkout' && status === 409 ? ['actual_inventory', 'checkout_canceled'] : []
  const unexpected = Object.keys(rec).filter((k) => k !== 'error' && !extra.includes(k))
  expect(unexpected).toEqual([])
}

function expectSchema(body: unknown, path: string, method: 'get' | 'post', status: number): void {
  if (status >= 400) expectErrorShape(body, path, status)
  const ref = `ycp#/paths/${esc(path)}/${method}/responses/${status}/content/${esc('application/json')}/schema`
  const validate = ajv.getSchema(ref)
  if (!validate) throw new Error(`нет схемы ответа ${ref}`)
  const ok = validate(body)
  expect(validate.errors ?? []).toEqual([])
  expect(ok).toBe(true)
}

describe('ответы /api/v1 соответствуют OpenAPI Яндекса 0.0.14', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories, cdek_shipments RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    setCdekClientForTests({
      get: vi.fn(async () => [{ code: 44, full_name: 'Москва, Россия' }]),
      post: vi.fn(async () => ({ total_sum: 400, period_min: 2, period_max: 4 })),
      raw: vi.fn(),
    } as never)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    setCdekClientForTests(null)
    clearCdekLocationCache()
    setPickupPointsForTests(null)
  })

  it('схема в репозитории — версии 0.0.14', () => {
    expect(SPEC.info.version).toBe('0.0.14')
  })

  it('GET /warehouses: 200 и 401', async () => {
    const ok = await request(app).get('/api/v1/warehouses?limit=1000&offset=0').set(ycpAuth)
    expectSchema(ok.body, '/warehouses', 'get', 200)
    expect(ok.body.warehouses.length).toBeGreaterThan(0)
    const denied = await request(app).get('/api/v1/warehouses')
    expect(denied.status).toBe(401)
    expectSchema(denied.body, '/warehouses', 'get', 401)
  })

  it('POST /checkout/basket/check: 200, 400, 404', async () => {
    const p = await seedYcpProduct()
    const path = '/checkout/basket/check'
    const ok = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 2 }],
        offers_id_from_merchant_center: true,
        locality: 'Москва',
        is_health_check: false,
      })
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'post', 200)
    // Схема допускает пустые items и warehouses — проверяем сами.
    expect(ok.body.items).toHaveLength(1)
    expect(ok.body.items[0].warehouses.length).toBeGreaterThan(0)
    const bad = await request(app).post(`/api/v1${path}`).set(ycpAuth).send({ items: [] })
    expect(bad.status).toBe(400)
    expectSchema(bad.body, path, 'post', 400)
    const missing = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({ items: [{ id: 'nope', quantity: 1 }] })
    expect(missing.status).toBe(404)
    expectSchema(missing.body, path, 'post', 404)
  })

  it('POST /checkout: 201, 409 (цены), 409 (сессия), 400', async () => {
    const p = await seedYcpProduct()
    const items = [{ id: p.id, quantity: 1, regular_price: 1500, final_price: 1500 }]
    const created = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody(items))
    expect(created.status).toBe(201)
    expectSchema(created.body, '/checkout', 'post', 201)
    // order_number в схеме необязателен — без проверки сошёл бы и {}.
    expect(created.body.order_number).toBeTypeOf('string')
    const again = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody(items))
    expect(again.status).toBe(409)
    expectSchema(again.body, '/checkout', 'post', 409)
    const stale = await request(app)
      .post('/api/v1/checkout')
      .set(ycpAuth)
      .send(ycpCheckoutBody([{ ...items[0], final_price: 1 }], { session_id: 'sess-other' }))
    expect(stale.status).toBe(409)
    expectSchema(stale.body, '/checkout', 'post', 409)
    expect(Array.isArray(stale.body.actual_inventory.items)).toBe(true)
    expect(stale.body.actual_inventory.items.length).toBeGreaterThan(0)
    const bad = await request(app).post('/api/v1/checkout').set(ycpAuth).send({})
    expect(bad.status).toBe(400)
    expectSchema(bad.body, '/checkout', 'post', 400)
  })

  it('POST /checkout/delivery/options: 200 (оба ключа) и 400', async () => {
    const p = await seedYcpProduct()
    setPickupPointsForTests([makePickupEntry('MSK1', 44)])
    const path = '/checkout/delivery/options'
    const ok = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'pickup_point', address: { pickup_point_id: 'MSK1' } },
      })
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'post', 200)
    // В схеме Яндекса ключ — delivery_options, в их же примере — options; отдаём оба.
    expectSchema({ delivery_options: ok.body.options }, path, 'post', 200)
    expect(ok.body.options.length).toBeGreaterThan(0)
    expect(ok.body.delivery_options.length).toBeGreaterThan(0)
    expect(ok.body.delivery_options).toEqual(ok.body.options)
    const bad = await request(app)
      .post(`/api/v1${path}`)
      .set(ycpAuth)
      .send({
        items: [{ id: p.id, quantity: 1 }],
        delivery_target: { delivery_method: 'courier', address: {} },
      })
    expect(bad.status).toBe(400)
    expectSchema(bad.body, path, 'post', 400)
  })

  it('GET /checkout/delivery/pickup_points: 500 до сборки кеша и 200 после', async () => {
    const path = '/checkout/delivery/pickup_points'
    const early = await request(app).get(`/api/v1${path}?limit=1000&offset=0`).set(ycpAuth)
    expect(early.status).toBe(500)
    expectSchema(early.body, path, 'get', 500)
    setPickupPointsForTests([makePickupEntry('MSK1'), makePickupEntry('MSK2')])
    const ok = await request(app).get(`/api/v1${path}?limit=1000&offset=0`).set(ycpAuth)
    expect(ok.status).toBe(200)
    expectSchema(ok.body, path, 'get', 200)
    expect(ok.body.pickup_points.length).toBeGreaterThan(0)
  })

  it('POST /checkout/placed: 200 без тела, 404, 409', async () => {
    await createYcpCheckout(app, 'sess-p')
    const body = {
      session_id: 'sess-p',
      order_id: 'ya-p',
      order_number: 1,
      payment_method: 'online',
    }
    const ok = await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send(body)
    expect(ok.status).toBe(200)
    expect(ok.text).toBe('')
    const missing = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({ ...body, session_id: 'nope' })
    expect(missing.status).toBe(404)
    expectSchema(missing.body, '/checkout/placed', 'post', 404)
    await createYcpCheckout(app, 'sess-x')
    await request(app).post('/api/v1/checkout/cancel?session_id=sess-x').set(ycpAuth)
    const cancelled = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({ ...body, session_id: 'sess-x' })
    expect(cancelled.status).toBe(409)
    expectSchema(cancelled.body, '/checkout/placed', 'post', 409)
  })

  it('POST /checkout/cancel и /order/cancel: 200 без тела и 404', async () => {
    await createYcpCheckout(app, 'sess-c')
    const ok = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c').set(ycpAuth)
    expect(ok.status).toBe(200)
    expect(ok.text).toBe('')
    const noSession = await request(app)
      .post('/api/v1/checkout/cancel?session_id=nope')
      .set(ycpAuth)
    expect(noSession.status).toBe(404)
    expectSchema(noSession.body, '/checkout/cancel', 'post', 404)

    await createYcpCheckout(app, 'sess-o')
    await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send({
      session_id: 'sess-o',
      order_id: 'ya-o',
      order_number: 2,
      payment_method: 'online',
    })
    const cancelled = await request(app).post('/api/v1/order/cancel?order_id=ya-o').set(ycpAuth)
    expect(cancelled.status).toBe(200)
    expect(cancelled.text).toBe('')
    const noOrder = await request(app).post('/api/v1/order/cancel?order_id=nope').set(ycpAuth)
    expect(noOrder.status).toBe(404)
    expectSchema(noOrder.body, '/order/cancel', 'post', 404)
  })
})
