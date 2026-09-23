import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from '../entities/Product.js'
import { createApp } from '../app.js'
import { setCdekClientForTests } from '../lib/cdek/index.js'

async function seedProduct(overrides: Partial<Product> = {}): Promise<Product> {
  const repo = AppDataSource.getRepository(Product)
  return repo.save(
    repo.create({
      slug: `p-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Реактив',
      priceRub: 100,
      stockStatus: 'in_stock',
      isPublished: true,
      longDescriptionBlocks: [],
      translations: {},
      weightG: 50,
      ...overrides,
    }),
  )
}

describe('POST /api/public/shipping/quote', () => {
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
  afterEach(() => setCdekClientForTests(null))

  it('без адреса отдаёт сумму и места — ими виджет считает тарифы', async () => {
    const kit = await seedProduct({ priceRub: 3299, weightG: 1300, shipBoxes: ['large'] })
    const reagent = await seedProduct({ priceRub: 99 })
    const res = await request(app)
      .post('/api/public/shipping/quote')
      .send({
        items: [
          { productId: kit.id, quantity: 1 },
          { productId: reagent.id, quantity: 2 },
        ],
      })
    expect(res.status).toBe(200)
    expect(res.body.data.subtotalRub).toBe(3299 + 198)
    expect(res.body.data.packages.map((p: { box: string }) => p.box)).toEqual(['large', 'small'])
    expect(res.body.data.quote).toBeNull()
    expect(res.body.data.tariffs).toEqual({ pvz: 136, courier: 137 })
  })

  it('с ПВЗ считает цену для покупателя по правилу порога', async () => {
    setCdekClientForTests({
      post: vi.fn().mockResolvedValue({ total_sum: 390, period_min: 3, period_max: 6 }),
      get: vi.fn(),
      raw: vi.fn(),
    })
    const p = await seedProduct({ priceRub: 500 })
    const res = await request(app)
      .post('/api/public/shipping/quote')
      .send({
        items: [{ productId: p.id, quantity: 1 }],
        destination: {
          method: 'cdek_pvz',
          cityCode: 270,
          deliveryPointCode: 'NSK1',
          address: 'Кривощековская, 15',
        },
      })
    expect(res.status).toBe(200)
    expect(res.body.data.quote).toMatchObject({
      customerPriceRub: 390,
      periodMin: 3,
      periodMax: 6,
      free: false,
    })
  })

  it('не отдаёт цену снятого с публикации товара', async () => {
    const p = await seedProduct({ isPublished: false })
    const res = await request(app)
      .post('/api/public/shipping/quote')
      .send({ items: [{ productId: p.id, quantity: 1 }] })
    expect(res.status).toBe(409)
  })

  it('400 на пустую корзину', async () => {
    const res = await request(app).post('/api/public/shipping/quote').send({ items: [] })
    expect(res.status).toBe(400)
  })
})
