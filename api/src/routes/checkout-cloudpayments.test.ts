import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'
import { SiteSettings } from '../entities/SiteSettings.js'
import { createApp } from '../app.js'

const tbankFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/payments/tbankTransport.js', () => ({ tbankFetch: tbankFetchMock }))

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

const setCloud = (over: Partial<SiteSettings> = {}) =>
  AppDataSource.getRepository(SiteSettings).save({
    id: 'default',
    cloudpaymentsEnabled: true,
    cloudpaymentsMode: 'live',
    cloudpaymentsSurchargePercent: 8,
    ...over,
  })

function stubCloud(
  response: unknown = {
    Success: true,
    Model: { Id: 'gASGZ', Url: 'https://orders.cloudpayments.ru/d/gASGZ' },
  },
) {
  const fetchMock = vi.fn<FetchFn>(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const cloudCalls = (fetchMock: ReturnType<typeof vi.fn<FetchFn>>) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes('api.cloudpayments.ru/orders/create'))
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>)

const findOrder = (orderNumber: string) =>
  AppDataSource.getRepository(Order).findOneByOrFail({ orderNumber })

describe('POST /api/checkout: CloudPayments', () => {
  let app: ReturnType<typeof createApp>
  const checkout = (payload: unknown) => request(app).post('/api/checkout').send(payload)

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
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('CLOUDPAYMENTS_PUBLIC_ID', 'pk_test')
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', 'secret_test')
    vi.stubEnv('WEB_ORIGIN', 'https://ximi4ka.ru')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await setCloud()
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    tbankFetchMock.mockReset()
    await setCloud({
      cloudpaymentsEnabled: false,
      cloudpaymentsMode: 'test',
      cloudpaymentsSurchargePercent: 0,
    })
  })

  it('ЕАЭС + cloudpayments: надбавка 8% от товаров + доставки, ссылка CloudPayments, Т-Касса не вызывается', async () => {
    const cloud = stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://orders.cloudpayments.ru/d/gASGZ')
    const order = await findOrder(res.body.data.orderNumber)
    // BY: доставка 700 ₽ до 3000 ₽ товаров; база 2700, надбавка 216.
    expect(order.shippingRub).toBe(700)
    expect(order.paymentSurchargeRub).toBe(216)
    expect(order.totalRub).toBe(2916)
    expect(order.paymentProvider).toBe('cloudpayments')
    expect(order.paymentIntentId).toBe('gASGZ')
    expect(cloudCalls(cloud)).toEqual([
      expect.objectContaining({ Amount: 2916, InvoiceId: order.orderNumber }),
    ])
    expect(tbankFetchMock).not.toHaveBeenCalled()
  })

  it('процент 0 — без надбавки', async () => {
    await setCloud({ cloudpaymentsSurchargePercent: 0 })
    stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.paymentSurchargeRub).toBe(0)
    expect(order.totalRub).toBe(2700)
  })

  it('промокод уменьшает базу надбавки', async () => {
    stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(
      cisBody(p.id, { paymentMethod: 'cloudpayments', promoCode: 'RENATA2026' }),
    )
    const order = await findOrder(res.body.data.orderNumber)
    // RENATA2026 = 5%: промо 100, база 2000 − 100 + 700 = 2600, надбавка 208.
    expect(order.promoDiscountRub).toBe(100)
    expect(order.paymentSurchargeRub).toBe(208)
    expect(order.totalRub).toBe(2808)
  })

  it('Т-Банк в ЕАЭС — без надбавки при любом проценте', async () => {
    vi.stubEnv('TBANK_TERMINAL_KEY', 'TestTerminal')
    vi.stubEnv('TBANK_PASSWORD', 'secret')
    const cloud = stubCloud()
    tbankFetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Success: true,
        PaymentId: 42,
        PaymentURL: 'https://securepay.tinkoff.ru/pay/42',
      }),
    }))
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'tbank' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://securepay.tinkoff.ru/pay/42')
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.paymentSurchargeRub).toBe(0)
    expect(order.totalRub).toBe(2700)
    expect(order.paymentProvider).toBe('tbank')
    expect(cloudCalls(cloud)).toEqual([])
  })

  it('доставка по России — 400 payment_method_unavailable, заказа нет', async () => {
    const cloud = stubCloud()
    const p = await seedProduct(2000)
    const res = await checkout(
      body([{ productId: p.id, quantity: 1 }], { paymentMethod: 'cloudpayments' }),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('payment_method_unavailable')
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
    expect(cloudCalls(cloud)).toEqual([])
  })

  it('рубильник выключен, нет ключей, тестовый режим на production — 400', async () => {
    stubCloud()
    const p = await seedProduct(2000)
    await setCloud({ cloudpaymentsEnabled: false })
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
    await setCloud({ cloudpaymentsMode: 'test' })
    vi.stubEnv('NODE_ENV', 'production')
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
    vi.stubEnv('NODE_ENV', 'test')
    await setCloud()
    vi.stubEnv('CLOUDPAYMENTS_API_SECRET', '')
    expect((await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))).status).toBe(400)
  })

  it('CloudPayments отказал — заказ создан pending без ссылки', async () => {
    stubCloud({ Success: false, Message: 'Invalid' })
    const p = await seedProduct(2000)
    const res = await checkout(cisBody(p.id, { paymentMethod: 'cloudpayments' }))
    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    const order = await findOrder(res.body.data.orderNumber)
    expect(order.status).toBe('pending')
    expect(order.paymentProvider).toBe('cloudpayments')
  })
})
