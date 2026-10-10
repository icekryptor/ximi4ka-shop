import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { AppDataSource } from '../../config/dataSource.js'
import { CdekShipment } from '../../entities/CdekShipment.js'
import { Order } from '../../entities/Order.js'
import { OrderNotification } from '../../entities/OrderNotification.js'
import { createApp } from '../../app.js'
import { applyYcpTestEnv, createYcpCheckout, ycpAuth } from './testHelpers.js'

describe('отмены из Яндекса', () => {
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
  const alerts = async (orderId: string) =>
    (await AppDataSource.getRepository(OrderNotification).findBy({ orderId })).filter(
      (e) => e.eventKey === 'ycp:cancel_after_ship',
    )

  async function paidOrder(sessionId: string): Promise<Order> {
    const order = await createYcpCheckout(app, sessionId)
    const res = await request(app)
      .post('/api/v1/checkout/placed')
      .set(ycpAuth)
      .send({
        session_id: sessionId,
        order_id: `ya-${sessionId}`,
        order_number: 1,
        payment_method: 'online',
        acquiring_id: 'acq-1',
      })
    expect(res.status).toBe(200)
    return reload(order.id)
  }

  describe('POST /api/v1/checkout/cancel', () => {
    it('неоплаченная сессия отменяется, событие cancelled в таблицу', async () => {
      const order = await createYcpCheckout(app, 'sess-c1')
      const res = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c1').set(ycpAuth)
      expect(res.status).toBe(200)
      expect(res.text).toBe('')
      const fresh = await reload(order.id)
      expect(fresh.status).toBe('cancelled')
      expect(fresh.statusHistory.at(-1)).toMatchObject({ to: 'cancelled', by: 'ycp' })
      const keys = (
        await AppDataSource.getRepository(OrderNotification).findBy({ orderId: order.id })
      ).map((e) => e.eventKey)
      expect(keys).toContain('status:cancelled')
    })

    it('оплаченный заказ не меняется — 200', async () => {
      const order = await paidOrder('sess-c2')
      const res = await request(app).post('/api/v1/checkout/cancel?session_id=sess-c2').set(ycpAuth)
      expect(res.status).toBe(200)
      expect((await reload(order.id)).status).toBe('paid')
    })

    it('нет сессии — 404; нет session_id — 400', async () => {
      const missing = await request(app)
        .post('/api/v1/checkout/cancel?session_id=nope')
        .set(ycpAuth)
      expect(missing.status).toBe(404)
      expect(missing.body).toEqual({ error: 'Session not found' })
      const bad = await request(app).post('/api/v1/checkout/cancel').set(ycpAuth)
      expect(bad.status).toBe(400)
    })
  })

  describe('POST /api/v1/order/cancel', () => {
    it('оплаченный заказ без отправки в СДЭК — отменён, сигнала нет', async () => {
      const order = await paidOrder('sess-o1')
      const res = await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o1').set(ycpAuth)
      expect(res.status).toBe(200)
      expect(res.text).toBe('')
      expect((await reload(order.id)).status).toBe('cancelled')
      expect(await alerts(order.id)).toHaveLength(0)
    })

    it('отправка в СДЭК уже создана — заказ отменён, менеджеру сигнал (один на повторы)', async () => {
      const order = await paidOrder('sess-o2')
      await AppDataSource.getRepository(CdekShipment).update(
        { orderId: order.id },
        { state: 'created', cdekUuid: '11111111-1111-4111-8111-111111111111', cdekNumber: '1000' },
      )
      const url = '/api/v1/order/cancel?order_id=ya-sess-o2'
      expect((await request(app).post(url).set(ycpAuth)).status).toBe(200)
      expect((await request(app).post(url).set(ycpAuth)).status).toBe(200)
      expect((await reload(order.id)).status).toBe('cancelled')
      expect((await alerts(order.id)).map((a) => a.channel)).toEqual(['telegram'])
    })

    it('отправка ещё в очереди — сигнала нет: обработчик СДЭК отменённый заказ не отправит', async () => {
      const order = await paidOrder('sess-o3')
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o3').set(ycpAuth)
      expect(await alerts(order.id)).toHaveLength(0)
    })

    it('очередь после неудачной попытки без uuid — POST мог дойти до СДЭК: сигнал, один на повторы', async () => {
      const order = await paidOrder('sess-o6')
      await AppDataSource.getRepository(CdekShipment).update(
        { orderId: order.id },
        { state: 'queued', attempts: 1, cdekUuid: null, submittedAt: null },
      )
      const url = '/api/v1/order/cancel?order_id=ya-sess-o6'
      await request(app).post(url).set(ycpAuth)
      await request(app).post(url).set(ycpAuth)
      expect((await reload(order.id)).status).toBe('cancelled')
      expect(await alerts(order.id)).toHaveLength(1)
    })

    it('заказ уже отправлен (shipped) — отменён с сигналом', async () => {
      const order = await paidOrder('sess-o4')
      await AppDataSource.getRepository(Order).update(order.id, { status: 'shipped' })
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o4').set(ycpAuth)
      expect((await reload(order.id)).status).toBe('cancelled')
      expect(await alerts(order.id)).toHaveLength(1)
    })

    it('неизвестный order_id — 404', async () => {
      const res = await request(app).post('/api/v1/order/cancel?order_id=nope').set(ycpAuth)
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Order not found' })
    })

    it('после отмены placed отвечает 409', async () => {
      await paidOrder('sess-o5')
      await request(app).post('/api/v1/order/cancel?order_id=ya-sess-o5').set(ycpAuth)
      const res = await request(app).post('/api/v1/checkout/placed').set(ycpAuth).send({
        session_id: 'sess-o5',
        order_id: 'ya-sess-o5',
        order_number: 1,
        payment_method: 'online',
      })
      expect(res.status).toBe(409)
    })
  })
})
