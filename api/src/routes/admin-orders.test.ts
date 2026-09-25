import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../config/dataSource.js'
import { Order } from '../entities/Order.js'
import { OrderItem } from '../entities/OrderItem.js'
import { OrderNotification } from '../entities/OrderNotification.js'
import { createApp } from '../app.js'
import { authHeaders, loginAsAdmin, type AdminAuth } from './testUtils.js'

let seq = 0
async function seedOrder(overrides: Partial<Order> = {}): Promise<Order> {
  seq += 1
  const repo = AppDataSource.getRepository(Order)
  return repo.save(
    repo.create({
      orderNumber: `XM-2026-7${String(seq).padStart(4, '0')}`,
      status: 'pending',
      customerName: 'Мария Смирнова',
      customerPhone: '+79005556677',
      customerEmail: 'maria@example.com',
      deliveryAddress: { address: 'Казань, ул. Баумана, 5', comment: null },
      deliveryMethod: 'cdek_courier',
      subtotalRub: 4000,
      shippingRub: 500,
      totalRub: 4500,
      paymentProvider: 'manual',
      statusHistory: [],
      ...overrides,
    }),
  )
}

async function seedItem(orderId: string): Promise<OrderItem> {
  const repo = AppDataSource.getRepository(OrderItem)
  return repo.save(
    repo.create({
      orderId,
      productId: '11111111-1111-4111-8111-111111111111',
      productSnapshot: { name: 'Набор «Кристаллы»', sku: 'XIM-042', priceRub: 2000 },
      quantity: 2,
      unitPriceRub: 2000,
    }),
  )
}

