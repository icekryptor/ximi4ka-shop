import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const PATH = '/api/webhooks/yandex-pay/v1/webhook'

// JWKS без сети: createRemoteJWKSet отдаёт локальный ключ, адреса копим — чтобы
// проверить, что хост берётся из режима магазина, а не из запроса.
const jwks = vi.hoisted(() => ({ resolver: null as JWTVerifyGetKey | null, urls: [] as string[] }))
vi.mock('jose', async (importOriginal) => ({
  ...(await importOriginal<typeof import('jose')>()),
  createRemoteJWKSet: (url: URL) => {
    jwks.urls.push(url.href)
    return (...args: Parameters<JWTVerifyGetKey>) => jwks.resolver!(...args)
  },
}))

// CryptoKey нет в глобальных типах api (без DOM) — берём тип у самого jose.
type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']
let privateKey: Key
let otherKey: Key
let app: ReturnType<typeof createApp>

async function signed(
  payload: Record<string, unknown>,
  opts: { key?: Key; exp?: number | string } = {},
) {
  return Buffer.from(
    await new SignJWT(payload)
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test' })
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey),
  )
}

const event = (orderId: string, paymentStatus: string, extra: Record<string, unknown> = {}) => ({
  merchantId: MERCHANT,
  event: 'ORDER_STATUS_UPDATED',
  eventTime: '2026-10-24T12:00:00+00:00',
  order: { orderId, paymentStatus },
  ...extra,
})

