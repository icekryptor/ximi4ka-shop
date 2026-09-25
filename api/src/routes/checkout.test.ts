import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from '../entities/Product.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { createApp } from '../app.js'
import { setCdekClientForTests } from '../lib/cdek/index.js'

async function seedProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug: `kit-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Набор юного химика',
      sku: 'XIM-001',
      priceRub: 1500,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
      ...overrides,
    }),
  )
}

function checkoutBody(items: Array<{ productId: string; quantity: number }>) {
  return {
    items,
    customer: { name: 'Иван Иванов', phone: '+79001234567', email: 'ivan@example.com' },
    delivery: {
      method: 'cdek_pvz',
      cityCode: 44,
      deliveryPointCode: 'MSK123',
      address: 'Москва, ул. Ленина, 1',
      comment: 'после 18:00',
    } as Record<string, unknown>,
  }
}

describe('POST /api/checkout', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query('TRUNCATE orders, order_items, products RESTART IDENTITY CASCADE')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    setCdekClientForTests(null)
  })

  it('creates a pending order with DB-recomputed prices and snapshots', async () => {
    const p1 = await seedProduct({ priceRub: 1000 })
    const p2 = await seedProduct({ priceRub: 450, sku: null, name: 'Реактивы' })

    const res = await request(app)
      .post('/api/checkout')
      .send(
        checkoutBody([
          { productId: p1.id, quantity: 2 },
          { productId: p2.id, quantity: 1 },
        ]),
      )

    expect(res.status).toBe(201)
    expect(res.body.data.orderNumber).toMatch(/^XM-\d{4}-\d{5}$/)
    expect(res.body.data.paymentUrl).toBeNull() // default provider = manual

    const order = await AppDataSource.getRepository(Order).findOneOrFail({
      where: { orderNumber: res.body.data.orderNumber },
      relations: { items: true },
    })
    expect(order.status).toBe('pending')
    expect(order.paymentProvider).toBe('manual')
    expect(order.subtotalRub).toBe(2450)
    // 2450 < 3000 → ПВЗ доставка 350 ₽
    expect(order.shippingRub).toBe(350)
    expect(order.totalRub).toBe(2800)
    expect(order.deliveryMethod).toBe('cdek_pvz')
    // Под тестами СДЭК «недоступен» — ставка фиксированная, и это видно в заказе.
    expect(order.deliveryAddress).toEqual({
      address: 'Москва, ул. Ленина, 1',
      comment: 'после 18:00',
      cityCode: 44,
      deliveryPointCode: 'MSK123',
      postalCode: null,
      quote: {
        tariffCode: 136,
        cdekPriceRub: null,
        periodMin: null,
        periodMax: null,
        source: 'fallback',
      },
    })
    expect(order.items).toHaveLength(2)
    const item1 = order.items.find((i) => i.productId === p1.id)!
    expect(item1.quantity).toBe(2)
    expect(item1.unitPriceRub).toBe(1000)
    expect(item1.productSnapshot).toEqual({
      name: 'Набор юного химика',
      sku: 'XIM-001',
      priceRub: 1000,
    })
  })

  it('gives free ПВЗ shipping from 3000 ₽', async () => {
    const p = await seedProduct({ priceRub: 3000 })
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.shippingRub).toBe(0)
    expect(order.totalRub).toBe(3000)
  })

  it('charges 500 ₽ for courier below 5000 ₽', async () => {
    const p = await seedProduct({ priceRub: 4000 })
    const body = checkoutBody([{ productId: p.id, quantity: 1 }])
    body.delivery = { method: 'cdek_courier', address: 'Москва, ул. Тверская, 1, кв. 5' }
    const res = await request(app).post('/api/checkout').send(body)
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.shippingRub).toBe(500)
    expect(order.totalRub).toBe(4500)
  })

  it('берёт цену доставки у калькулятора СДЭК ниже порога', async () => {
    const post = vi.fn().mockResolvedValue({ total_sum: 412.4, period_min: 2, period_max: 4 })
    setCdekClientForTests({ post, get: vi.fn(), raw: vi.fn() })
    const p = await seedProduct({ priceRub: 900, weightG: 50 })

    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 3 }]))

    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.shippingRub).toBe(413)
    expect(order.totalRub).toBe(2700 + 413)
    expect(order.deliveryAddress.quote).toMatchObject({ cdekPriceRub: 413, source: 'cdek' })
    // Три флакона — малая коробка: 3×50 г + тара.
    const [, calc] = post.mock.calls[0]
    expect(calc.to_location).toEqual({ code: 44 })
    expect(calc.packages).toEqual([{ weight: 180, length: 10, width: 10, height: 4 }])
  })

  it('от порога доставка бесплатна, даже если СДЭК назвал цену', async () => {
    setCdekClientForTests({
      post: vi.fn().mockResolvedValue({ total_sum: 500 }),
      get: vi.fn(),
      raw: vi.fn(),
    })
    const p = await seedProduct({ priceRub: 3000 })
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.shippingRub).toBe(0)
    expect(order.deliveryAddress.quote).toMatchObject({ cdekPriceRub: 500 })
  })

  it('не принимает ПВЗ без кода пункта — без него не создать заказ в СДЭК', async () => {
    const p = await seedProduct()
    const body = checkoutBody([{ productId: p.id, quantity: 1 }])
    delete body.delivery.deliveryPointCode
    const res = await request(app).post('/api/checkout').send(body)
    expect(res.status).toBe(400)
  })

  it('сохраняет ник Telegram покупателя в едином виде', async () => {
    const p = await seedProduct()
    const base = checkoutBody([{ productId: p.id, quantity: 1 }])
    const body = { ...base, customer: { ...base.customer, telegram: 't.me/maria_ivanova' } }
    const res = await request(app).post('/api/checkout').send(body)
    expect(res.status).toBe(201)
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.customerTelegram).toBe('@maria_ivanova')
  })

  it('ставит «создан» в очередь уведомлений вместе с заказом', async () => {
    const p = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    const events = await AppDataSource.getRepository(OrderNotification).find({
      where: { orderId: order.id },
      order: { channel: 'ASC' },
    })
    expect(events.map((e) => [e.channel, e.eventKey])).toEqual([
      ['sheets', 'created'],
      ['telegram', 'created'],
    ])
  })

  it('без Telegram — поле пустое', async () => {
    const p = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.customerTelegram).toBeNull()
  })

  it('400 на ник, который не может быть ником Telegram', async () => {
    const p = await seedProduct()
    const base = checkoutBody([{ productId: p.id, quantity: 1 }])
    const res = await request(app)
      .post('/api/checkout')
      .send({ ...base, customer: { ...base.customer, telegram: 'мария' } })
    expect(res.status).toBe(400)
  })

  it('increments the order number sequence between orders', async () => {
    const p = await seedProduct()
    const first = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    const second = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))
    const seq = (n: string) => Number(n.split('-')[2])
    expect(seq(second.body.data.orderNumber)).toBe(seq(first.body.data.orderNumber) + 1)
  })

  it('merges duplicate product ids by summing quantities', async () => {
    const p = await seedProduct({ priceRub: 100 })
    const res = await request(app)
      .post('/api/checkout')
      .send(
        checkoutBody([
          { productId: p.id, quantity: 1 },
          { productId: p.id, quantity: 2 },
        ]),
      )
    expect(res.status).toBe(201)
    const items = await AppDataSource.getRepository(OrderItem).find()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(3)
  })

  it('returns 409 with details for out-of-stock products', async () => {
    const ok = await seedProduct()
    const gone = await seedProduct({ stockStatus: 'out_of_stock', name: 'Распродано' })
    const res = await request(app)
      .post('/api/checkout')
      .send(
        checkoutBody([
          { productId: ok.id, quantity: 1 },
          { productId: gone.id, quantity: 1 },
        ]),
      )
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('out_of_stock')
    expect(res.body.error.details.items).toEqual([{ productId: gone.id, name: 'Распродано' }])
    expect(await AppDataSource.getRepository(Order).count()).toBe(0)
  })

  it('returns 409 for unknown and unpublished products', async () => {
    const draft = await seedProduct({ isPublished: false })
    // zod v4 uuid() is strict about RFC version bits — use a well-formed v4.
    const missing = '11111111-1111-4111-8111-111111111111'
    const res = await request(app)
      .post('/api/checkout')
      .send(
        checkoutBody([
          { productId: draft.id, quantity: 1 },
          { productId: missing, quantity: 1 },
        ]),
      )
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('products_unavailable')
    expect(res.body.error.details.productIds).toEqual(expect.arrayContaining([draft.id, missing]))
  })

  it('is idempotent by Idempotency-Key header', async () => {
    const p = await seedProduct()
    const body = checkoutBody([{ productId: p.id, quantity: 1 }])
    const first = await request(app)
      .post('/api/checkout')
      .set('Idempotency-Key', 'retry-123')
      .send(body)
    expect(first.status).toBe(201)
    const second = await request(app)
      .post('/api/checkout')
      .set('Idempotency-Key', 'retry-123')
      .send(body)
    expect(second.status).toBe(200)
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber)
    expect(await AppDataSource.getRepository(Order).count()).toBe(1)
  })

  it('rejects invalid payloads with 400', async () => {
    const res = await request(app)
      .post('/api/checkout')
      .send({ items: [], customer: { name: '', phone: '' }, delivery: {} })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('validation_error')
  })

  it('creates a tbank payment when PAYMENT_PROVIDER=tbank', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('TBANK_TERMINAL_KEY', 'TestTerminal')
    vi.stubEnv('TBANK_PASSWORD', 'secret')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Success: true,
        PaymentId: 424242,
        PaymentURL: 'https://securepay.tinkoff.ru/pay/42',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const p = await seedProduct({ priceRub: 2000 })
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))

    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBe('https://securepay.tinkoff.ru/pay/42')

    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.paymentProvider).toBe('tbank')
    expect(order.paymentIntentId).toBe('424242')
    expect(order.paymentUrl).toBe('https://securepay.tinkoff.ru/pay/42')

    // Amount goes to the wire in kopecks.
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body as string,
    ) as Record<string, unknown>
    expect(sent.Amount).toBe(235000) // (2000 + 350 доставка) ₽ → копейки
    expect(sent.OrderId).toBe(order.orderNumber)
  })

  it('keeps the order pending when tbank Init fails', async () => {
    vi.stubEnv('PAYMENT_PROVIDER', 'tbank')
    vi.stubEnv('TBANK_TERMINAL_KEY', 'TestTerminal')
    vi.stubEnv('TBANK_PASSWORD', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('acquiring down')
      }),
    )

    const p = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .send(checkoutBody([{ productId: p.id, quantity: 1 }]))

    expect(res.status).toBe(201)
    expect(res.body.data.paymentUrl).toBeNull()
    const order = await AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
    expect(order.status).toBe('pending')
    expect(order.paymentIntentId).toBeNull()
  })
})