describe('Admin orders', () => {
  let app: ReturnType<typeof createApp>
  let auth: AdminAuth

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize()
    app = createApp()
  })

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy()
  })

  beforeEach(async () => {
    await AppDataSource.query(
      'TRUNCATE orders, order_items, admin_sessions, admin_users RESTART IDENTITY CASCADE',
    )
    auth = await loginAsAdmin(app)
  })

  it('lists orders newest-first with pagination', async () => {
    await seedOrder()
    await seedOrder({ status: 'paid', paidAt: new Date() })
    await seedOrder({ status: 'cancelled' })

    const res = await request(app).get('/api/admin/orders?limit=2&offset=0').set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.pagination).toMatchObject({ limit: 2, offset: 0, total: 3 })
  })

  it('filters by status', async () => {
    await seedOrder()
    const paid = await seedOrder({ status: 'paid', paidAt: new Date() })

    const res = await request(app).get('/api/admin/orders?status=paid').set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].id).toBe(paid.id)
  })

  it('фильтрует отправленные заказы', async () => {
    await seedOrder({ status: 'paid', paidAt: new Date() })
    const shipped = await seedOrder({ status: 'shipped', paidAt: new Date() })

    const res = await request(app).get('/api/admin/orders?status=shipped').set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].id).toBe(shipped.id)
  })

  it('returns the detail with items', async () => {
    const order = await seedOrder()
    await seedItem(order.id)

    const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data.orderNumber).toBe(order.orderNumber)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].productSnapshot.name).toBe('Набор «Кристаллы»')
  })

  it('404s for unknown and malformed ids', async () => {
    const missing = await request(app)
      .get('/api/admin/orders/11111111-1111-4111-8111-111111111111')
      .set(authHeaders(auth))
    expect(missing.status).toBe(404)

    const malformed = await request(app).get('/api/admin/orders/not-a-uuid').set(authHeaders(auth))
    expect(malformed.status).toBe(404)
  })

  it('marks a pending order paid with a comment in the history', async () => {
    const order = await seedOrder()
    const res = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'paid', comment: 'Оплата по счёту, платёжка №42' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('paid')
    expect(res.body.data.paidAt).not.toBeNull()
    expect(res.body.data.statusHistory).toEqual([
      expect.objectContaining({
        from: 'pending',
        to: 'paid',
        by: 'admin',
        comment: 'Оплата по счёту, платёжка №42',
      }),
    ])
  })

  it('cancels a pending order', async () => {
    const order = await seedOrder()
    const res = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'cancelled' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('cancelled')
    expect(res.body.data.paidAt).toBeNull()

    const events = await AppDataSource.getRepository(OrderNotification).find({
      where: { orderId: order.id },
    })
    expect(events.map((e) => e.eventKey)).toEqual(['status:cancelled'])
  })

  it('marks a failed order paid (manual override after offline payment)', async () => {
    const order = await seedOrder({ status: 'failed' })
    const res = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'paid' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('paid')
  })

  it('409s on a no-op transition and on changing a paid order', async () => {
    const cancelled = await seedOrder({ status: 'cancelled' })
    const noop = await request(app)
      .patch(`/api/admin/orders/${cancelled.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'cancelled' })
    expect(noop.status).toBe(409)
    expect(noop.body.error.code).toBe('status_unchanged')

    const paid = await seedOrder({ status: 'paid', paidAt: new Date() })
    const res = await request(app)
      .patch(`/api/admin/orders/${paid.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'cancelled' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('order_already_paid')
  })

  it('отмечает оплаченный заказ отправленным и ставит событие', async () => {
    const paid = await seedOrder({ status: 'paid', paidAt: new Date() })
    const res = await request(app)
      .patch(`/api/admin/orders/${paid.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'shipped', comment: 'сдали в ПВЗ' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('shipped')
    const saved = await AppDataSource.getRepository(Order).findOneByOrFail({ id: paid.id })
    expect(saved.statusHistory.at(-1)).toMatchObject({
      from: 'paid',
      to: 'shipped',
      by: 'admin',
      comment: 'сдали в ПВЗ',
    })
    const events = await AppDataSource.getRepository(OrderNotification).find({
      where: { orderId: paid.id },
    })
    expect(events.map((e) => e.eventKey)).toEqual(['status:shipped'])
  })

  it('409, если отправить неоплаченный заказ', async () => {
    const pending = await seedOrder()
    const res = await request(app)
      .patch(`/api/admin/orders/${pending.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'shipped' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('order_not_paid')
  })

  it('409 на изменение отправленного заказа', async () => {
    const shipped = await seedOrder({ status: 'shipped', paidAt: new Date() })
    const res = await request(app)
      .patch(`/api/admin/orders/${shipped.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'cancelled' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('order_already_shipped')
  })

  it('rejects invalid status values with 400', async () => {
    const order = await seedOrder()
    const res = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set(authHeaders(auth))
      .send({ status: 'failed' })
    expect(res.status).toBe(400)
  })

  it('карточка заказа отдаёт состояние уведомлений', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    await repo.save([
      repo.create({
        orderId: order.id,
        channel: 'sheets',
        eventKey: 'created',
        sentAt: new Date(),
        attempts: 1,
      }),
      repo.create({
        orderId: order.id,
        channel: 'telegram',
        eventKey: 'created',
        failedAt: new Date(),
        attempts: 1,
        lastError: 'Telegram 403: Forbidden: bot was kicked from the group chat',
      }),
    ])
    const res = await request(app).get(`/api/admin/orders/${order.id}`).set(authHeaders(auth))
    expect(res.status).toBe(200)
    expect(res.body.data.notifications).toHaveLength(2)
    expect(res.body.data.notifications[1]).toMatchObject({
      channel: 'telegram',
      eventKey: 'created',
      attempts: 1,
      lastError: expect.stringContaining('kicked'),
    })
    expect(res.body.data.notifications[1].failedAt).not.toBeNull()
  })

  it('«Отправить ещё раз» возвращает несданные записи в очередь', async () => {
    const order = await seedOrder()
    const repo = AppDataSource.getRepository(OrderNotification)
    const sent = await repo.save(
      repo.create({
        orderId: order.id,
        channel: 'sheets',
        eventKey: 'created',
        sentAt: new Date(),
        attempts: 1,
      }),
    )
    const failed = await repo.save(
      repo.create({
        orderId: order.id,
        channel: 'telegram',
        eventKey: 'created',
        failedAt: new Date(),
        attempts: 3,
        lastError: 'x',
      }),
    )
    const res = await request(app)
      .post(`/api/admin/orders/${order.id}/notifications/retry`)
      .set(authHeaders(auth))
    expect(res.status).toBe(200)
    const retried = await repo.findOneByOrFail({ id: failed.id })
    expect(retried).toMatchObject({ failedAt: null, attempts: 0, lastError: null })
    expect(retried.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect((await repo.findOneByOrFail({ id: sent.id })).sentAt).not.toBeNull()
  })

  it('404 на повтор для неизвестного заказа', async () => {
    const res = await request(app)
      .post('/api/admin/orders/00000000-0000-4000-8000-000000000999/notifications/retry')
      .set(authHeaders(auth))
    expect(res.status).toBe(404)
  })

  it('rejects missing auth (401) and missing CSRF (403)', async () => {
    const order = await seedOrder()
    const unauth = await request(app).get('/api/admin/orders')
    expect(unauth.status).toBe(401)

    const noCsrf = await request(app)
      .patch(`/api/admin/orders/${order.id}/status`)
      .set('Cookie', `${auth.sessionCookie}; ${auth.csrfCookie}`)
      .send({ status: 'paid' })
    expect(noCsrf.status).toBe(403)
  })
})
