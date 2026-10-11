import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { Product } from '../../entities/Product.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, seedCategory, seedYcpProduct, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/basket/check'

function body(items: { id: string; quantity: number }[], extra: Record<string, unknown> = {}) {
  return {
    items,
    offers_id_from_merchant_center: true,
    locality: 'Москва',
    is_health_check: false,
    ...extra,
  }
}

describe('POST /api/v1/checkout/basket/check', () => {
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
      'TRUNCATE products, product_categories, product_images RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('отдаёт цену, остаток-константу и габариты штуки в упаковке', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id, quantity: 1 }]))
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      items: [
        {
          id: p.id,
          name: 'Набор юного химика',
          regular_price: 1500,
          final_price: 1500,
          vat: 0,
          url: `https://new.ximi4ka.ru/product/${p.slug}`,
          warehouses: [{ id: 'msk-1', available_quantity: 99 }],
          dimensions: { width: 100, height: 40, depth: 100, weight: 830 },
          characteristics: [],
          variations: [],
        },
      ],
    })
  })

  it('нет в наличии — товар в ответе с остатком 0', async () => {
    const p = await seedYcpProduct({ stockStatus: 'out_of_stock' })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id, quantity: 1 }]))
    expect(res.body.items[0].warehouses).toEqual([{ id: 'msk-1', available_quantity: 0 }])
  })

  it('без флага, неопубликованный и удалённый не отдаются; если ничего не осталось — 404', async () => {
    const off = await seedYcpProduct({ ycpEnabled: false })
    const draft = await seedYcpProduct({ isPublished: false })
    const gone = await seedYcpProduct()
    await AppDataSource.getRepository(Product).softDelete(gone.id)
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([off, draft, gone].map((p) => ({ id: p.id, quantity: 1 }))))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Products not found' })
  })

  it('не-uuid и неизвестный uuid рядом с настоящим товаром — 200 только с настоящим, без 500', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        body([
          { id: '50', quantity: 1 },
          { id: '00000000-0000-4000-8000-000000000000', quantity: 1 },
          { id: p.id, quantity: 1 },
        ]),
      )
    expect(res.status).toBe(200)
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([p.id])
  })

  it('только не-uuid — 404, а не ошибка базы', async () => {
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: 'not-a-uuid', quantity: 1 }]))
    expect(res.status).toBe(404)
  })

  it('повторяющиеся id складываются; процентная скидка округляется вниз за штуку', async () => {
    const reagent = await seedYcpProduct({ slug: 'sernaya-kislota', priceRub: 119 })
    await seedCategory('reagents', [reagent])
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(
        body([
          { id: reagent.id, quantity: 2 },
          { id: reagent.id, quantity: 3 },
        ]),
      )
    // 5 × 119 = 595, −15 % = 505,75 → строка 506 ₽ на сайте; за штуку 101 ₽.
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ regular_price: 119, final_price: 101 })
  })

  it('цена партии: 5 пробирок за 99 ₽ — 19 ₽ за штуку', async () => {
    const tube = await seedYcpProduct({ slug: 'probirka', priceRub: 25 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: tube.id, quantity: 5 }]))
    expect(res.body.items[0]).toMatchObject({ regular_price: 25, final_price: 19 })
  })

  it('скидка на наборы — целая цена за штуку', async () => {
    const kit = await seedYcpProduct({ slug: 'himichka-30', priceRub: 3099 })
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: kit.id, quantity: 5 }]))
    expect(res.body.items[0]).toMatchObject({ regular_price: 3099, final_price: 2800 })
  })

  it.each([
    ['ноль', [{ id: '00000000-0000-4000-8000-000000000001', quantity: 0 }]],
    ['минус', [{ id: '00000000-0000-4000-8000-000000000001', quantity: -1 }]],
    ['слишком много', [{ id: '00000000-0000-4000-8000-000000000001', quantity: 10_001 }]],
    ['пустой список', []],
  ])('некорректное количество или пустой список (%s) — 400', async (_name, items) => {
    const res = await request(app).post(URL).set(ycpAuth).send(body(items))
    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
  })

  it('is_health_check не меняет ни код, ни тело ответа', async () => {
    const p = await seedYcpProduct()
    const items = [{ id: p.id, quantity: 2 }]
    const real = await request(app).post(URL).set(ycpAuth).send(body(items))
    const check = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body(items, { is_health_check: true }))
    expect(check.status).toBe(real.status)
    expect(check.body).toEqual(real.body)
  })

  it('uuid в верхнем регистре находит товар и возвращает канонический id', async () => {
    const p = await seedYcpProduct()
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(body([{ id: p.id.toUpperCase(), quantity: 1 }]))
    expect(res.status).toBe(200)
    expect(res.body.items[0].id).toBe(p.id)
  })
})
