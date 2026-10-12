import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { OrderStatus } from '@ximi4ka-shop/shared'
import { AppDataSource } from '../../config/dataSource.js'
import { OrderItem } from '../../entities/OrderItem.js'
import { Product } from '../../entities/Product.js'
import { createApp } from '../../app.js'
import { resetAccountTables, seedOrder } from '../testUtils.js'

async function seedProduct(slug: string): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug,
      name: slug,
      priceRub: 1500,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
    }),
  )
}

async function seedKitOrder(
  slugs: string[],
  status: OrderStatus,
  paymentProvider: 'manual' | 'tbank' = 'tbank',
) {
  const order = await seedOrder({ status, paymentProvider })
  for (const slug of slugs) {
    const p = await seedProduct(slug)
    await AppDataSource.getRepository(OrderItem).save({
      orderId: order.id,
      productId: p.id,
      productSnapshot: { name: p.name, sku: null, priceRub: p.priceRub },
      quantity: 1,
      unitPriceRub: p.priceRub,
    })
  }
  return order
}

describe('GET /api/public/orders/:number/status — методички', () => {
  const app = createApp()
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await resetAccountTables()
    await AppDataSource.query('TRUNCATE products RESTART IDENTITY CASCADE')
  })

  it('оплаченный заказ с верным токеном отдаёт методичку купленного набора', async () => {
    const o = await seedKitOrder(['elektrohimichka'], 'paid')
    const res = await request(app).get(`/api/public/orders/${o.orderNumber}/status`).query({
      t: o.publicToken,
    })
    expect(res.status).toBe(200)
    expect(res.body.data.methodichki).toEqual([
      {
        key: 'elektrohimichka',
        title: 'Методичка «Электрохимичка»',
        url: '/methodichki/elektrohimichka.pdf',
      },
    ])
  })

  it('отправленный заказ тоже получает методичку; несколько наборов — без повторов', async () => {
    const o = await seedKitOrder(
      ['himichka-30', 'mini-himichka', 'bolshoi-nabor-dlya-oge'],
      'shipped',
    )
    const res = await request(app).get(`/api/public/orders/${o.orderNumber}/status`).query({
      t: o.publicToken,
    })
    expect(res.body.data.methodichki.map((m: { key: string }) => m.key)).toEqual([
      'himichka',
      'oge',
    ])
  })

  it('без токена или с чужим токеном методичек нет', async () => {
    const o = await seedKitOrder(['himichka-30'], 'paid')
    const bare = await request(app).get(`/api/public/orders/${o.orderNumber}/status`)
    expect(bare.status).toBe(200)
    expect(bare.body.data).not.toHaveProperty('methodichki')
    const wrong = await request(app)
      .get(`/api/public/orders/${o.orderNumber}/status`)
      .query({ t: 'x'.repeat(o.publicToken.length) })
    expect(wrong.body.data).not.toHaveProperty('methodichki')
  })

  it.each<[OrderStatus, 'manual' | 'tbank']>([
    ['pending', 'tbank'],
    ['pending', 'manual'],
    ['failed', 'tbank'],
    ['cancelled', 'manual'],
  ])('заказ в статусе %s (%s) методичек не отдаёт', async (status, provider) => {
    const o = await seedKitOrder(['himichka-30'], status, provider)
    const res = await request(app).get(`/api/public/orders/${o.orderNumber}/status`).query({
      t: o.publicToken,
    })
    expect(res.status).toBe(200)
    expect(res.body.data).not.toHaveProperty('methodichki')
  })

  it('оплаченный заказ без наборов даёт пустой список', async () => {
    const o = await seedKitOrder(['reagent-x'], 'paid')
    const res = await request(app).get(`/api/public/orders/${o.orderNumber}/status`).query({
      t: o.publicToken,
    })
    expect(res.body.data.methodichki).toEqual([])
  })
})
