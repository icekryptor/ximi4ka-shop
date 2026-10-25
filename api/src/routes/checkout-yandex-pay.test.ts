import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

// Т-Касса ходит через tbankFetch, Яндекс — через глобальный fetch: подменяем оба.
const tbankFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/payments/tbankTransport.js', () => ({ tbankFetch: tbankFetchMock }))

const MERCHANT = '00000000-aaaa-bbbb-cccc-000000000001'
const API_KEY = 'test-api-key-not-real'
const ORDERS = '/api/merchant/v1/orders'

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

async function seedProduct(
  priceRub = 2000,
  slug = `kit-${Math.random().toString(36).slice(2, 8)}`,
) {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug,
      name: 'Набор юного химика',
      sku: slug.toUpperCase(),
      priceRub,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    }),
  )
}

function body(
  items: Array<{ productId: string; quantity: number }>,
  extra: Record<string, unknown> = {},
) {
  return {
    items,
    customer: { name: 'Иван Иванов', phone: '+79001234567', email: 'ivan@example.com' },
    delivery: {
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK123',
      address: 'Москва, ул. Ленина, 1',
    },
    ...extra,
  }
}

function cisBody(productId: string, extra: Record<string, unknown> = {}) {
  return body([{ productId, quantity: 1 }], {
    customer: { name: 'Алесь Новик', phone: '+375291234567', email: 'ales@example.com' },
    delivery: {
      method: 'cdek_manual_cis',
      country: 'BY',
      city: 'Минск',
      address: 'ул. Ленина, 5, ПВЗ СДЭК',
    },
    ...extra,
  })
}

const setYandex = (yandexPayEnabled: boolean, yandexPayMode: 'sandbox' | 'production') =>
  AppDataSource.getRepository(SiteSettings).save({ id: 'default', yandexPayEnabled, yandexPayMode })

