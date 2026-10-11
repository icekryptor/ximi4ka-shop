import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { createApp } from '../app.js'
import { MetrikaConversion } from '../entities/MetrikaConversion.js'
import { authHeaders, loginAsAdmin, seedOrder } from './testUtils.js'

// Админка показывает, дошла ли оплата заказа до Метрики: без этого владелец
// узнал бы о сломанной отправке только по пустым отчётам спустя недели.

describe('админка: конверсия заказа в Метрику', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
  })
  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })
  beforeEach(async () => {
    app = createApp()
    await AppDataSource.query('TRUNCATE orders, order_items RESTART IDENTITY CASCADE')
  })

  async function detail(orderId: string) {
    const auth = await loginAsAdmin(app)
    return request(app).get(`/api/admin/orders/${orderId}`).set(authHeaders(auth))
  }

  it('нет записи — metrikaConversion: null', async () => {
    const order = await seedOrder({ status: 'paid', paidAt: new Date() })

    const res = await detail(order.id)

    expect(res.status).toBe(200)
    expect(res.body.data.metrikaConversion).toBeNull()
  })

  it('отправленная: статус, цель, сумма, номер загрузки; yclid отдельно не дублируется', async () => {
    const order = await seedOrder({ status: 'paid', paidAt: new Date() })
    const repo = AppDataSource.getRepository(MetrikaConversion)
    await repo.save(
      repo.create({
        orderId: order.id,
        yclid: 'secret-click-id',
        target: 'order_paid',
        priceRub: 1500,
        eventAt: new Date(),
        state: 'sent',
        uploadId: '777',
        sentAt: new Date('2026-10-05T13:00:00.000Z'),
      }),
    )

    const res = await detail(order.id)

    expect(res.body.data.metrikaConversion).toEqual({
      state: 'sent',
      target: 'order_paid',
      priceRub: 1500,
      attempts: 0,
      uploadId: '777',
      sentAt: '2026-10-05T13:00:00.000Z',
      lastError: null,
    })
    expect(JSON.stringify(res.body.data.metrikaConversion)).not.toContain('secret-click-id')
  })

  it('с ошибкой: видно причину и число попыток', async () => {
    const order = await seedOrder({ status: 'paid', paidAt: new Date() })
    const repo = AppDataSource.getRepository(MetrikaConversion)
    await repo.save(
      repo.create({
        orderId: order.id,
        yclid: '1',
        target: 'order_paid',
        priceRub: 1500,
        eventAt: new Date(),
        attempts: 3,
        lastError: 'Metrika 403: Access denied',
      }),
    )

    const res = await detail(order.id)

    expect(res.body.data.metrikaConversion).toMatchObject({
      state: 'pending',
      attempts: 3,
      lastError: 'Metrika 403: Access denied',
    })
  })
})
