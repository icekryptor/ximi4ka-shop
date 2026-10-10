import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'
import { authHeaders, loginAsAdmin } from './testUtils.js'

// Атрибуция заказа: откуда пришёл покупатель (метки из URL и referrer, их
// присылает витрина) и с какого адреса и браузера оформлен заказ (это берёт
// сервер, подделать клиентом нельзя).

async function seedProduct(): Promise<Product> {
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
    }),
  )
}

function checkoutBody(productId: string, extra: Record<string, unknown> = {}) {
  return {
    items: [{ productId, quantity: 1 }],
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

const FIRST = {
  at: '2026-10-01T10:00:00.000Z',
  landing: '/catalog',
  referrer: 'https://yandex.ru/search/',
  ysclid: 'lx1',
}
const LAST = {
  at: '2026-10-05T12:30:00.000Z',
  landing: '/product/kit',
  yclid: '1234567890123456789',
  utm_source: 'yandex',
  utm_medium: 'cpc',
  utm_campaign: 'kits-search',
  utm_term: 'набор химика',
  utm_content: 'ad-1',
}

describe('атрибуция заказа', () => {
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
      'TRUNCATE orders, order_items, products, product_categories RESTART IDENTITY CASCADE',
    )
  })

  async function placeOrder(extra: Record<string, unknown> = {}, userAgent = 'TestAgent/1.0') {
    const product = await seedProduct()
    const res = await request(app)
      .post('/api/checkout')
      .set('User-Agent', userAgent)
      .send(checkoutBody(product.id, extra))
    expect(res.status).toBe(201)
    return AppDataSource.getRepository(Order).findOneByOrFail({
      orderNumber: res.body.data.orderNumber,
    })
  }

  it('сохраняет первое и последнее касание в заказе', async () => {
    const order = await placeOrder({ attribution: { first: FIRST, last: LAST } })

    expect(order.attribution).toEqual({ first: FIRST, last: LAST })
  })

  it('адрес и браузер берёт сам сервер, без ::ffff: у IPv4', async () => {
    const order = await placeOrder({}, 'Mozilla/5.0 (Test)')

    expect(order.clientIp).toBe('127.0.0.1')
    expect(order.clientUserAgent).toBe('Mozilla/5.0 (Test)')
    expect(order.attribution).toBeNull()
  })

  it('чужие IP и User-Agent из тела запроса игнорируются', async () => {
    const order = await placeOrder({
      clientIp: '8.8.8.8',
      clientUserAgent: 'Подделка',
      attribution: { first: FIRST, clientIp: '8.8.8.8' },
    })

    expect(order.clientIp).toBe('127.0.0.1')
    expect(order.clientUserAgent).toBe('TestAgent/1.0')
    expect(order.attribution).toEqual({ first: FIRST })
  })

  it('длинный User-Agent обрезается до 500 символов', async () => {
    const order = await placeOrder({}, 'A'.repeat(900))

    expect(order.clientUserAgent).toHaveLength(500)
  })

  it('обрезает слишком длинные значения и отбрасывает лишние поля', async () => {
    const order = await placeOrder({
      attribution: {
        last: {
          ...LAST,
          utm_source: 'x'.repeat(1000),
          landing: '/' + 'p'.repeat(1000),
          extra: 'лишнее',
        },
      },
    })

    const last = order.attribution?.last
    expect(last?.utm_source).toHaveLength(200)
    expect(last?.landing).toHaveLength(300)
    expect(last).not.toHaveProperty('extra')
  })

  it('пустые строки и пробелы метками не становятся', async () => {
    const order = await placeOrder({
      attribution: { last: { ...LAST, utm_term: '   ', utm_content: '', yclid: ' 42 ' } },
    })

    const last = order.attribution?.last
    expect(last).not.toHaveProperty('utm_term')
    expect(last).not.toHaveProperty('utm_content')
    expect(last?.yclid).toBe('42')
  })

  it.each([
    ['строка', 'мусор'],
    ['число', 5],
    ['массив', [1, 2]],
    ['касания не объекты', { first: 5, last: 'x' }],
    ['нет страницы входа', { first: { at: FIRST.at } }],
  ])('кривая атрибуция (%s) заказ не ломает и не сохраняется', async (_name, attribution) => {
    const order = await placeOrder({ attribution })

    expect(order.attribution).toBeNull()
  })

  it('одно кривое касание не губит второе', async () => {
    const order = await placeOrder({ attribution: { first: 5, last: LAST } })

    expect(order.attribution).toEqual({ last: LAST })
  })

  it('админка видит источник, IP и браузер заказа', async () => {
    const order = await placeOrder({ attribution: { first: FIRST, last: LAST } })
    const auth = await loginAsAdmin(app)

    const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))

    expect(res.status).toBe(200)
    expect(res.body.data.attribution).toEqual({ first: FIRST, last: LAST })
    expect(res.body.data.clientIp).toBe('127.0.0.1')
    expect(res.body.data.clientUserAgent).toBe('TestAgent/1.0')
  })

  it('публичный статус заказа не раскрывает IP, браузер и источник', async () => {
    const order = await placeOrder({ attribution: { first: FIRST, last: LAST } })

    const res = await request(app).get(
      `/api/public/orders/${order.orderNumber}/status?t=${order.publicToken}`,
    )

    expect(res.status).toBe(200)
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('127.0.0.1')
    expect(text).not.toContain('TestAgent')
    expect(text).not.toContain('yclid')
    expect(text).not.toContain('attribution')
  })
})
