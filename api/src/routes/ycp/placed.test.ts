import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { markYcpOrderPlaced } from '../../lib/ycp/orders.js'
import { applyYcpTestEnv, createYcpCheckout, ycpAuth } from './testHelpers.js'

const URL = '/api/v1/checkout/placed'

function placed(sessionId: string, extra: Record<string, unknown> = {}) {
  return {
    session_id: sessionId,
    order_id: 'ya-order-1',
    order_number: 1234,
    payment_method: 'online',
    online_payment_method: 'split',
    acquiring_id: 'acq-1',
    ...extra,
  }
}

describe('POST /api/v1/checkout/placed', () => {
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
      'TRUNCATE orders, order_items, products, cdek_shipments RESTART IDENTITY CASCADE',
    )
    applyYcpTestEnv((k, v) => vi.stubEnv(k, v))
    vi.stubEnv('CDEK_ORDERS_ENABLED', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const reload = (id: string) => AppDataSource.getRepository(Order).findOneByOrFail({ id })
  const events = (orderId: string) =>
    AppDataSource.getRepository(OrderNotification).findBy({ orderId })
  const shipments = (orderId: string) =>
    AppDataSource.getRepository(CdekShipment).countBy({ orderId })

  it('онлайн-оплата: заказ оплачен, событие paid в таблицу и чат, отправка в очередь СДЭК', async () => {
    const order = await createYcpCheckout(app, 'sess-1')
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-1'))
    expect(res.status).toBe(200)
    expect(res.text).toBe('')
    const fresh = await reload(order.id)
    expect(fresh).toMatchObject({
      status: 'paid',
      paymentIntentId: 'acq-1',
      externalOrderId: 'ya-order-1',
    })
    expect(fresh.paidAt).not.toBeNull()
    expect(fresh.statusHistory).toEqual([
      expect.objectContaining({
        from: 'pending',
        to: 'paid',
        by: 'ycp',
        comment: 'Оплата в Яндексе: split',
      }),
    ])
    expect(
      (await events(order.id))
        .filter((e) => e.eventKey === 'status:paid')
        .map((e) => e.channel)
        .sort(),
    ).toEqual(['sheets', 'telegram'])
    expect(await shipments(order.id)).toBe(1)
  })

  it('устаревшие query-параметры вместо тела тоже принимаются', async () => {
    const order = await createYcpCheckout(app, 'sess-q')
    const res = await request(app)
      .post(`${URL}?session_id=sess-q&order_id=ya-order-q&payment_method=online`)
      .set(ycpAuth)
      .send({})
    expect(res.status).toBe(200)
    expect((await reload(order.id)).status).toBe('paid')
  })

  it('повтор для оплаченного заказа — 200 без побочных эффектов', async () => {
    const order = await createYcpCheckout(app, 'sess-2')
    await request(app).post(URL).set(ycpAuth).send(placed('sess-2'))
    const again = await request(app).post(URL).set(ycpAuth).send(placed('sess-2'))
    expect(again.status).toBe(200)
    expect((await reload(order.id)).statusHistory).toHaveLength(1)
    expect(await shipments(order.id)).toBe(1)
  })

  it('два одновременных вызова — одна запись истории, одна пара событий, одна отправка', async () => {
    const order = await createYcpCheckout(app, 'sess-3')
    const results = await Promise.all([
      request(app).post(URL).set(ycpAuth).send(placed('sess-3')),
      request(app).post(URL).set(ycpAuth).send(placed('sess-3')),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect((await reload(order.id)).statusHistory).toHaveLength(1)
    expect((await events(order.id)).filter((e) => e.eventKey === 'status:paid')).toHaveLength(2)
    expect(await shipments(order.id)).toBe(1)
  })

  // Дубли событий и отправки гасит и уникальный индекс, поэтому предыдущий тест
  // блокировку строки не доказывает. Её видно по исходам: без FOR UPDATE оба
  // вызова прочитали бы pending и оба вернули бы paid.
  it('два одновременных вызова: оплачивает один, второй под блокировкой видит уже оплаченный', async () => {
    await createYcpCheckout(app, 'sess-lock')
    const input = {
      sessionId: 'sess-lock',
      orderId: 'ya-order-1',
      paymentMethod: 'online' as const,
      onlinePaymentMethod: 'card',
      acquiringId: 'acq-1',
    }
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => markYcpOrderPlaced({ ...input })),
    )
    expect(outcomes.filter((o) => o === 'paid')).toHaveLength(1)
    expect(outcomes.filter((o) => o === 'already_paid')).toHaveLength(3)
  })

  it('до /checkout (сессии нет) — 404, Яндекс повторит', async () => {
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-unknown'))
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Order not found' })
  })

  it('отменённый заказ — 409, статус не меняется', async () => {
    const order = await createYcpCheckout(app, 'sess-4')
    await AppDataSource.getRepository(Order).update(order.id, { status: 'cancelled' })
    const res = await request(app).post(URL).set(ycpAuth).send(placed('sess-4'))
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Order already cancelled' })
    expect((await reload(order.id)).status).toBe('cancelled')
  })

  it('оплата при получении — 409, заказ не оплачен, один сигнал менеджеру', async () => {
    const order = await createYcpCheckout(app, 'sess-5')
    const body = placed('sess-5', {
      payment_method: 'on_delivery',
      online_payment_method: undefined,
      acquiring_id: undefined,
    })
    const res = await request(app).post(URL).set(ycpAuth).send(body)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Payment on delivery is not supported' })
    await request(app).post(URL).set(ycpAuth).send(body)
    const fresh = await reload(order.id)
    expect(fresh.status).toBe('pending')
    expect(fresh.externalOrderId).toBe('ya-order-1')
    expect(
      (await events(order.id))
        .filter((e) => e.eventKey === 'ycp:on_delivery')
        .map((e) => e.channel),
    ).toEqual(['telegram'])
    expect(await shipments(order.id)).toBe(0)
  })

  it('неизвестный payment_method — 400', async () => {
    await createYcpCheckout(app, 'sess-6')
    const res = await request(app)
      .post(URL)
      .set(ycpAuth)
      .send(placed('sess-6', { payment_method: 'cash' }))
    expect(res.status).toBe(400)
  })
})
