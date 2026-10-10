import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { AppDataSource } from '../config/dataSource.js'
import { Product } from './Product.js'
import { Order } from './Order.js'
import { seedOrder } from '../routes/testUtils.js'

describe('поля YCP в схеме (миграция AddYcpFields)', () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, products, ycp_pickup_points_snapshot RESTART IDENTITY CASCADE',
    )
  })

  it('товар по умолчанию без кнопки Яндекса', async () => {
    const repo = AppDataSource.getRepository(Product)
    const saved = await repo.save(
      repo.create({
        slug: 'kit-ycp',
        name: 'Набор',
        priceRub: 100,
        longDescriptionBlocks: [],
        translations: {},
      }),
    )
    expect((await repo.findOneByOrFail({ id: saved.id })).ycpEnabled).toBe(false)
  })

  it('заказ по умолчанию с сайта, без внешних идентификаторов', async () => {
    const order = await seedOrder()
    const fresh = await AppDataSource.getRepository(Order).findOneByOrFail({ id: order.id })
    expect(fresh).toMatchObject({ source: 'site', externalSessionId: null, externalOrderId: null })
  })

  it('session_id Яндекса уникален, а пустые значения друг другу не мешают', async () => {
    await seedOrder({ source: 'ycp', externalSessionId: 'sess-1' })
    await expect(seedOrder({ source: 'ycp', externalSessionId: 'sess-1' })).rejects.toMatchObject({
      code: '23505',
    })
    await seedOrder()
    await seedOrder()
    expect(await AppDataSource.getRepository(Order).count()).toBe(3)
  })

  it('снимок пунктов выдачи — ровно одна строка с id = 1', async () => {
    await AppDataSource.query(
      `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (1, '[]', now())`,
    )
    await expect(
      AppDataSource.query(
        `INSERT INTO ycp_pickup_points_snapshot (id, entries, built_at) VALUES (2, '[]', now())`,
      ),
    ).rejects.toThrow()
  })
})