function stubYandex(paymentUrl = 'https://pay.ya.ru/l/test-1') {
  const fetchMock = vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify({ status: 'success', data: { paymentUrl } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const yandexCalls = (fetchMock: ReturnType<typeof vi.fn<FetchFn>>) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes(ORDERS))
    .map(([url, init]) => ({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    }))

const findOrder = (orderNumber: string) =>
  AppDataSource.getRepository(Order).findOneByOrFail({ orderNumber })

describe('POST /api/checkout: Яндекс Пэй', () => {
  let app: ReturnType<typeof createApp>
  const checkout = (payload: unknown, key?: string) => {
    const req = request(app).post('/api/checkout')
    return (key ? req.set('Idempotency-Key', key) : req).send(payload)
  }

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories RESTART IDENTITY CASCADE',
    )
    vi.stubEnv('PAYMENT_PROVIDER', '')
    vi.stubEnv('YANDEX_PAY_MERCHANT_ID', MERCHANT)
    vi.stubEnv('YANDEX_PAY_API_KEY', API_KEY)
    vi.stubEnv('WEB_ORIGIN', 'https://ximi4ka.ru')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setYandex(true, 'production')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    tbankFetchMock.mockReset()
    await setYandex(false, 'sandbox')
  })

  it('без paymentMethod — как сейчас (ручная оплата), Яндекс не вызывается', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(body([{ productId: p.id, quantity: 1 }]))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('manual')
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('paymentMethod=tbank — как сейчас через PAYMENT_PROVIDER=tbank', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('TBANK_TERMINAL_KEY', 'TestTerminal')
    vi.stubEnv('TBANK_PASSWORD', 'secret')
    tbankFetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Success: true,
        PaymentId: 42,
        PaymentURL: 'https://securepay.tinkoff.ru/pay/42',
      }),
    }))
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'tbank' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://securepay.tinkoff.ru/pay/42')
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('tbank')
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('yandex_pay — заказ в Яндексе без preferredPaymentMethod, ссылка сохранена', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://pay.ya.ru/l/test-1')
    const order = await findOrder(res.body.data.orderNumber)
    expect(order).toMatchObject({
      paymentProvider: 'yandex_pay',
      paymentIntentId: order.orderNumber,
      paymentUrl: 'https://pay.ya.ru/l/test-1',
    })
    const [call] = yandexCalls(yandex)
    expect(call.url).toBe(`https://pay.yandex.ru${ORDERS}`)
    expect(call.headers.Authorization).toBe(`Api-Key ${API_KEY}`)
    expect(call.body).toMatchObject({
      orderId: order.orderNumber,
      cart: { total: { amount: '2350.00' } },
    })
    expect(call.body).not.toHaveProperty('preferredPaymentMethod')
  })

  it('yandex_split — тот же провайдер, форма на Сплите', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_split' }),
    )
    expect(res.status).toBe(201)
    expect((await findOrder(res.body.data.orderNumber)).paymentProvider).toBe('yandex_pay')
    expect(yandexCalls(yandex)[0].body).toMatchObject({ preferredPaymentMethod: 'SPLIT' })
  })

  it('промокод: корзина Яндекса сходится с итогом заказа', async () => {
    const yandex = stubYandex()
    const a = await seedProduct(1000, 'promo-a')
    const b = await seedProduct(111, 'promo-b')
    const res = await checkout(
      body(
        [
          { productId: a.id, quantity: 1 },
          { productId: b.id, quantity: 3 },
        ],
        { promoCode: 'RENATA2026', paymentMethod: 'yandex_pay' },
      ),
    )
    expect(res.status).toBe(201)
    const order = await findOrder(res.body.data.orderNumber)
    const cart = yandexCalls(yandex)[0].body.cart as {
      items: Array<{ total: string }>
      total: { amount: string }
    }
    expect(cart.total.amount).toBe(`${order.totalRub}.00`)
    expect(cart.items.reduce((s, i) => s + Math.round(Number(i.total) * 100), 0)).toBe(
      order.totalRub * 100,
    )
  })

  it('рубильник выключили после загрузки чекаута — 400, заказа нет, Яндекс не вызывается', async () => {
    await setYandex(false, 'production')
    const yandex = stubYandex()
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
    expect(yandexCalls(yandex)).toEqual([])
  })

  it('боевой режим без ключа API — 400', async () => {
    vi.stubEnv('YANDEX_PAY_API_KEY', '')
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_split' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
  })

  it('песочница: вне прода — заказ в песочнице с Merchant ID как ключом; при NODE_ENV=production — 400', async () => {
    await setYandex(true, 'sandbox')
    const yandex = stubYandex('https://sandbox.pay.yandex.ru/l/test-2')
    const p = await seedProduct()
    const ok = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(ok.status).toBe(201)
    const [call] = yandexCalls(yandex)
    expect(call.url).toBe(`https://sandbox.pay.yandex.ru${ORDERS}`)
    expect(call.headers.Authorization).toBe(`Api-Key ${MERCHANT}`)

    vi.stubEnv('NODE_ENV', 'production')
    const rejected = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.code).toBe('payment_method_unavailable')
  })

  it('доставка в ЕАЭС + Яндекс — 400, заказа нет', async () => {
    stubYandex()
    const p = await seedProduct()
    for (const paymentMethod of ['yandex_pay', 'yandex_split']) {
      const res = await checkout(cisBody(p.id, { paymentMethod }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('payment_method_unavailable')
    }
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })

  it('повтор с тем же Idempotency-Key — один заказ в Яндексе и та же ссылка', async () => {
    const yandex = stubYandex()
    const p = await seedProduct()
    const payload = body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' })
    const first = await checkout(payload, 'retry-yp-1')
    const second = await checkout(payload, 'retry-yp-1')
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.data).toEqual(first.body.data)
    expect(yandexCalls(yandex)).toHaveLength(1)
    expect(await AppDataSource.getRepository(Order).count()).toBe(1)
  })

  it('Яндекс не ответил — заказ создан без ссылки и ждёт менеджера', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<FetchFn>(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'yandex_pay' }),
    )
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    expect(await findOrder(res.body.data.orderNumber)).toMatchObject({
      status: 'pending',
      paymentProvider: 'yandex_pay',
      paymentIntentId: null,
    })
  })

  it('неизвестный paymentMethod — 400 validation_error', async () => {
    const p = await seedProduct()
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'paypal' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })
})
