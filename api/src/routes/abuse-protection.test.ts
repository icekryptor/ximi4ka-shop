import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { Order } from '../entities/Order.js'
import { Product } from '../entities/Product.js'

// Защита публичного оформления заказа и входа в админку от перебора и спама.
// Лимиты читаются из env в момент createApp(), поэтому каждый тест собирает
// своё приложение — счётчики в памяти не текут между тестами. Глобально
// vitest.config.ts поднимает лимиты до потолка (1000); здесь их задаём явно.

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

describe('защита от ботов', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, product_categories RESTART IDENTITY CASCADE',
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('POST /api/checkout: лимит частоты', () => {
    it('отвечает 429 после лимита заказов с одного IP', async () => {
      vi.stubEnv('CHECKOUT_RATE_LIMIT', '2')
      const app = createApp()

      expect((await request(app).post('/api/checkout').send({})).status).toBe(400)
      expect((await request(app).post('/api/checkout').send({})).status).toBe(400)
      const blocked = await request(app).post('/api/checkout').send({})
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('rate_limited')
    })

    it('без настройки лимит — 20 в час, 21-й запрос получает 429', async () => {
      vi.stubEnv('CHECKOUT_RATE_LIMIT', '')
      const app = createApp()

      for (let i = 0; i < 20; i += 1) {
        expect((await request(app).post('/api/checkout').send({})).status).toBe(400)
      }
      expect((await request(app).post('/api/checkout').send({})).status).toBe(429)
    })

    it.each(['/api/checkout//', '/api/checkout/', '/API/CHECKOUT/'])(
      'лимит нельзя обойти другой записью пути «%s»',
      async (path) => {
        vi.stubEnv('CHECKOUT_RATE_LIMIT', '2')
        const app = createApp()

        await request(app).post('/api/checkout').send({})
        await request(app).post(path).send({})

        expect((await request(app).post(path).send({})).status).toBe(429)
      },
    )

    it.each(['0', '-5', 'abc', '2.5', '100000'])(
      'значение «%s» в CHECKOUT_RATE_LIMIT не отключает защиту',
      async (value) => {
        vi.stubEnv('CHECKOUT_RATE_LIMIT', value)
        const app = createApp()

        for (let i = 0; i < 20; i += 1) {
          expect((await request(app).post('/api/checkout').send({})).status).toBe(400)
        }
        expect((await request(app).post('/api/checkout').send({})).status).toBe(429)
      },
    )
  })

  describe('POST /api/checkout: ловушка для ботов', () => {
    it('без ловушки тот же запрос создаёт заказ', async () => {
      const app = createApp()
      const product = await seedProduct()

      const res = await request(app).post('/api/checkout').send(checkoutBody(product.id))

      expect(res.status).toBe(201)
      expect(await AppDataSource.getRepository(Order).count()).toBe(1)
    })

    it('пустая и «пробельная» ловушка заказу не мешает', async () => {
      const app = createApp()
      const product = await seedProduct()

      const empty = await request(app)
        .post('/api/checkout')
        .send(checkoutBody(product.id, { hp_check: '' }))
      const blank = await request(app)
        .post('/api/checkout')
        .send(checkoutBody(product.id, { hp_check: '   ' }))

      expect(empty.status).toBe(201)
      expect(blank.status).toBe(201)
      expect(await AppDataSource.getRepository(Order).count()).toBe(2)
    })

    it.each([
      ['строка', 'http://spam.example'],
      ['число', 1],
      ['true', true],
      ['массив', ['x']],
      ['объект', { a: 1 }],
    ])('заполненная ловушка (%s) — 400 и заказ не создаётся', async (_name, value) => {
      const app = createApp()
      const product = await seedProduct()

      const res = await request(app)
        .post('/api/checkout')
        .send(checkoutBody(product.id, { hp_check: value }))

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('bot_suspected')
      expect(await AppDataSource.getRepository(Order).count()).toBe(0)
    })
  })

  describe('POST /api/auth/login', () => {
    it('отвечает 429 после лимита попыток входа с одного IP', async () => {
      vi.stubEnv('LOGIN_RATE_LIMIT', '2')
      const app = createApp()

      expect((await request(app).post('/api/auth/login').send({})).status).toBe(400)
      expect((await request(app).post('/api/auth/login').send({})).status).toBe(400)
      const blocked = await request(app).post('/api/auth/login').send({})
      expect(blocked.status).toBe(429)
      expect(blocked.body.error.code).toBe('rate_limited')
    })

    it('без настройки лимит — 10 за окно, 11-я попытка получает 429', async () => {
      vi.stubEnv('LOGIN_RATE_LIMIT', '')
      const app = createApp()

      for (let i = 0; i < 10; i += 1) {
        expect((await request(app).post('/api/auth/login').send({})).status).toBe(400)
      }
      expect((await request(app).post('/api/auth/login').send({})).status).toBe(429)
    })

    it.each(['/api/auth//login', '/api/auth/login/', '/API/AUTH/LOGIN'])(
      'лимит нельзя обойти другой записью пути «%s»',
      async (path) => {
        vi.stubEnv('LOGIN_RATE_LIMIT', '2')
        const app = createApp()

        await request(app).post('/api/auth/login').send({})
        await request(app).post(path).send({})

        expect((await request(app).post(path).send({})).status).toBe(429)
      },
    )

    it('лимит не трогает /api/auth/me', async () => {
      vi.stubEnv('LOGIN_RATE_LIMIT', '1')
      const app = createApp()

      await request(app).post('/api/auth/login').send({})
      await request(app).post('/api/auth/login').send({})

      expect((await request(app).get('/api/auth/me')).status).toBe(401)
    })
  })
})