let seq = 0
async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-7${String(seq).padStart(4, '0')}`,
      status: 'pending',
      customerName: 'Тест Тестов',
      customerPhone: '+79001112233',
      customerEmail: 'test@example.com',
      deliveryAddress: { address: 'Москва', comment: null },
      deliveryMethod: 'cdek_pvz',
      subtotalRub: 2000,
      shippingRub: 350,
      totalRub: 2350,
      paymentProvider: 'yandex_pay',
      paymentIntentId: null,
      statusHistory: [],
      ...overrides,
    }),
  )
}

const post = (body: Buffer) =>
  request(app).post(PATH).set('Content-Type', 'application/octet-stream').send(body)
const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })

describe('POST /api/webhooks/yandex-pay/v1/webhook', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    const pair = await generateKeyPair('ES256')
    privateKey = pair.privateKey
    otherKey = (await generateKeyPair('ES256')).privateKey
    jwks.resolver = async () => pair.publicKey
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await AppDataSource.getRepository(SiteSettings).save({
      id: 'default',
      yandexPayMode: 'sandbox',
    })
  })

  it.each(['CAPTURED', 'CONFIRMED'])(
    '%s — заказ оплачен, уведомления в очереди',
    async (status) => {
      const order = await seedOrder()
      const res = await post(await signed(event(order.orderNumber, status)))
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'success' })
      const updated = await reload(order.id)
      expect(updated.status).toBe('paid')
      expect(updated.paymentIntentId).toBe(order.orderNumber)
      expect(updated.statusHistory).toEqual([
        expect.objectContaining({ from: 'pending', to: 'paid', by: 'yandex_pay' }),
      ])
      const events = await AppDataSource.getRepository(OrderNotification).find({
        where: { orderId: order.id },
        order: { channel: 'ASC' },
      })
      expect(events.map((e) => [e.channel, e.eventKey])).toEqual([
        ['sheets', 'status:paid'],
        ['telegram', 'status:paid'],
      ])
    },
  )

  it.each(['FAILED', 'VOIDED'])('%s — ожидающий заказ в failed', async (status) => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, status))).expect(200)
    expect((await reload(order.id)).status).toBe('failed')
  })

  it.each(['PENDING', 'AUTHORIZED', 'REFUNDED'])('%s — 200 без смены статуса', async (status) => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, status))).expect(200)
    const updated = await reload(order.id)
    expect(updated.status).toBe('pending')
    expect(updated.statusHistory).toEqual([])
  })

  it('повтор события — 200, история не дублируется; FAILED после оплаты не откатывает', async () => {
    const order = await seedOrder()
    const body = await signed(event(order.orderNumber, 'CAPTURED'))
    await post(body).expect(200)
    await post(body).expect(200)
    await post(await signed(event(order.orderNumber, 'FAILED'))).expect(200)
    const updated = await reload(order.id)
    expect(updated.status).toBe('paid')
    expect(updated.statusHistory).toHaveLength(1)
  })

  it('заказ Т-Кассы с тем же номером — 200, заказ не меняется', async () => {
    const order = await seedOrder({ paymentProvider: 'tbank', paymentIntentId: '777' })
    const res = await post(await signed(event(order.orderNumber, 'CAPTURED')))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success' })
    const updated = await reload(order.id)
    expect(updated.status).toBe('pending')
    expect(updated.statusHistory).toEqual([])
    expect(updated.paymentIntentId).toBe('777')
  })

  it('неизвестный заказ — 200, чтобы Яндекс не повторял сутки', async () => {
    const res = await post(await signed(event('XM-0000-00000', 'CAPTURED')))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success' })
  })

  it('мусор, пустое тело, чужая подпись — 401 UNAUTHORIZED; просрочен — 401 TOKEN_EXPIRED; чужой merchantId — 400 OTHER', async () => {
    const order = await seedOrder()
    const forged = await signed(event(order.orderNumber, 'CAPTURED'), { key: otherKey })
    for (const body of [Buffer.from('garbage'), Buffer.alloc(0), forged]) {
      const res = await post(body)
      expect(res.status).toBe(401)
      expect(res.body).toMatchObject({ status: 'fail', reasonCode: 'UNAUTHORIZED' })
    }
    const expired = await post(
      await signed(event(order.orderNumber, 'CAPTURED'), {
        exp: Math.floor(Date.now() / 1000) - 600,
      }),
    )
    expect(expired.status).toBe(401)
    expect(expired.body).toMatchObject({ status: 'fail', reasonCode: 'TOKEN_EXPIRED' })
    const foreign = await post(
      await signed(event(order.orderNumber, 'CAPTURED', { merchantId: 'other' })),
    )
    expect(foreign.status).toBe(400)
    expect(foreign.body).toMatchObject({ status: 'fail', reasonCode: 'OTHER' })
    expect((await reload(order.id)).status).toBe('pending')
  })

  it('без YANDEX_PAY_MERCHANT_ID — 401, заказ не меняется', async () => {
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', '')
    const order = await seedOrder()
    expect((await post(await signed(event(order.orderNumber, 'CAPTURED')))).status).toBe(401)
    expect((await reload(order.id)).status).toBe('pending')
  })

  it('тело больше 64 КБ — 413 со status fail, не 500', async () => {
    const res = await post(Buffer.alloc(70 * 1024, 'a'))
    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ status: 'fail', reasonCode: 'OTHER' })
  })

  it('Content-Type application/json не ломает разбор: маршрут стоит до express.json', async () => {
    const order = await seedOrder()
    // Строкой: supertest сериализует Buffer в JSON при JSON Content-Type.
    const token = (await signed(event(order.orderNumber, 'CAPTURED'))).toString()
    const res = await request(app).post(PATH).set('Content-Type', 'application/json').send(token)
    expect(res.status).toBe(200)
    expect((await reload(order.id)).status).toBe('paid')
  })

  it('JWKS — только с хоста режима из настроек', async () => {
    const order = await seedOrder()
    await post(await signed(event(order.orderNumber, 'PENDING'))).expect(200)
    await AppDataSource.getRepository(SiteSettings).save({
      id: 'default',
      yandexPayMode: 'production',
    })
    await post(await signed(event(order.orderNumber, 'PENDING'))).expect(200)
    expect(jwks.urls).toContain('https://sandbox.pay.yandex.ru/api/jwks')
    expect(jwks.urls).toContain('https://pay.yandex.ru/api/jwks')
    expect(
      jwks.urls.every(
        (u) =>
          u === 'https://sandbox.pay.yandex.ru/api/jwks' || u === 'https://pay.yandex.ru/api/jwks',
      ),
    ).toBe(true)
  })
})
